// prove-input — terminal input stays renderer-neutral: Arnold and Daleske consume this one parser.

import { parseKey, splitKeys } from "../src/terminal.mjs";
import { ok, eq, done } from "./_harness.mjs";

eq(parseKey("a").name, "char", "a printable byte is a char");
eq(parseKey("a").char, "a", "a char carries its literal code point");
ok(!parseKey("a").ctrl, "a plain char is not ctrl");

eq(parseKey("\r").name, "enter", "CR is enter");
eq(parseKey("\n").name, "enter", "LF is enter");
eq(parseKey("\t").name, "tab", "TAB is tab");
eq(parseKey("\x7f").name, "backspace", "DEL is backspace");
eq(parseKey(" ").name, "space", "space byte is space");

eq(parseKey("\x03"), { name: "char", char: "c", ctrl: true, meta: false, shift: false, raw: "\x03" }, "ctrl-c decodes to a ctrl 'c'");
eq(parseKey("\x01").char, "a", "ctrl-a decodes to a ctrl 'a'");
ok(parseKey("\x01").ctrl, "ctrl-a is flagged ctrl");

eq(parseKey("\x1b[A").name, "up", "ESC [ A is up");
eq(parseKey("\x1b[B").name, "down", "ESC [ B is down");
eq(parseKey("\x1b[C").name, "right", "ESC [ C is right");
eq(parseKey("\x1b[D").name, "left", "ESC [ D is left");
eq(parseKey("\x1b[H").name, "home", "ESC [ H is home");
eq(parseKey("\x1b[F").name, "end", "ESC [ F is end");
eq(parseKey("\x1b[3~").name, "delete", "ESC [ 3 ~ is delete");
eq(parseKey("\x1b[5~").name, "pageup", "ESC [ 5 ~ is pageup");
eq(parseKey("\x1b[6~").name, "pagedown", "ESC [ 6 ~ is pagedown");

eq(parseKey("\x1b").name, "escape", "a lone ESC is escape");
const meta = parseKey("\x1bx");
ok(meta.meta === true && meta.char === "x", "ESC + char is a meta-char");
eq(parseKey("\x1b[1;2A"), { name: "up", char: undefined, ctrl: false, meta: false, shift: true, raw: "\x1b[1;2A" }, "ESC [ 1 ; 2 A is shift-up");

eq(splitKeys("\x1b[A"), ["\x1b[A"], "splitKeys keeps a CSI arrow as one key");
eq(splitKeys("abc"), ["a", "b", "c"], "splitKeys streams typed text one char per key");
eq(splitKeys("a\x1b[Bc"), ["a", "\x1b[B", "c"], "splitKeys separates a char, an arrow, and a char");
eq(splitKeys("\x1b[3~"), ["\x1b[3~"], "splitKeys keeps a tilde-terminated sequence whole");

done("prove-input");
