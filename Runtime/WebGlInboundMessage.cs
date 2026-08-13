using Newtonsoft.Json;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    internal sealed class WebGlInboundMessage
    {
        [JsonProperty("transport_id")]
        public string TransportId { get; set; }

        [JsonProperty("remote_endpoint")]
        public string RemoteEndpoint { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }
    }
}
