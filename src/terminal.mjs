// terminal — the terminal-specific effect boundary. It owns the reversible session state,
// raw-byte input, observable terminal capabilities, resize forwarding, and output writes. It
// intentionally knows nothing about cells, pixels, layout, widgets, projectors, or applications.

import { EventEmitter } from "node:events";

const ESC = "\x1b";

export const enterAlternateScreen = `${ESC}[?1049h`;
export const leaveAlternateScreen = `${ESC}[?1049l`;
export const hideCursor = `${ESC}[?25l`;
export const showCursor = `${ESC}[?25h`;
export const resetStyle = `${ESC}[0m`;
export const clearScreen = `${ESC}[2J`;
export const cursorHome = `${ESC}[H`;

const CSI_NAMES = Object.freeze({
  A: "up", B: "down", C: "right", D: "left",
  H: "home", F: "end",
  "1~": "home", "2~": "insert", "3~": "delete", "4~": "end",
  "5~": "pageup", "6~": "pagedown",
});

const KITTY_PROGRAMS = ["kitty", "ghostty", "wezterm", "konsole"];
const SIXEL_PROGRAMS = ["mlterm", "xterm", "foot", "wezterm", "contour", "mintty", "yaft"];

export const GRAPHICS_PROTOCOLS = Object.freeze(["kitty", "sixel", "none"]);

const has = (value, part) => typeof value === "string" && value.toLowerCase().includes(part);

function key(name, extra = {}) {
  return {
    name,
    char: extra.char,
    ctrl: !!extra.ctrl,
    meta: !!extra.meta,
    shift: !!extra.shift,
    raw: extra.raw,
  };
}

// parseKey(seq) — decode one VT/xterm key sequence into a renderer-neutral event.
export function parseKey(seq) {
  const raw = seq;
  if (seq[0] === ESC) {
    if (seq.length === 1) return key("escape", { raw });
    if (seq[1] === "[" || seq[1] === "O") {
      const body = seq.slice(2);
      const match = body.match(/^(\d*)(;\d+)?([A-Z~])$/);
      if (!match) return key("unknown", { raw });
      const [, number, modifier, final] = match;
      const lookup = final === "~" ? `${number}~` : final;
      return key(CSI_NAMES[lookup] || CSI_NAMES[final] || "unknown", {
        raw,
        shift: modifier === ";2",
      });
    }
    return { ...parseKey(seq.slice(1)), meta: true, raw };
  }
  if (seq === "\r" || seq === "\n") return key("enter", { raw });
  if (seq === "\t") return key("tab", { raw });
  if (seq === "\x7f" || seq === "\b") return key("backspace", { raw });
  if (seq === " ") return key("space", { char: " ", raw });
  const code = seq.charCodeAt(0);
  if (code >= 1 && code <= 26 && seq.length === 1) {
    return key("char", { char: String.fromCharCode(code + 96), ctrl: true, raw });
  }
  if (seq.length >= 1 && code >= 0x20) return key("char", { char: seq, raw });
  return key("unknown", { raw });
}

// Read a VT key stream without assuming that a terminal emits each escape sequence in one
// data event. A CSI or lone ESC at the end remains pending until another chunk arrives or the
// keyboard's short escape settling window elapses. The public splitKeys() still finalizes a
// complete string synchronously; both paths use precisely this same scanner.
function scanKeys(s, final) {
  const keys = [];
  let index = 0;
  while (index < s.length) {
    if (s[index] !== ESC) {
      const point = s.codePointAt(index);
      const length = point > 0xffff ? 2 : 1;
      // Preserve a supplementary Unicode character when its UTF-16 halves arrive separately.
      if (!final && length === 1 && point >= 0xd800 && point <= 0xdbff && index + 1 === s.length) break;
      keys.push(s.slice(index, index + length));
      index += length;
      continue;
    }

    const second = s[index + 1];
    if (second === undefined) {
      if (!final) break; // lone ESC may be the start of an arrow or meta sequence
      keys.push(ESC);
      index++;
      continue;
    }

    if (second === "[" || second === "O") {
      let end = index + 2;
      while (end < s.length && !/[A-Za-z~]/u.test(s[end])) end++;
      if (end === s.length && !final) break;
      if (end < s.length) end++;
      keys.push(s.slice(index, end));
      index = end;
      continue;
    }

    // Meta + a Unicode code point; a split surrogate pair must not become two keys.
    const point = s.codePointAt(index + 1);
    const length = point > 0xffff ? 2 : 1;
    if (!final && length === 1 && point >= 0xd800 && point <= 0xdbff && index + 2 === s.length) break;
    keys.push(s.slice(index, index + 1 + length));
    index += 1 + length;
  }
  return { keys, pending: s.slice(index) };
}

export function splitKeys(s) {
  return scanKeys(s, true).keys;
}

const ESCAPE_SETTLE_MS = 40;

