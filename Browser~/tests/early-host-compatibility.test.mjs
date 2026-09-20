import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const plugin = await readFile(new URL("../../Runtime/Plugins/WebGL/DeucarianCommandRoutingWebGL.jslib", import.meta.url), "utf8");
const hostSource = await readFile(new URL("../deucarian-command-host.js", import.meta.url), "utf8");
class CustomEvent extends Event {
  constructor(type, options) { super(type); this.detail = options.detail; }
}
function message(source, data) {
  const event = new Event("message");
  Object.assign(event, { source, data, origin: "https://viewer.example" });
  return event;
}
for (const protocol of ["simultria", "deucarian"]) {
  for (const mode of ["parent_iframe", "direct_page"]) {
    test(`${protocol} ${mode} connects when the first host probe precedes Unity startup`, async () => {
      const hostWindow = new EventTarget();
      const viewerWindow = mode === "direct_page" ? hostWindow : new EventTarget();
      viewerWindow.parent = hostWindow;
      viewerWindow.postMessage = data => viewerWindow.dispatchEvent(message(hostWindow, data));
      hostWindow.postMessage = data => hostWindow.dispatchEvent(message(viewerWindow, data));
      const library = {};
      const delivered = [];
      const context = vm.createContext({window:hostWindow, CustomEvent, URL, console});
      const dialectSource = hostSource.replaceAll("deucarian", protocol);
      vm.runInContext(dialectSource.replace("export class DeucarianCommandHost", "globalThis.Host = class DeucarianCommandHost"), context);
      const host = new context.Host({hostWindow, mode:mode === "direct_page" ? "direct" : "iframe", targetWindow:viewerWindow, targetOrigin:"https://viewer.example", transportId:"viewer"});
      host.start();
      host.sendCommand({ command:"ping" });
      assert.equal(host.isReady, false);
      vm.runInNewContext(plugin, {
        window:viewerWindow, CustomEvent, URL, setTimeout,
        LibraryManager:{library}, mergeInto:Object.assign, UTF8ToString:value=>value,
        SendMessage:(_, __, payload)=>delivered.push(JSON.parse(payload))
      });
      library.DeucarianWebGlCommandInstall(JSON.stringify({transport_id:"viewer",mode,
        allowed_origins:["https://viewer.example"],target_origin:"https://viewer.example",
        receiver_object:"Receiver",receiver_method:"Receive",maximum_message_characters:1024}));
      library.DeucarianWebGlCommandNotifyReady("viewer");
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(host.isReady,true);
      assert.equal(delivered.length,1);
      assert.equal(JSON.parse(delivered[0].message).command,"ping");
      host.dispose();
      library.DeucarianWebGlCommandUninstall("viewer");
    });
  }
}
