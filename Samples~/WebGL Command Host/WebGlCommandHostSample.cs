using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Deucarian.CommandRouting;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Deucarian.CommandRouting.WebGLIntegration.Samples.Host
{
    public sealed class WebGlCommandHostSample : MonoBehaviour
    {
        [SerializeField] private bool iframeMode;
        [SerializeField] private string parentOrigin = "http://localhost:5173";
        private WebGlCommandRoutingHost<WebGlCommandHostSample> host;

        private void Start()
        {
            var mode = iframeMode
                ? WebGlCommandTransportMode.ParentIframe
                : WebGlCommandTransportMode.DirectPage;
            var origins = iframeMode ? new[] { parentOrigin } : Array.Empty<string>();
            var options = new WebGlCommandTransportOptions(
                "sample",
                mode,
                origins,
                iframeMode ? parentOrigin : null);
            host = new WebGlCommandRoutingHost<WebGlCommandHostSample>(
                this,
                new ICommandHandler<WebGlCommandHostSample>[] { new PingHandler() },
                options,
                gameObject);
            host.Start();
        }

        private void OnDestroy()
        {
            host?.Dispose();
            host = null;
        }

        private sealed class PingHandler : ICommandHandler<WebGlCommandHostSample>
        {
            private static readonly IReadOnlyList<string> Names = new[] { "ping" };
            public IReadOnlyList<string> CommandNames => Names;
            public Task<CommandResult> HandleAsync(
                CommandExecutionContext<WebGlCommandHostSample> context,
                CancellationToken cancellationToken)
            {
                return Task.FromResult(CommandResult.Success(
                    new JObject { ["pong"] = true }));
            }
        }
    }
}
