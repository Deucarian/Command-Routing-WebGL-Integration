# Browser host

`DeucarianCommandHost` is the matching host-side adapter for both same-page and
iframe builds. In iframe mode pass the iframe element (or its `contentWindow`)
and the exact viewer origin. The adapter validates both `event.source` and
`event.origin`, keeps a bounded FIFO while the current connection is unavailable,
and removes every listener from `dispose()`.

Each iframe document gets a unique host session, and each Unity transport
installation publishes a monotonically increasing connection generation. An
iframe load or transport-unavailable event resets readiness; commands accepted
during that downtime remain queued and are replayed only after a matching
session/generation handshake. Stale responses, events, and errors are rejected.
Oversize commands fail synchronously with
`message_too_large`, while the Unity adapter returns `deucarian-command-error` for
oversize or stale-generation messages sent by non-canonical hosts. `dispose()` is
terminal, including when called before `start()`.

`start()`, iframe reload, and `replaceTarget()` send a readiness probe carrying
the host session. This lets a new host discover a Unity transport that was
already running before the host attached, lets a newly navigated iframe safely
restart at generation 1, and does not weaken source or origin validation.

The module intentionally exports only the canonical `DeucarianCommandHost`.
Application-specific legacy `SendMessage` compatibility belongs in the
consumer, not in this transport package.
