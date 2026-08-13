using System;
using System.Runtime.InteropServices;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    /// <summary>
    /// Resolves the exact parent origin supplied by the browser referrer.
    /// A missing/suppressed referrer is rejected instead of widening trust.
    /// </summary>
    public static class WebGlEmbeddingContext
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern string DeucarianWebGlCommandGetParentOrigin();
#endif

        public static bool TryGetParentOrigin(out string origin)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
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
    }
}
