# Deucarian Command Routing WebGL Integration

`com.deucarian.command-routing.webgl-integration` implements
`ICommandTransport` for Unity WebGL without introducing another command
protocol. Canonical Command Routing envelopes enter from either a directly
embedded page or an iframe parent; encoded results return to the originating
endpoint.

Open **Deucarian Control Center > Communication > WebGL Command Transport** for the package workflow.

## Security and lifecycle

- Iframe mode accepts only exact configured HTTP(S) origins and only the parent
  window. `*` is rejected for both receive and send configuration.
- Direct-page mode uses scoped browser events and does not use `postMessage`.
- `Start`, `Stop`, and `Dispose` are idempotent. `Stop` removes the JavaScript
  listener and endpoint table.
- A `deucarian-command-ready` transport handshake tells hosts when queued
  commands may flush. Application readiness remains an application event.
- Connection generations reset readiness across transport replacement and iframe
  reload. Commands queued during known downtime replay only after the newer ready
  handshake; oversize/stale messages receive explicit error events.
- The canonical host probes an already-running transport during start/reconnect,
  so a late-attaching host cannot permanently miss the ready handshake.
- Referrer-origin inference is available only in development WebGL builds.
  Production applications must provide an exact deployment-controlled allowlist.
- Payload contents, credentials, and exception text are never logged or exposed
  through diagnostics.
- Browser installation uses explicit JSON tokens for all seven wire fields;
  it does not rely on anonymous-object property getters surviving IL2CPP
  stripping. Invalid configuration is rejected before listener registration
  or replacement of an existing transport.

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

## Validation

Run the Package Registry validator, Unity EditMode filter
`Deucarian.CommandRouting.WebGLIntegration.Tests`, and `npm test` in `Browser~`.
The startup tests verify exact wire fields in both transport modes and reject
reflection-based configuration mapping. Browser tests execute the actual
`.jslib` and retain origin, generation, deferred-ready, and cleanup coverage.

After a full IL2CPP player build, run this read-only PowerShell 7 audit against
the final stripped assembly:

```powershell
pwsh -File Tools~/Test-StrippedTransportConfiguration.ps1 -AssemblyPath <project>/Library/Bee/artifacts/WebGL/ManagedStripped/Deucarian.CommandRouting.WebGLIntegration.dll
```

The audit checks the actual retained method body for all seven direct wire-field
writes and rejects object mapping. It complements the required player smoke
test: a matching transport-ready handshake must reach the host and allow a
command to be delivered. Editor tests alone do not prove stripping safety.
