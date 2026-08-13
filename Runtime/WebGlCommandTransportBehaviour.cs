using System;
using UnityEngine;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    public sealed class WebGlCommandTransportBehaviour : MonoBehaviour
    {
        private WebGlCommandTransport transport;
        private bool ownsTransport;

        public WebGlCommandTransport Transport => transport;

        public static string GameObjectName(string transportId)
        {
            return "DeucarianWebGlTransport-" + transportId;
        }

        public void Initialize(WebGlCommandTransport value, bool disposeTransport = false)
        {
            if (value == null) throw new ArgumentNullException(nameof(value));
            if (transport != null && !ReferenceEquals(transport, value))
            {
                throw new InvalidOperationException("The transport behaviour is already initialized.");
            }

            transport = value;
            ownsTransport = disposeTransport;
            gameObject.name = GameObjectName(value.TransportId.Substring("webgl:".Length));
        }

        public void ReceiveBrowserMessage(string wrapperJson)
        {
            transport?.TryReceiveBrowserMessage(wrapperJson);
        }

        private void OnDestroy()
        {
            if (ownsTransport) transport?.Dispose();
            transport = null;
        }
    }
}
