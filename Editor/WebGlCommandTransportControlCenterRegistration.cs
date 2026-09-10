using System;
using System.Collections.Generic;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using UnityEditor;

namespace Deucarian.CommandRouting.WebGLIntegration.Editor
{
    [InitializeOnLoad]
    internal static class WebGlCommandTransportControlCenterRegistration
    {
        private const string PackageId =
            "com.deucarian.command-routing.webgl-integration";
        private static readonly IDisposable ToolRegistration;
        private static readonly IDisposable CardRegistration;

        static WebGlCommandTransportControlCenterRegistration()
        {
            ToolRegistration = DeucarianToolRegistry.Register(
                new DeucarianToolDescriptor(
                    DeucarianToolIds.CommandRoutingWebGl,
                    "WebGL Command Transport",
                    "Inspect secure browser and iframe command-transport configuration.",
                    DeucarianControlCenterArea.Communication,
                    WebGlCommandTransportEditorWindow.Open,
                    PackageId,
                    searchTerms: new[] { "webgl", "browser", "iframe", "transport" },
                    order: 110, createPage: WebGlCommandTransportEditorWindow.CreatePage));

            CardRegistration = DeucarianControlCenterRegistry.RegisterCardProvider(
                new WebGlTransportCardProvider());
        }

        private sealed class WebGlTransportCardProvider :
            IDeucarianControlCenterCardProvider
        {
            public string Id => PackageId + ".control-center";

            public IEnumerable<DeucarianControlCenterCard> Capture(
                DeucarianControlCenterContext context)
            {
                DiagnosticSummary diagnostics = CaptureDiagnostics();

                return new[]
                {
                    new DeucarianControlCenterCard(
                        PackageId + ".workflow",
                        DeucarianControlCenterArea.Communication,
                        "WebGL Command Transport",
                        "Secure workflow and sanitized WebGL runtime diagnostics.",
                        PackageId,
                        ResolveStatus(diagnostics.Severity),
                        diagnostics.SectionCount == 0
                            ? "No live transport"
                            : diagnostics.SectionCount + " live transport(s)",
                        order: 110,
                        details: new[]
                        {
                            diagnostics.SectionCount == 0
                                ? "Live diagnostics: no active WebGL transport"
                                : "Live diagnostics: " + diagnostics.Severity +
                                  " across " + diagnostics.SectionCount +
                                  " transport(s)",
                            "Payloads, credentials, origins, and exception text are not captured."
                        },
                        actions: new[]
                        {
                            new DeucarianControlCenterAction(
                                PackageId + ".open",
                                "Open WebGL Transport",
                                WebGlCommandTransportEditorWindow.Open, navigationToolId: DeucarianToolIds.CommandRoutingWebGl)
                        },
                        searchTerms: new[]
                        {
                            "webgl", "browser", "iframe", "transport",
                            "diagnostics", "live"
                        })
                };
            }

            private static DiagnosticSummary CaptureDiagnostics()
            {
                List<IDiagnosticProvider> providers =
                    new List<IDiagnosticProvider>();
                foreach (IDiagnosticProvider provider in
                    DiagnosticProviderRegistry.SnapshotProviders())
                {
                    if (provider != null &&
                        !string.IsNullOrEmpty(provider.ProviderId) &&
                        provider.ProviderId.StartsWith(
                            "deucarian.command-routing.webgl.",
                            StringComparison.Ordinal))
                    {
                        providers.Add(provider);
                    }
                }

                DiagnosticReport report =
                    DiagnosticReportBuilder.BuildFrom(providers);
                int sectionCount = 0;
                DiagnosticSeverity severity = DiagnosticSeverity.Info;
                foreach (DiagnosticSection section in report.Sections)
                {
                    if (string.IsNullOrEmpty(section?.Id) ||
                        !section.Id.StartsWith(
                            "deucarian.command-routing.webgl.",
                            StringComparison.Ordinal))
                    {
                        continue;
                    }

                    sectionCount++;
                    if (section.Severity > severity)
                    {
                        severity = section.Severity;
                    }
                }

                return new DiagnosticSummary(sectionCount, severity);
            }

            private static DeucarianControlCenterStatus ResolveStatus(
                DiagnosticSeverity severity)
            {
                if (severity == DiagnosticSeverity.Error)
                {
                    return DeucarianControlCenterStatus.Error;
                }

                if (severity == DiagnosticSeverity.Warning)
                {
                    return DeucarianControlCenterStatus.Warning;
                }

                return severity == DiagnosticSeverity.Success
                    ? DeucarianControlCenterStatus.Success
                    : DeucarianControlCenterStatus.Info;
            }
        }

        private readonly struct DiagnosticSummary
        {
            internal DiagnosticSummary(
                int sectionCount,
                DiagnosticSeverity severity)
            {
                SectionCount = sectionCount;
                Severity = severity;
            }

            internal int SectionCount { get; }
            internal DiagnosticSeverity Severity { get; }
        }
    }
}
