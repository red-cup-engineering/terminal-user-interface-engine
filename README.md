# @red-cup-engineering/terminal-user-interface-engine

The one owner of a terminal session. It enters and restores the alternate
screen, normalizes raw keyboard bytes into key events, observes terminal
capabilities, forwards resize events, and writes submitted bytes.

It deliberately does not define a screen model, layout, widgets, a graphics
encoder, a projector, application loop, transport, or domain state. Those are
consumers of this boundary:

- `@red-cup-engineering/arnold` supplies the diffed cell/tiling layer.
- `@red-cup-engineering/daleske` supplies the raster graphics layer.
- interface systems such as Wheatstone compose one of those layers with a
  domain and transport.

Import `TerminalSession` for lifecycle and I/O, `Keyboard` / `parseKey` for
input, and `detectTerminalCapabilities` / `probeTerminal` for pure or live
capability observation.
