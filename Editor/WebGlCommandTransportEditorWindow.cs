using System;
using System.Linq;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;
using Controls = Deucarian.Editor.DeucarianEditorWorkspaceControls;

namespace Deucarian.CommandRouting.WebGLIntegration.Editor
{
    public sealed class WebGlCommandTransportEditorWindow : EditorWindow
    {
        private DeucarianEditorPageSession navigation;
        public static void Open() => DeucarianEditorWindowPages.ShowStandalone<WebGlCommandTransportEditorWindow>(
            "WebGL transport", new Vector2(560, 430));
        public static IDeucarianEditorPage CreatePage() => new WebGlTransportPage().Page;
        public void CreateGUI()
        {
            navigation?.Dispose();
            navigation = new DeucarianEditorPageSession(this, "webgl-home", _ => { });
            navigation.Navigate(DeucarianToolIds.CommandRoutingWebGl);
        }
        private void OnDisable() { navigation?.Dispose(); navigation = null; }
    }

    internal sealed class WebGlTransportPage
    {
        private readonly DeucarianEditorWorkspace workspace;
        private readonly DeucarianEditorWorkspaceForm form;
        private readonly Label validation;
        private readonly Label status;
        private readonly VisualElement diagnosticDetails;
        private string origin = string.Empty;
        private string channel = "deucarian";
        private int mode = 1;
        private int maximum = WebGlCommandTransportOptions.DefaultMaximumMessageCharacters;
        private double nextRefresh;
        internal IDeucarianEditorPage Page { get; }

        internal WebGlTransportPage()
        {
            var root = new VisualElement();
            workspace = new DeucarianEditorWorkspace(root, Application.productName);
            workspace.Title.text = "WebGL transport";
            workspace.Subtitle.text = "Connect browser messages to your app.";
            DeucarianEditorWorkspaceNavigation.Populate(workspace, DeucarianToolIds.CommandRoutingWebGl);
            var scroll = Controls.Scroll("webgl-transport");
            workspace.Content.Add(scroll);
            var feature = new DeucarianEditorFeatureSection("webgl-browser", "Browser connection",
                "Editor preview · your app owns the runtime options.", "app-window");
            scroll.Add(feature.Root);
            form = new DeucarianEditorWorkspaceForm(feature.Details);
            var originField = form.Text("webgl-origin", "Allowed origin", () => origin, value => { origin = value; Invalidate(); });
            form.VisibleWhen(originField, () => mode == 1);
            form.Text("webgl-channel", "Message channel", () => channel, value => { channel = value; Invalidate(); });
            var trusted = form.Toggle("webgl-trusted", "Require trusted origin", () => true, _ => { });
            trusted.parent.AddToClassList("dw-switch-trailing");
            trusted.SetEnabled(false);
            trusted.tooltip = "Always required for iframe messages. Wildcard origins cannot be enabled.";
            feature.Details.Add(Controls.Divider());
            feature.Actions.Add(Controls.Button("Validate settings", Validate, true));
            feature.Actions.Add(Controls.IconButton("Open command routing", DeucarianEditorIconIds.ChevronRight,
                () => DeucarianEditorNavigation.Open(workspace.Root, DeucarianToolIds.CommandRouting)));
            validation = Controls.Label(string.Empty, "dw-note");
            feature.Details.Add(validation);
            feature.UseFormLayout();
            var connection = Controls.Panel("webgl-status");
            connection.AddToClassList("dw-summary-row");
            connection.AddToClassList("dw-status-strip");
            connection.Add(Controls.Icon(DeucarianEditorIconIds.Success));
            connection.Add(Controls.Label("Connection status", "dw-field-label"));
            status = Controls.Label(string.Empty, "dw-readonly"); connection.Add(status);
            scroll.Add(connection);
            var advanced = new DeucarianEditorWorkspaceForm(scroll).Section("Advanced protocol", true);
            advanced.Root.AddToClassList("dw-foldout-panel"); advanced.Root.AddToClassList("dw-foldout-followup");
            advanced.Choice("webgl-mode", "Embedding", new[] { "Direct page", "Parent iframe" },
                () => mode, value => { mode = value; Invalidate(); form.Refresh(); });
            advanced.Integer("webgl-maximum", "Maximum characters", () => maximum, value => { maximum = value; Invalidate(); });
            advanced.Note(() => "Validation creates no listener and changes no runtime configuration.");
            diagnosticDetails = new VisualElement(); advanced.Root.Add(diagnosticDetails);
            Page = new DeucarianEditorPage(root, activate: _ => Refresh(), update: _ =>
            {
                if (EditorApplication.timeSinceStartup < nextRefresh) return;
                nextRefresh = EditorApplication.timeSinceStartup + 1;
                Refresh();
            }, dispose: workspace.Dispose);
            Invalidate(); Refresh();
        }

        internal static string ValidateOptions(string origin, string channel, bool iframe, int maximum)
        {
            try
            {
                _ = new WebGlCommandTransportOptions(channel,
                    iframe ? WebGlCommandTransportMode.ParentIframe : WebGlCommandTransportMode.DirectPage,
                    iframe ? new[] { origin } : Array.Empty<string>(), iframe ? origin : null, maximum);
                return string.Empty;
            }
            catch (ArgumentException exception) { return exception.Message; }
        }

        private void Validate()
        {
            string issue = ValidateOptions(origin, channel, mode == 1, maximum);
            validation.text = string.IsNullOrEmpty(issue) ? "Preview settings are valid." : issue;
            Controls.Show(validation, true);
        }
        private void Invalidate() { if (validation != null) Controls.Show(validation, false); }
        private void Refresh()
        {
            var providers = DiagnosticProviderRegistry.SnapshotProviders().Where(value =>
                value?.ProviderId?.StartsWith("deucarian.command-routing.webgl.", StringComparison.Ordinal) == true);
            var sections = DiagnosticReportBuilder.BuildFrom(providers).Sections;
            status.text = sections.Count == 0 ? "Available in a WebGL build" : sections.Count + " registered transport(s)";
            diagnosticDetails.Clear();
            foreach (var section in sections)
            {
                var details = new DeucarianEditorWorkspaceForm(diagnosticDetails).Section(section.Title, true);
                foreach (var item in section.Items) details.ReadOnly(null, item.Label, () => item.Value);
            }
        }
    }
}
