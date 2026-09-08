using System;
using System.Threading;
using System.Threading.Tasks;
using Deucarian.CommandRouting;
using Deucarian.Diagnostics;
using Deucarian.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    public sealed class WebGlCommandTransport : ICommandTransport
    {
        private static readonly DLog Log = DLog.For("CommandRouting.WebGL");
        private readonly object sync = new object();
        private readonly WebGlCommandTransportOptions options;
        private readonly IWebGlCommandBrowserInterop browser;
        private readonly WebGlCommandTransportDiagnostics diagnostics;
        private readonly DiagnosticProviderRegistration diagnosticsRegistration;
        private bool running;
        private bool disposed;

        public WebGlCommandTransport(
            WebGlCommandTransportOptions transportOptions,
            IWebGlCommandBrowserInterop browserInterop = null)
        {
            options = transportOptions ?? throw new ArgumentNullException(nameof(transportOptions));
            browser = browserInterop ?? new WebGlCommandBrowserInterop();
            diagnostics = new WebGlCommandTransportDiagnostics(options);
            diagnosticsRegistration = DiagnosticProviderRegistry.Register(diagnostics);
        }

        public string TransportId => "webgl:" + options.TransportId;
        public bool IsRunning { get { lock (sync) { return running; } } }
        public event EventHandler<CommandTransportMessageEventArgs> MessageReceived;

        public void Start()
        {
            lock (sync)
            {
                ThrowIfDisposed();
                if (running) return;

                try
                {
                    browser.Install(CreateConfigurationJson());
                    browser.NotifyReady(options.TransportId);
                }
                catch (Exception startException)
                {
                    diagnostics.SetRunning(false);
                    try
                    {
                        browser.Uninstall(options.TransportId);
                    }
                    catch (Exception rollbackException)
                    {
                        throw new AggregateException(
                            "WebGL transport startup and browser rollback both failed.",
                            startException,
                            rollbackException);
                    }

                    throw;
                }

                running = true;
                diagnostics.SetRunning(true);
            }

            Log.Info("WebGL command transport started. Payloads are omitted.");
        }

        public void Stop()
        {
            lock (sync)
            {
                if (!running) return;
                browser.Uninstall(options.TransportId);
                running = false;
                diagnostics.SetRunning(false);
            }

            Log.Info("WebGL command transport stopped.");
        }

        public Task SendAsync(string message, string remoteEndpoint, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            lock (sync)
            {
                ThrowIfDisposed();
                if (!running) throw new InvalidOperationException("The WebGL command transport is not running.");
            }

            if (string.IsNullOrEmpty(message)) return Task.CompletedTask;
            if (!IsExpectedEndpoint(remoteEndpoint))
            {
                diagnostics.RecordRejected();
                throw new InvalidOperationException(
                    "The response endpoint does not match the configured browser host.");
            }
            if (message.Length > options.MaximumMessageCharacters)
            {
                diagnostics.RecordRejected();
                throw new InvalidOperationException("The WebGL response exceeds the configured limit.");
            }

            browser.Send(options.TransportId, message, remoteEndpoint ?? string.Empty);
            diagnostics.RecordSent();
            return Task.CompletedTask;
        }

        public Task PublishEventAsync(
            string eventName,
            JObject payload,
            string remoteEndpoint = null,
            CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            string normalizedName = string.IsNullOrWhiteSpace(eventName)
                ? string.Empty
                : eventName.Trim();
            if (normalizedName.Length == 0 || normalizedName.Length > 128)
            {
                throw new ArgumentException(
                    "An event name between 1 and 128 characters is required.",
                    nameof(eventName));
            }

            lock (sync)
            {
                ThrowIfDisposed();
                if (!running) throw new InvalidOperationException("The WebGL command transport is not running.");
            }

            if (!IsExpectedEndpoint(remoteEndpoint))
            {
                diagnostics.RecordRejected();
                throw new InvalidOperationException(
                    "The event endpoint does not match the configured browser host.");
            }

            string json = (payload ?? new JObject()).ToString(Formatting.None);
            if (json.Length > options.MaximumMessageCharacters)
            {
                diagnostics.RecordRejected();
                throw new InvalidOperationException("The WebGL event exceeds the configured limit.");
            }

            browser.SendEvent(
                options.TransportId,
                normalizedName,
                json,
                remoteEndpoint ?? string.Empty);
            diagnostics.RecordSent();
            return Task.CompletedTask;
        }

        public bool TryReceiveBrowserMessage(string wrapperJson)
        {
            if (!IsRunning || string.IsNullOrWhiteSpace(wrapperJson)) return false;
            try
            {
                WebGlInboundMessage inbound = JsonConvert.DeserializeObject<WebGlInboundMessage>(wrapperJson);
                if (inbound == null || inbound.TransportId != options.TransportId ||
                    string.IsNullOrWhiteSpace(inbound.Message) ||
                    inbound.Message.Length > options.MaximumMessageCharacters ||
                    !IsExpectedEndpoint(inbound.RemoteEndpoint))
                {
                    diagnostics.RecordRejected();
                    return false;
                }

                diagnostics.RecordReceived();
                MessageReceived?.Invoke(this, new CommandTransportMessageEventArgs(
                    inbound.Message,
                    inbound.RemoteEndpoint));
                return true;
            }
            catch (JsonException)
            {
                diagnostics.RecordRejected();
                Log.Warning("Rejected a malformed WebGL transport wrapper. Payload contents were omitted.");
                return false;
            }
        }

        public void Dispose()
        {
            bool uninstall;
            lock (sync)
            {
                if (disposed) return;
                disposed = true;
                uninstall = running;
                running = false;
                diagnostics.SetRunning(false);
            }

            try
            {
                if (uninstall)
                {
                    browser.Uninstall(options.TransportId);
                    Log.Info("WebGL command transport stopped during disposal.");
                }
            }
            finally
            {
                diagnosticsRegistration.Dispose();
            }
        }

        private string CreateConfigurationJson()
        {
            // Build the wire object explicitly: IL2CPP can strip the property
            // getters of anonymous objects that only a serializer discovers.
            var allowedOrigins = new JArray();
            for (int i = 0; i < options.AllowedOrigins.Count; i++)
            {
                allowedOrigins.Add(options.AllowedOrigins[i]);
            }

            return new JObject
            {
                ["transport_id"] = options.TransportId,
                ["mode"] = options.Mode == WebGlCommandTransportMode.ParentIframe
                    ? "parent_iframe" : "direct_page",
                ["allowed_origins"] = allowedOrigins,
                ["target_origin"] = options.TargetOrigin,
                ["receiver_object"] =
                    WebGlCommandTransportBehaviour.GameObjectName(options.TransportId),
                ["receiver_method"] =
                    nameof(WebGlCommandTransportBehaviour.ReceiveBrowserMessage),
                ["maximum_message_characters"] = options.MaximumMessageCharacters
            }.ToString(Formatting.None);
        }

        private bool IsExpectedEndpoint(string remoteEndpoint)
        {
            string expected = options.Mode == WebGlCommandTransportMode.ParentIframe
                ? "parent:" + options.TargetOrigin
                : "direct";
            return string.Equals(remoteEndpoint, expected, StringComparison.Ordinal);
        }

        private void ThrowIfDisposed()
        {
            if (disposed) throw new ObjectDisposedException(GetType().Name);
        }
    }
}
