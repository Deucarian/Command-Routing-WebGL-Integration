using System.Linq;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using NUnit.Framework;
using UnityEngine.UIElements;

namespace Deucarian.CommandRouting.WebGLIntegration.Tests
{
    public sealed class ControlCenterRegistrationTests
    {
        private const string PackageId =
            "com.deucarian.command-routing.webgl-integration";

        [Test]
        public void NativePreviewKeepsOriginTrustMandatoryAndDoesNotRegisterATransport()
        {
            int before = DiagnosticProviderRegistry.SnapshotProviders().Count;
            Assert.That(DeucarianToolRegistry.TryGet(DeucarianToolIds.CommandRoutingWebGl, out var tool), Is.True);
            using (var page = tool.CreatePage())
            {
                Assert.That(page.Root.Query<IMGUIContainer>().ToList(), Is.Empty);
                Assert.That(page.Root.Q<TextField>("webgl-origin"), Is.Not.Null);
                var trusted = page.Root.Q<Toggle>("webgl-trusted");
                Assert.That(trusted.value, Is.True);
                Assert.That(trusted.enabledSelf, Is.False);
                Assert.That(trusted.parent.ClassListContains("dw-switch-trailing"), Is.True);
                Assert.That(page.Root.Q("webgl-status").ClassListContains("dw-status-strip"), Is.True);
                Assert.That(DiagnosticProviderRegistry.SnapshotProviders().Count, Is.EqualTo(before));
            }
        }

        [Test]
        public void PackageRegistersStableToolAndCard()
        {
            Assert.That(
                DeucarianToolRegistry.TryGet(
                    DeucarianToolIds.CommandRoutingWebGl,
                    out DeucarianToolDescriptor tool),
                Is.True);
            Assert.That(tool.OwningPackage, Is.EqualTo(PackageId));

            DeucarianControlCenterSnapshot snapshot =
                DeucarianControlCenterSnapshotBuilder.Capture(true);
            Assert.That(
                snapshot.Cards.Any(
                    card => card.OwningPackage == PackageId),
                Is.True);
        }

        [Test]
        public void CardIncludesSanitizedRegisteredTransportSeverity()
        {
            using (DiagnosticProviderRegistration registration =
                   DiagnosticProviderRegistry.Register(
                       new ReviewDiagnosticProvider()))
            {
                DeucarianControlCenterCard card =
                    DeucarianControlCenterSnapshotBuilder.Capture(true)
                        .Cards.Single(candidate =>
                            candidate.Id == PackageId + ".workflow");

                Assert.That(
                    card.Status,
                    Is.EqualTo(DeucarianControlCenterStatus.Error));
                Assert.That(
                    card.Details.Any(detail =>
                        detail.StartsWith("Live diagnostics:")),
                    Is.True);
                Assert.That(
                    string.Join(" ", card.Details),
                    Does.Not.Contain("raw-diagnostic-value"));
            }
        }

        private sealed class ReviewDiagnosticProvider : IDiagnosticProvider
        {
            public string ProviderId =>
                "deucarian.command-routing.webgl.review";
            public string DisplayName => "Review WebGL";

            public void Collect(DiagnosticReportBuilder builder)
            {
                builder.AddSection(ProviderId, DisplayName)
                    .AddItem(
                        "state",
                        "State",
                        "raw-diagnostic-value",
                        DiagnosticSeverity.Error);
            }
        }
    }
}
