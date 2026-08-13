using System.Threading;
using Deucarian.Diagnostics;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    internal sealed class WebGlCommandTransportDiagnostics : IDiagnosticProvider
    {
        private readonly string providerId;
        private readonly WebGlCommandTransportOptions options;
        private long received;
        private long sent;
        private long rejected;
        private int running;

        public WebGlCommandTransportDiagnostics(WebGlCommandTransportOptions transportOptions)
        {
            options = transportOptions;
            providerId = "deucarian.command-routing.webgl." + transportOptions.TransportId;
        }

        public string ProviderId => providerId;
        public string DisplayName => "WebGL Command Transport";

        public void SetRunning(bool value) => Interlocked.Exchange(ref running, value ? 1 : 0);
        public void RecordReceived() => Interlocked.Increment(ref received);
        public void RecordSent() => Interlocked.Increment(ref sent);
        public void RecordRejected() => Interlocked.Increment(ref rejected);

        public void Collect(DiagnosticReportBuilder builder)
        {
            bool isRunning = Interlocked.CompareExchange(ref running, 0, 0) == 1;
            long rejectedCount = Interlocked.Read(ref rejected);
            DiagnosticSection section = builder.AddSection(ProviderId, DisplayName);
            section.AddItem("status", "Status", isRunning ? "Ready" : "Stopped",
                isRunning ? DiagnosticSeverity.Success : DiagnosticSeverity.Info);
            section.AddItem("mode", "Embedding mode", options.Mode.ToString());
            section.AddItem("allowed_origin_count", "Allowed origins", options.AllowedOrigins.Count.ToString());
            section.AddItem("received", "Messages received", Interlocked.Read(ref received).ToString());
            section.AddItem("sent", "Messages sent", Interlocked.Read(ref sent).ToString());
            section.AddItem("rejected", "Messages rejected", rejectedCount.ToString(),
                rejectedCount == 0 ? DiagnosticSeverity.Success : DiagnosticSeverity.Warning);
        }
    }
}
