# Changelog

## [0.1.0] - 2026-08-14

- Added secure direct-page and iframe transports for Command Routing.
- Added ready handshake, endpoint-correlated responses, lifecycle cleanup,
  diagnostics, editor configuration, tests, and a browser harness.
- Deferred the transport-ready signal until bridge startup completes and
  suppressed stale notifications after stop, dispose, or replacement.
