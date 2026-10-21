# @red-cup-engineering/terminal-user-interface-engine

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

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
