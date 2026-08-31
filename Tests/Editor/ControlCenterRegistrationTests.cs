using System.Linq;
using Deucarian.Diagnostics;
using Deucarian.Editor;
using NUnit.Framework;

namespace Deucarian.CommandRouting.WebGLIntegration.Tests
{
    public sealed class ControlCenterRegistrationTests
    {
        private const string PackageId =
            "com.deucarian.command-routing.webgl-integration";

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