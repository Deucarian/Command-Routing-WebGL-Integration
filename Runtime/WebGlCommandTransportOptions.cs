using System;
using System.Collections.Generic;
using System.Linq;

namespace Deucarian.CommandRouting.WebGLIntegration
{
    public sealed class WebGlCommandTransportOptions
    {
        public const int DefaultMaximumMessageCharacters = 262144;

        public WebGlCommandTransportOptions(
            string transportId,
            WebGlCommandTransportMode mode = WebGlCommandTransportMode.DirectPage,
            IEnumerable<string> allowedOrigins = null,
            string targetOrigin = null,
            int maximumMessageCharacters = DefaultMaximumMessageCharacters)
        {
            TransportId = NormalizeId(transportId);
            Mode = mode;
            MaximumMessageCharacters = maximumMessageCharacters;
            if (maximumMessageCharacters < 256 || maximumMessageCharacters > 1048576)
            {
                throw new ArgumentOutOfRangeException(nameof(maximumMessageCharacters));
            }

            string[] origins = (allowedOrigins ?? Array.Empty<string>())
                .Select(NormalizeOrigin)
                .Distinct(StringComparer.Ordinal)
                .ToArray();
            if (mode == WebGlCommandTransportMode.ParentIframe && origins.Length == 0)
            {
                throw new ArgumentException(
                    "Iframe mode requires at least one exact allowed origin.",
                    nameof(allowedOrigins));
            }

            AllowedOrigins = origins;
            TargetOrigin = mode == WebGlCommandTransportMode.ParentIframe
                ? NormalizeOrigin(targetOrigin)
                : string.Empty;
            if (mode == WebGlCommandTransportMode.ParentIframe &&
                !origins.Contains(TargetOrigin, StringComparer.Ordinal))
            {
                throw new ArgumentException(
                    "The target origin must be one of the allowed origins.",
                    nameof(targetOrigin));
            }
        }

        public string TransportId { get; }
        public WebGlCommandTransportMode Mode { get; }
        public IReadOnlyList<string> AllowedOrigins { get; }
        public string TargetOrigin { get; }
        public int MaximumMessageCharacters { get; }

        private static string NormalizeId(string value)
        {
            string normalized = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
            if (normalized.Length == 0 || normalized.Length > 96)
            {
                throw new ArgumentException("A transport ID between 1 and 96 characters is required.", nameof(value));
            }

            return normalized;
        }

        internal static string NormalizeOrigin(string value)
        {
            string candidate = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
            if (candidate.Length == 0 || candidate == "*" ||
                !Uri.TryCreate(candidate, UriKind.Absolute, out Uri uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
                uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo))
            {
                throw new ArgumentException("An exact HTTP(S) origin is required.", nameof(value));
            }

            return uri.GetLeftPart(UriPartial.Authority);
        }
    }
}
