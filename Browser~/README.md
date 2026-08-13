# Browser host

`DeucarianCommandHost` is the matching host-side adapter for both same-page and
iframe builds. In iframe mode pass `iframe.contentWindow` and the exact viewer
origin. The adapter validates both `event.source` and `event.origin`, keeps a
bounded FIFO of pre-ready commands, and removes every listener from `dispose()`.

The optional `createLegacyUnityDirectSender` is a narrow compatibility adapter
for pages that already call `unityInstance.SendMessage`. New integrations should
use `DeucarianCommandHost` so direct and iframe builds exercise the same transport.
