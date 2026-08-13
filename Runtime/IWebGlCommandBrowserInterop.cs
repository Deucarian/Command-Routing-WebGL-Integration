namespace Deucarian.CommandRouting.WebGLIntegration
{
    public interface IWebGlCommandBrowserInterop
    {
        void Install(string configurationJson);
        void Uninstall(string transportId);
        void Send(string transportId, string message, string remoteEndpoint);
        void SendEvent(string transportId, string eventName, string payloadJson, string remoteEndpoint);
        void NotifyReady(string transportId);
    }
}
