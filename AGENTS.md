# Deucarian Command Routing WebGL Integration Agent Notes

Package ID: `com.deucarian.command-routing.webgl-integration`

Follow the canonical Deucarian architecture rules in Package Registry.

This integration owns the secure browser/WebGL `ICommandTransport`, direct-page
and parent-iframe adapters, ready handshake, listener lifecycle, sanitized
diagnostics, browser host helper, and its package-specific Editor surface.

It must not own application command names, domain state, model loading, camera
behavior, authentication state, or generic command dispatch. Never log command
payloads. Production iframe configuration requires exact HTTP(S) origins and
must never use a wildcard target origin.

Validate with the Package Registry validator, Unity EditMode tests, and
`git diff --check`.
