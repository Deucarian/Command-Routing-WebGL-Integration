using System.Collections.Generic;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using UnityEditor;
using UnityEngine;

namespace Deucarian.CommandRouting.WebGLIntegration.Editor
{
    public sealed class WebGlCommandTransportEditorWindow : EditorWindow
    {
        private Vector2 scrollPosition;

        public static void Open()
        {
            var window = DeucarianEditorWindowPages.GetStandalone<WebGlCommandTransportEditorWindow>("WebGL Commands");
            window.minSize = new Vector2(560f, 430f);
            window.Show();
        }

        public static IDeucarianEditorPage CreatePage() =>
            DeucarianEditorImGuiPage.Create<WebGlCommandTransportEditorWindow>(DeucarianToolIds.CommandRoutingWebGl, window => window.OnGUI());

        private void OnGUI()
        {
            using (DeucarianEditorWorkbenchPanelScope page =
                   DeucarianEditorWorkbenchGUI.BeginSettingsPage(this, GUILayout.ExpandHeight(true)))
            {
                scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
                DeucarianEditorChrome.DrawPackageHeader(this,
                    "network",
                    "WebGL Command Transport",
                    "Secure browser transport for Deucarian Command Routing.");
                DrawContract();
                DrawDiagnostics();
                DeucarianEditorChrome.DrawFooterVersion(this,
                    "com.deucarian.command-routing.webgl-integration");
                EditorGUILayout.EndScrollView();
            }
        }

        private static void DrawContract()
        {
            DeucarianEditorChrome.DrawSectionHeader("Embedding contract");
            DeucarianEditorChrome.BeginSection();
            DeucarianEditorTextGUI.LabelField(
                "Direct-page builds use CustomEvent. Iframe builds require an exact " +
                "allowed parent origin, validate the parent source window, and send to " +
                "that exact origin. Wildcard origins are rejected by runtime options.",
                DeucarianEditorWorkbenchGUI.LabelStyle);
            DeucarianEditorWorkbenchGUI.DrawStatusIconRow(
                "shield-check",
                "Payloads are never written to logs or Diagnostics.",
                DeucarianEditorStatus.Success);
            DeucarianEditorChrome.EndSection();
        }

        private static void DrawDiagnostics()
        {
            DeucarianEditorChrome.DrawSectionHeader("Runtime Diagnostics");
            DeucarianEditorChrome.BeginSection();
            DiagnosticReport report = DiagnosticProviderRegistry.BuildReport();
            var matching = new List<DiagnosticSection>();
            foreach (DiagnosticSection section in report.Sections)
            {
                if (section.Id.StartsWith("deucarian.command-routing.webgl."))
                {
                    matching.Add(section);
                }
            }

            if (matching.Count == 0)
            {
                DeucarianEditorTextGUI.HelpBox(
                    "No WebGL command transport is currently registered.",
                    MessageType.Info);
            }
            foreach (DiagnosticSection section in matching)
            {
                DeucarianEditorTextGUI.LabelField(section.Title, DeucarianEditorWorkbenchGUI.BoldLabelStyle);
                foreach (DiagnosticItem item in section.Items)
                {
                    DeucarianEditorTextGUI.LabelField(item.Label, item.Value);
                }
            }
            DeucarianEditorChrome.EndSection();
        }
    }
}
