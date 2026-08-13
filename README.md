# Deucarian Command Routing WebGL Integration

`com.deucarian.command-routing.webgl-integration` implements
`ICommandTransport` for Unity WebGL without introducing another command
protocol. Canonical Command Routing envelopes enter from either a directly
embedded page or an iframe parent; encoded results return to the originating
endpoint.

## Security and lifecycle

- Iframe mode accepts only exact configured HTTP(S) origins and only the parent
  window. `*` is rejected for both receive and send configuration.
- Direct-page mode uses scoped browser events and does not use `postMessage`.
- `Start`, `Stop`, and `Dispose` are idempotent. `Stop` removes the JavaScript
  listener and endpoint table.
- A `deucarian-command-ready` transport handshake tells hosts when queued
  commands may flush. Application readiness remains an application event.
- Payload contents, credentials, and exception text are never logged or exposed
  through diagnostics.

## Composition

Create `WebGlCommandTransportOptions`, add a
`WebGlCommandTransportBehaviour` with a unique transport ID, and pass its
`Transport` into `CommandTransportBridge<TContext>`. The optional
`WebGlCommandRoutingHost<TContext>` composes these pieces explicitly for code
that does not need a custom lifetime owner.

For iframe embedding, pass the exact parent origin. For direct embedding, use
`Browser~/deucarian-command-host.js`; it queues commands until the ready
event and can be attached to a `unityInstance`.

The reusable browser protocol uses `deucarian-command-host` as its inbound
source and `deucarian-command-transport` as its outbound source. It carries no
Report Viewer or Activity Viewer command names. Responses are restricted to the
originating direct endpoint or configured parent endpoint. Applications can
publish named events through `PublishEventAsync` without routing them as fake
commands.

The sample contains no credentials. Hosts must deliver tokens through an
application command after the handshake, never through a query string.
