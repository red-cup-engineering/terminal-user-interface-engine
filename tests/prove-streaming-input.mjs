// Streaming terminal input: arrow/Meta/UTF-8 events are not guaranteed to arrive atomically.
// Exercise the actual shared Keyboard used by Arnold, Daleske, and other terminal consumers.
import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Keyboard, splitKeys } from "../src/terminal.mjs";

test("fragmented CSI arrow emits exactly one arrow, not Escape + printable bytes", () => {
  const stream = new EventEmitter();
  const keyboard = new Keyboard(stream);
  const keys = [];
  keyboard.on("key", event => keys.push(event));
  keyboard.start();
  stream.emit("data", "\x1b");
  stream.emit("data", "[");
  stream.emit("data", "A");
  stream.emit("data", "x");
  assert.deepEqual(keys.map(event => event.name), ["up", "char"]);
  assert.equal(keys[0].raw, "\x1b[A");
  assert.equal(keys[1].char, "x");
  keyboard.stop();
});

test("lone Escape is delivered after the short sequence-settling window", async () => {
  const stream = new EventEmitter();
  const keyboard = new Keyboard(stream);
  const keys = [];
  keyboard.on("key", event => keys.push(event));
  keyboard.start();
  stream.emit("data", "\x1b");
  assert.deepEqual(keys, []);
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.deepEqual(keys.map(event => event.name), ["escape"]);
  keyboard.stop();
});

test("incomplete CSI is not silently dropped when a keyboard stops", () => {
  const stream = new EventEmitter();
  const keyboard = new Keyboard(stream);
  const keys = [];
  keyboard.on("key", event => keys.push(event));
  keyboard.start();
  stream.emit("data", "\x1b[");
  keyboard.stop();
  assert.deepEqual(keys.map(event => event.name), ["unknown"]);
  assert.equal(keys[0].raw, "\x1b[");
});

test("fragmented Meta key and Ctrl-C preserve their meanings", () => {
  const stream = new EventEmitter();
  const keyboard = new Keyboard(stream);
  const keys = [];
  let interrupts = 0;
  keyboard.on("key", event => keys.push(event));
  keyboard.on("interrupt", () => interrupts++);
  keyboard.start();
  stream.emit("data", "\x1b");
  stream.emit("data", "x");
  stream.emit("data", "\x03");
  assert.equal(keys[0].meta, true);
  assert.equal(keys[0].char, "x");
  assert.equal(keys[1].ctrl, true);
  assert.equal(keys[1].char, "c");
  assert.equal(interrupts, 1);
  keyboard.stop();
});

test("terminal input keeps Chinese characters and emoji as entire code points", () => {
  assert.deepEqual(splitKeys("汉字😀"), ["汉", "字", "😀"]);
  const stream = new EventEmitter();
  const keyboard = new Keyboard(stream);
  const keys = [];
  keyboard.on("key", event => keys.push(event));
  keyboard.start();
  stream.emit("data", "\ud83d");
  stream.emit("data", "\ude00");
  assert.deepEqual(keys.map(event => event.char), ["😀"]);
  keyboard.stop();
});