// Keyboard — reversible raw-mode adapter that emits normalized key and interrupt events.
export class Keyboard extends EventEmitter {
  constructor(stream = process.stdin) {
    super();
    this.stream = stream;
    this._started = false;
    this._pending = "";
    this._pendingTimer = null;
    this._emitSequences = (sequences) => {
      for (const sequence of sequences) {
        const event = parseKey(sequence);
        this.emit("key", event);
        if (event.name === "char" && event.ctrl && event.char === "c") this.emit("interrupt", event);
      }
    };
    this._flushPending = () => {
      if (!this._pending) return;
      const { keys } = scanKeys(this._pending, true);
      this._pending = "";
      this._emitSequences(keys);
    };
    this._onData = (chunk) => {
      if (this._pendingTimer) {
        clearTimeout(this._pendingTimer);
        this._pendingTimer = null;
      }
      const { keys, pending } = scanKeys(this._pending + String(chunk), false);
      this._pending = pending;
      this._emitSequences(keys);
      if (this._pending) {
        // A bare Escape key must still be usable on its own. The settling window gives a
        // multi-chunk arrow/Meta key time to complete, then emits an honest Escape/unknown.
        this._pendingTimer = setTimeout(() => {
          this._pendingTimer = null;
          this._flushPending();
        }, ESCAPE_SETTLE_MS);
        this._pendingTimer.unref?.();
      }
    };
  }

  start() {
    if (this._started) return this;
    if (this.stream.isTTY && this.stream.setRawMode) this.stream.setRawMode(true);
    // Attach before resuming: a synchronous producer must not lose its first data event.
    this.stream.setEncoding?.("utf8");
    this.stream.on?.("data", this._onData);
    this._started = true;
    this.stream.resume?.();
    return this;
  }

  stop() {
    if (!this._started) return this;
    this._started = false;
    this.stream.off?.("data", this._onData);
    if (this._pendingTimer) {
      clearTimeout(this._pendingTimer);
      this._pendingTimer = null;
    }
    this._flushPending();
    if (this.stream.isTTY && this.stream.setRawMode) this.stream.setRawMode(false);
    this.stream.pause?.();
    return this;
  }
}

// detectTerminalCapabilities(env, options) — pure terminal classification. A caller may give its
// own override value and name, preserving a layer-specific UX without reproducing the detector.
export function detectTerminalCapabilities(env = process.env, options = {}) {
  const override = options.graphicsOverride ?? env.TERMINAL_USER_INTERFACE_GRAPHICS;
  const overrideName = options.overrideName || "TERMINAL_USER_INTERFACE_GRAPHICS";
  if (override && GRAPHICS_PROTOCOLS.includes(override)) {
    return { graphics: override, why: `forced via ${overrideName}=${override}` };
  }

  const term = env.TERM || "";
  const program = env.TERM_PROGRAM || "";
  if (env.KITTY_WINDOW_ID || has(term, "kitty")) {
    return { graphics: "kitty", why: "kitty signature ($KITTY_WINDOW_ID/$TERM)" };
  }
  if (KITTY_PROGRAMS.some((name) => has(program, name))) {
    return { graphics: "kitty", why: `TERM_PROGRAM=${program}` };
  }
  if (SIXEL_PROGRAMS.some((name) => has(program, name) || has(term, name))) {
    return { graphics: "sixel", why: "sixel-capable program/TERM" };
  }
  return { graphics: "none", why: "no raster signature in env — text fallback" };
}

// probeTerminal(stream, env, options) — live capability observation, gated by a real TTY.
export function probeTerminal(stream = process.stdout, env = process.env, options = {}) {
  const tty = !!stream?.isTTY;
  if (!tty) return { graphics: "none", why: "stdout is not a TTY (piped/redirected)", tty };
  return { ...detectTerminalCapabilities(env, options), tty };
}

export class TerminalSession {
  constructor(options = {}) {
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.keyboard = options.keyboard || new Keyboard(this.input);
    this.capabilities = probeTerminal(this.output, options.env || process.env, options);
    this._started = false;
    this._resizeHandlers = new Set();
    this._beforeStopHandlers = new Set();
    this._onResize = () => {
      for (const handler of this._resizeHandlers) handler(this.size());
    };
    this._onExit = () => this.stop();
  }

  get started() { return this._started; }
  get columns() { return this.output.columns || 80; }
  get rows() { return this.output.rows || 24; }
  size() { return { columns: this.columns, rows: this.rows }; }

  write(bytes) {
    if (bytes) this.output.write(bytes);
    return this;
  }

  start() {
    if (this._started) return this;
    this._started = true;
    this.write(enterAlternateScreen + hideCursor + clearScreen + cursorHome);
    this.keyboard.start();
    this.output.on?.("resize", this._onResize);
    process.on("exit", this._onExit);
    return this;
  }

  stop() {
    if (!this._started) return this;
    this._started = false;
    this.keyboard.stop();
    this.output.off?.("resize", this._onResize);
    process.off?.("exit", this._onExit);
    try {
      for (const handler of this._beforeStopHandlers) handler(this);
    } finally {
      this.write(resetStyle + showCursor + leaveAlternateScreen);
    }
    return this;
  }

  onKey(handler) { this.keyboard.on("key", handler); return this; }
  onInterrupt(handler) { this.keyboard.on("interrupt", handler); return this; }
  onResize(handler) { this._resizeHandlers.add(handler); return this; }
  offResize(handler) { this._resizeHandlers.delete(handler); return this; }
  beforeStop(handler) { this._beforeStopHandlers.add(handler); return this; }
  offBeforeStop(handler) { this._beforeStopHandlers.delete(handler); return this; }
}
