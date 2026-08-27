using System.Collections.Generic;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using UnityEditor;
using UnityEngine;

namespace Deucarian.CommandRouting.WebGLIntegration.Editor
{
    public sealed class WebGlCommandTransportEditorWindow : EditorWindow
    {
        public const string MenuPath =
            "Tools/Deucarian/Communication/WebGL Command Transport";

        private Vector2 scrollPosition;

        [MenuItem(MenuPath, priority = 321)]
        public static void Open()
        {
            var window = GetWindow<WebGlCommandTransportEditorWindow>("WebGL Commands");
            window.minSize = new Vector2(560f, 430f);
            window.Show();
        }

        private void OnGUI()
        {
            using (DeucarianEditorWorkbenchPanelScope page =
                   DeucarianEditorWorkbenchGUI.BeginSettingsPage(GUILayout.ExpandHeight(true)))
            {
                scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
                DeucarianEditorChrome.DrawPackageHeader(
                    "network",
                    "WebGL Command Transport",
                    "Secure browser transport for Deucarian Command Routing.");
                DrawContract();
                DrawDiagnostics();
                DeucarianEditorChrome.DrawFooterVersion(
                    "com.deucarian.command-routing.webgl-integration");
                EditorGUILayout.EndScrollView();
            }
        }

        private static void DrawContract()
        {
            DeucarianEditorChrome.DrawSectionHeader("Embedding contract");
            DeucarianEditorChrome.BeginSection();
            EditorGUILayout.LabelField(
                "Direct-page builds use CustomEvent. Iframe builds require an exact " +
                "allowed parent origin, validate the parent source window, and send to " +
                "that exact origin. Wildcard origins are rejected by runtime options.",
                EditorStyles.wordWrappedLabel);
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
                EditorGUILayout.HelpBox(
                    "No WebGL command transport is currently registered.",
                    MessageType.Info);
            }
            foreach (DiagnosticSection section in matching)
            {
                EditorGUILayout.LabelField(section.Title, EditorStyles.boldLabel);
                foreach (DiagnosticItem item in section.Items)
                {
                    EditorGUILayout.LabelField(item.Label, item.Value);
                }
            }
            DeucarianEditorChrome.EndSection();
        }
    }
}
