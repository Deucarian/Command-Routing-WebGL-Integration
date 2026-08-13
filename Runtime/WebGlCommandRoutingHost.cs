using System;
using System.Collections.Generic;
using Deucarian.CommandRouting;
using UnityEngine;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    public sealed class WebGlCommandRoutingHost<TApplicationContext> : IDisposable
    {
        private readonly CommandTransportBridge<TApplicationContext> bridge;
        private readonly WebGlCommandTransportBehaviour behaviour;
        private bool disposed;

        public WebGlCommandRoutingHost(
            TApplicationContext context,
            IEnumerable<ICommandHandler<TApplicationContext>> handlers,
            WebGlCommandTransportOptions transportOptions,
            GameObject lifetimeOwner,
            CommandRoutingOptions routingOptions = null,
            IEnumerable<ICommandMiddleware<TApplicationContext>> middleware = null,
            IWebGlCommandBrowserInterop browserInterop = null)
        {
            if (lifetimeOwner == null) throw new ArgumentNullException(nameof(lifetimeOwner));
            Runtime = new CommandRoutingRuntime<TApplicationContext>(
                context,
                handlers,
                routingOptions ?? new CommandRoutingOptions(),
                middleware);
            Transport = new WebGlCommandTransport(transportOptions, browserInterop);
            behaviour = lifetimeOwner.AddComponent<WebGlCommandTransportBehaviour>();
            behaviour.Initialize(Transport);
            bridge = new CommandTransportBridge<TApplicationContext>(
                Runtime,
                Transport,
                shouldSendResponses: true,
                disposeTransport: true);
        }

        public CommandRoutingRuntime<TApplicationContext> Runtime { get; }
        public WebGlCommandTransport Transport { get; }
        public bool IsRunning => bridge.IsRunning;
        public void Start() { ThrowIfDisposed(); bridge.Start(); }
        public void Stop() { if (!disposed) bridge.Stop(); }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            bridge.Dispose();
            Runtime.Dispose();
        }

        private void ThrowIfDisposed()
        {
            if (disposed) throw new ObjectDisposedException(GetType().Name);
        }
    }
}
