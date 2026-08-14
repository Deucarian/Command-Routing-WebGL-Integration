# Changelog

## [0.1.1] - 2026-08-14

- Pinned the retryable, exception-safe Command Routing bridge lifecycle used by
  browser transport hosts during Stop and Dispose.

## [0.1.0] - 2026-08-14

- Added secure direct-page and iframe transports for Command Routing.
- Added ready handshake, endpoint-correlated responses, lifecycle cleanup,
  diagnostics, editor configuration, tests, and a browser harness.
- Deferred the transport-ready signal until bridge startup completes and
  suppressed stale notifications after stop, dispose, or replacement.
- Added terminal dispose-before-start semantics, connection generations,
  downtime queue replay, explicit oversize/stale errors, and executable coverage
  of the complete browser host API.
- Added a source/origin-validated readiness probe for host recreation after the
  Unity transport is already running.
- Added per-document host sessions so iframe navigation can safely restart at
  generation 1 and stale responses/events/errors are rejected.
