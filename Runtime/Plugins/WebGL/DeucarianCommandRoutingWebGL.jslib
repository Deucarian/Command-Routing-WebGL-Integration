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
      (window.__deucarianCommandRouting = {
        transports: Object.create(null),
        nextGeneration: 0
      });
    root.nextGeneration = root.nextGeneration || 0;
    root.parse = root.parse || function (value) {
      try { return JSON.parse(value); } catch (_) { return value; }
    };

    var existing = root.transports[configuration.transport_id];
    if (existing) {
      existing.notifyUnavailable("transport_replaced");
      existing.stop();
      delete root.transports[configuration.transport_id];
    }

    var generation = ++root.nextGeneration;
    var allowedOrigins = Object.create(null);
    (configuration.allowed_origins || []).forEach(function (origin) {
      allowedOrigins[origin] = true;
    });

    function emit(type, fields) {
      var current = root.transports[configuration.transport_id];
      if (!current || current.generation !== generation) return;
      var outbound = Object.assign({
        source: "deucarian-command-transport",
        type: type,
        transport_id: configuration.transport_id,
        connection_generation: generation,
        host_session: current.hostSession || null
      }, fields || {});
      if (configuration.mode === "parent_iframe") {
        window.parent.postMessage(outbound, configuration.target_origin);
      } else {
        window.dispatchEvent(new CustomEvent(type, { detail: outbound }));
      }
    }

    function reject(code, endpoint, requestId) {
      emit("deucarian-command-error", {
        error_code: code,
        remote_endpoint: endpoint || "",
        request_id: requestId || null,
        maximum_message_characters: configuration.maximum_message_characters
      });
    }

    function readRequestId(message) {
      if (!message || typeof message !== "object") return null;
      return message.request_id || message.requestId || message.id || null;
    }

    function serializePayload(value) {
      if (typeof value === "string") return { ok: true, value: value };
      try {
        return { ok: true, value: JSON.stringify(value) };
      } catch (_) {
        return { ok: false, value: "" };
      }
    }

    function deliver(data, endpoint) {
      var serialized = serializePayload(data.message);
      var requestId = readRequestId(data.message);
      if (!serialized.ok || !serialized.value) {
        reject("invalid_message", endpoint, requestId);
        return;
      }
      if (serialized.value.length > configuration.maximum_message_characters) {
        reject("message_too_large", endpoint, requestId);
        return;
      }
      if (typeof SendMessage !== "function") {
        reject("unity_unavailable", endpoint, requestId);
        return;
      }
      SendMessage(
        configuration.receiver_object,
        configuration.receiver_method,
        JSON.stringify({
          transport_id: configuration.transport_id,
          connection_generation: generation,
          message: serialized.value,
          remote_endpoint: endpoint || ""
        }));
    }

    function validateConnection(data, endpoint) {
      if (data.connection_generation === generation &&
          data.host_session && data.host_session === transport.hostSession) return true;
      reject("stale_connection_generation", endpoint, readRequestId(data.message));
      return false;
    }

    var listener;
    var probeListener;
    if (configuration.mode === "parent_iframe") {
      listener = function (event) {
        var data = event.data;
        if (event.source !== window.parent || !allowedOrigins[event.origin] ||
            !data || data.source !== "deucarian-command-host" ||
            data.transport_id !== configuration.transport_id) return;
        if (data.type === "deucarian-command-probe") {
          if (typeof data.host_session !== "string" || !data.host_session) return;
          transport.hostSession = data.host_session;
          if (transport.ready) emit("deucarian-command-ready", { ready_kind: "transport" });
          return;
        }
        if (data.type !== "deucarian-command") return;
        var endpoint = "parent:" + event.origin;
        if (!validateConnection(data, endpoint)) return;
        deliver(data, endpoint);
      };
      window.addEventListener("message", listener, false);
    } else {
      listener = function (event) {
        var data = event.detail;
        if (!data || data.source !== "deucarian-command-host" ||
            data.type !== "deucarian-command" ||
            data.transport_id !== configuration.transport_id) return;
        if (!validateGeneration(data, "direct")) return;
        deliver(data, "direct");
      };
      probeListener = function (event) {
        var data = event.detail;
        if (!data || data.source !== "deucarian-command-host" ||
            data.type !== "deucarian-command-probe" ||
            data.transport_id !== configuration.transport_id) return;
        if (typeof data.host_session !== "string" || !data.host_session) return;
        transport.hostSession = data.host_session;
        if (transport.ready) emit("deucarian-command-ready", { ready_kind: "transport" });
      };
      window.addEventListener("deucarian-command", listener, false);
      window.addEventListener("deucarian-command-probe", probeListener, false);
    }

    var transport = {
      configuration: configuration,
      generation: generation,
      hostSession: null,
      ready: false,
      emit: emit,
      notifyUnavailable: function (reason) {
        emit("deucarian-command-unavailable", { reason: reason });
      },
      stop: function () {
        if (configuration.mode === "parent_iframe") {
          window.removeEventListener("message", listener, false);
        } else {
          window.removeEventListener("deucarian-command", listener, false);
          window.removeEventListener("deucarian-command-probe", probeListener, false);
        }
      }
    };
    root.transports[configuration.transport_id] = transport;
  },

  DeucarianWebGlCommandUninstall: function (transportIdPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var root = window.__deucarianCommandRouting;
    var transport = root && root.transports[transportId];
    if (!transport) return;
    transport.notifyUnavailable("transport_stopped");
    transport.stop();
    delete root.transports[transportId];
  },

  DeucarianWebGlCommandSend: function (transportIdPointer, messagePointer, endpointPointer) {
    var transportId = UTF8ToString(transportIdPointer);
    var message = UTF8ToString(messagePointer);
    var endpoint = UTF8ToString(endpointPointer);
    var root = window.__deucarianCommandRouting;
    var transport = root && root.transports[transportId];
    if (!transport) return;
    transport.emit("deucarian-command-response", {
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
    var transport = root && root.transports[transportId];
    if (!transport) return;
    transport.emit("deucarian-command-event", {
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
    transport.ready = true;

    setTimeout(function () {
      var currentRoot = window.__deucarianCommandRouting;
      var current = currentRoot && currentRoot.transports[transportId];
      if (current !== transport) return;
      transport.emit(
        "deucarian-command-ready",
        { ready_kind: "transport" });
    }, 0);
  }
});
