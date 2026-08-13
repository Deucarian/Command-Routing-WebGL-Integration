# WebGL Command Host sample

Add `WebGlCommandHostSample` to a scene object. For iframe builds, set the exact
origin of the local or production host; wildcard origins are intentionally not
supported. Build for WebGL and host it with `Browser~/deucarian-command-host.js`.

The sample registers a transport-independent `ping` handler. Browser code sends:

```json
{"protocol_version":1,"command_id":"sample-1","command":"ping","payload":{}}
```
