using System;
using System.Runtime.InteropServices;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    /// <summary>
    /// Development-only convenience for local harnesses. Production embedding
    /// must supply a deployment-controlled exact origin allowlist.
    /// </summary>
    public static class WebGlEmbeddingContext
    {
#if UNITY_WEBGL && !UNITY_EDITOR && DEVELOPMENT_BUILD
        [DllImport("__Internal")]
        private static extern string DeucarianWebGlCommandGetParentOrigin();
#endif

        public static bool TryGetDevelopmentParentOrigin(out string origin)
        {
#if UNITY_WEBGL && !UNITY_EDITOR && DEVELOPMENT_BUILD
            string candidate = DeucarianWebGlCommandGetParentOrigin();
#else
            string candidate = string.Empty;
#endif
            try
            {
                origin = WebGlCommandTransportOptions.NormalizeOrigin(candidate);
                return true;
            }
            catch (ArgumentException)
            {
                origin = string.Empty;
                return false;
            }
        }

        [Obsolete(
            "Referrer-origin inference is development-only. Configure production origins explicitly.")]
        public static bool TryGetParentOrigin(out string origin)
        {
            return TryGetDevelopmentParentOrigin(out origin);
        }
    }
}
