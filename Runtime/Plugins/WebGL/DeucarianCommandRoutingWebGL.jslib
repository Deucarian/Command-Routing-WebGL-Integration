mergeInto(LibraryManager.library, {
  DeucarianWebGlCommandGetParentOrigin: function () {
    var origin = "";
    try {
      origin = document.referrer ? new URL(document.referrer).origin : "";
    } catch (_) {
      origin = "";
    }
    return stringToNewUTF8(origin);
  },

  DeucarianWebGlCommandInstall: function (configurationJsonPointer) {
    var configuration = JSON.parse(UTF8ToString(configurationJsonPointer));
    var root = window.__deucarianCommandRouting ||
      (window.__deucarianCommandRouting = { transports: Object.create(null) });
    root.parse = root.parse || function (value) {
      try { return JSON.parse(value); } catch (_) { return value; }
    };
    root.emit = root.emit || function (transportId, type, fields) {
      var current = root.transports[transportId];
      if (!current) return;
      var outbound = Object.assign({
        source: "deucarian-command-transport",
        type: type,
        transport_id: transportId
      }, fields || {});
      if (current.configuration.mode === "parent_iframe") {
        window.parent.postMessage(outbound, current.configuration.target_origin);
      } else {
        window.dispatchEvent(new CustomEvent(type, { detail: outbound }));
      }
    };
    var existing = root.transports[configuration.transport_id];
    if (existing) {
      existing.stop();
    }

    var allowedOrigins = Object.create(null);
    (configuration.allowed_origins || []).forEach(function (origin) {
      allowedOrigins[origin] = true;
    });

    function parsePayload(value) {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch (_) { return ""; }
    }

    function deliver(message, endpoint) {
      if (!message || message.length > configuration.maximum_message_characters) return;
      SendMessage(
        configuration.receiver_object,
        configuration.receiver_method,
        JSON.stringify({
          transport_id: configuration.transport_id,
          message: message,
          remote_endpoint: endpoint || ""
        }));
    }

    var listener;
    if (configuration.mode === "parent_iframe") {
      listener = function (event) {
        var data = event.data;
        if (event.source !== window.parent || !allowedOrigins[event.origin] ||
            !data || data.source !== "deucarian-command-host" ||
            data.type !== "deucarian-command" ||
            data.transport_id !== configuration.transport_id) return;
        deliver(parsePayload(data.message), "parent:" + event.origin);
      };
      window.addEventListener("message", listener, false);
    } else {
      listener = function (event) {
        var data = event.detail;
        if (!data || data.source !== "deucarian-command-host" ||
            data.type !== "deucarian-command" ||
            data.transport_id !== configuration.transport_id) return;
        deliver(parsePayload(data.message), "direct");
      };
      window.addEventListener("deucarian-command", listener, false);
    }

    root.transports[configuration.transport_id] = {
      configuration: configuration,
      stop: function () {
        if (configuration.mode === "parent_iframe") {
          window.removeEventListener("message", listener, false);
        } else {
          window.removeEventListener("deucarian-command", listener, false);
        }
      }
    };
  },

  DeucarianWebGlCommandUninstall: function (transportIdPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var root = window.__deucarianCommandRouting;
    var transport = root && root.transports[transportId];
    if (!transport) return;
    transport.stop();
    delete root.transports[transportId];
  },

  DeucarianWebGlCommandSend: function (transportIdPointer, messagePointer, endpointPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var message = UTF8ToString(messagePointer);
    var endpoint = UTF8ToString(endpointPointer);
    var root = window.__deucarianCommandRouting;
    if (!root) return;
    root.emit(transportId, "deucarian-command-response", {
      message: root.parse(message),
      remote_endpoint: endpoint
    });
  },

  DeucarianWebGlCommandSendEvent: function (transportIdPointer, eventNamePointer, payloadPointer, endpointPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var eventName = UTF8ToString(eventNamePointer);
    var payload = UTF8ToString(payloadPointer);
    var endpoint = UTF8ToString(endpointPointer);
    var root = window.__deucarianCommandRouting;
    if (!root) return;
    root.emit(transportId, "deucarian-command-event", {
      event_name: eventName,
      payload: root.parse(payload),
      remote_endpoint: endpoint
    });
  },

  DeucarianWebGlCommandNotifyReady: function (transportIdPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var root = window.__deucarianCommandRouting;
    var transport = root && root.transports[transportId];
    if (!transport) return;

    // CommandTransportBridge marks itself started immediately after the
    // transport's Start call returns. Deferring the browser-ready signal by
    // one task guarantees a host cannot synchronously flush commands into a
    // bridge that is not started yet.
    setTimeout(function () {
      var current = window.__deucarianCommandRouting;
      if (!current || current.transports[transportId] !== transport) return;
      current.emit(
        transportId,
        "deucarian-command-ready",
        { ready_kind: "transport" });
    }, 0);
  }
});
