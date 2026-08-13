using System.Runtime.InteropServices;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    public sealed class WebGlCommandBrowserInterop : IWebGlCommandBrowserInterop
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void DeucarianWebGlCommandInstall(string configurationJson);

        [DllImport("__Internal")]
        private static extern void DeucarianWebGlCommandUninstall(string transportId);

        [DllImport("__Internal")]
        private static extern void DeucarianWebGlCommandSend(
            string transportId,
            string message,
            string remoteEndpoint);

        [DllImport("__Internal")]
        private static extern void DeucarianWebGlCommandSendEvent(
            string transportId,
            string eventName,
            string payloadJson,
            string remoteEndpoint);

        [DllImport("__Internal")]
        private static extern void DeucarianWebGlCommandNotifyReady(string transportId);
#endif

        public void Install(string configurationJson)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            DeucarianWebGlCommandInstall(configurationJson);
#endif
        }

        public void Uninstall(string transportId)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            DeucarianWebGlCommandUninstall(transportId);
#endif
        }

        public void Send(string transportId, string message, string remoteEndpoint)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            DeucarianWebGlCommandSend(transportId, message, remoteEndpoint);
#endif
        }

        public void SendEvent(
            string transportId,
            string eventName,
            string payloadJson,
            string remoteEndpoint)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            DeucarianWebGlCommandSendEvent(
                transportId,
                eventName,
                payloadJson,
                remoteEndpoint);
#endif
        }

        public void NotifyReady(string transportId)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            DeucarianWebGlCommandNotifyReady(transportId);
#endif
        }
    }
}
