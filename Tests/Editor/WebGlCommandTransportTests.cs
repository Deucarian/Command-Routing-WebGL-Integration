using System;
using System.Collections.Generic;
using System.Threading;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace Deucarian.CommandRouting.WebGLIntegration.Tests
{
    public sealed class WebGlCommandTransportTests
    {
        [Test]
        public void Options_RequireExactIframeOrigins()
        {
            Assert.Throws<ArgumentException>(() =>
                new WebGlCommandTransportOptions(
                    "viewer",
                    WebGlCommandTransportMode.ParentIframe,
                    new[] { "*" },
                    "*"));
            Assert.Throws<ArgumentException>(() =>
                new WebGlCommandTransportOptions(
                    "viewer",
                    WebGlCommandTransportMode.ParentIframe,
                    new[] { "https://backoffice.example" },
                    "https://other.example"));

            var options = new WebGlCommandTransportOptions(
                "viewer",
                WebGlCommandTransportMode.ParentIframe,
                new[] { "https://backoffice.example/" },
                "https://backoffice.example");
            Assert.That(options.TargetOrigin, Is.EqualTo("https://backoffice.example"));
        }

        [Test]
        public void Lifecycle_IsIdempotentAndAlwaysUninstalls()
        {
            var browser = new RecordingBrowserInterop();
            var transport = new WebGlCommandTransport(
                new WebGlCommandTransportOptions("viewer"),
                browser);

            transport.Start();
            transport.Start();
            transport.Stop();
            transport.Stop();
            transport.Start();
            transport.Dispose();
            transport.Dispose();

            Assert.That(browser.InstallCount, Is.EqualTo(2));
            Assert.That(browser.UninstallCount, Is.EqualTo(2));
            Assert.That(browser.ReadyCount, Is.EqualTo(2));
        }

        [Test]
        public void DisposeBeforeStartIsTerminalWithoutInstallingBrowserState()
        {
            var browser = new RecordingBrowserInterop();
            var transport = new WebGlCommandTransport(
                new WebGlCommandTransportOptions("viewer"),
                browser);

            transport.Dispose();
            transport.Dispose();

            Assert.That(browser.InstallCount, Is.Zero);
            Assert.That(browser.UninstallCount, Is.Zero);
            Assert.Throws<ObjectDisposedException>(() => transport.Start());
        }

        [Test]
        public void Start_RollsBackBrowserStateWhenReadyNotificationFails()
        {
            var browser = new RecordingBrowserInterop { ThrowOnReady = true };
            var transport = new WebGlCommandTransport(
                new WebGlCommandTransportOptions("viewer"),
                browser);

            Assert.Throws<InvalidOperationException>(() => transport.Start());
            Assert.That(transport.IsRunning, Is.False);
            Assert.That(browser.InstallCount, Is.EqualTo(1));
            Assert.That(browser.UninstallCount, Is.EqualTo(1));

            browser.ThrowOnReady = false;
            transport.Start();
            Assert.That(transport.IsRunning, Is.True);
            transport.Dispose();
        }

        [Test]
        public void Stop_RemainsRetryableWhenBrowserUninstallFails()
        {
            var browser = new RecordingBrowserInterop();
            var transport = new WebGlCommandTransport(
                new WebGlCommandTransportOptions("viewer"),
                browser);
            transport.Start();
            browser.ThrowOnUninstall = true;

            Assert.Throws<InvalidOperationException>(() => transport.Stop());
            Assert.That(transport.IsRunning, Is.True);

            browser.ThrowOnUninstall = false;
            transport.Stop();
            Assert.That(transport.IsRunning, Is.False);
            transport.Dispose();
        }

        [Test]
        public void Dispose_IsTerminalEvenWhenBrowserUninstallFails()
        {
            var browser = new RecordingBrowserInterop();
            var transport = new WebGlCommandTransport(
                new WebGlCommandTransportOptions("viewer"),
                browser);
            transport.Start();
            browser.ThrowOnUninstall = true;

            Assert.Throws<InvalidOperationException>(() => transport.Dispose());
            Assert.That(transport.IsRunning, Is.False);
            Assert.Throws<ObjectDisposedException>(() => transport.Start());

            browser.ThrowOnUninstall = false;
            Assert.DoesNotThrow(() => transport.Dispose());
        }

        [Test]
        public void Receive_RejectsWrongTransportAndStopsDelivery()
        {
            var browser = new RecordingBrowserInterop();
            using (var transport = new WebGlCommandTransport(
                       new WebGlCommandTransportOptions("viewer"), browser))
            {
                var received = new List<string>();
                transport.MessageReceived += (_, args) => received.Add(args.Message);
                transport.Start();
                Assert.That(transport.TryReceiveBrowserMessage(
                    "{\"transport_id\":\"other\",\"message\":\"{}\"}"), Is.False);
                Assert.That(transport.TryReceiveBrowserMessage(
                    "{\"transport_id\":\"viewer\",\"message\":\"{\\\"command\\\":\\\"ping\\\"}\",\"remote_endpoint\":\"direct\"}"), Is.True);
                transport.Stop();
                Assert.That(transport.TryReceiveBrowserMessage(
                    "{\"transport_id\":\"viewer\",\"message\":\"{}\"}"), Is.False);
                Assert.That(received, Has.Count.EqualTo(1));
            }
        }

        [Test]
        public void PublishEvent_UsesDedicatedEventChannel()
        {
            var browser = new RecordingBrowserInterop();
            using (var transport = new WebGlCommandTransport(
                       new WebGlCommandTransportOptions("viewer"), browser))
            {
                transport.Start();
                transport.PublishEventAsync(
                    "viewer_ready",
                    new JObject { ["revision"] = 7L },
                    "direct",
                    CancellationToken.None).GetAwaiter().GetResult();
            }

            Assert.That(browser.Events, Has.Count.EqualTo(1));
            Assert.That(browser.Events[0], Does.Contain("viewer_ready"));
            Assert.That(browser.Events[0], Does.Contain("\"revision\":7"));
        }

        [Test]
        public void PublishEvent_RejectsAnEndpointThatDidNotOriginateAtTheHost()
        {
            var browser = new RecordingBrowserInterop();
            using (var transport = new WebGlCommandTransport(
                       new WebGlCommandTransportOptions("viewer"), browser))
            {
                transport.Start();
                Assert.Throws<InvalidOperationException>(() =>
                    transport.PublishEventAsync(
                            "viewer_ready",
                            new JObject(),
                            "parent:https://evil.example",
                            CancellationToken.None)
                        .GetAwaiter().GetResult());
            }
        }

        [Test]
        public void Response_RejectsAnEndpointThatDidNotOriginateAtTheHost()
        {
            var browser = new RecordingBrowserInterop();
            using (var transport = new WebGlCommandTransport(
                       new WebGlCommandTransportOptions("viewer"), browser))
            {
                transport.Start();
                Assert.Throws<InvalidOperationException>(() =>
                    transport.SendAsync("{}", "parent:https://evil.example", CancellationToken.None)
                        .GetAwaiter().GetResult());
            }
        }

        private sealed class RecordingBrowserInterop : IWebGlCommandBrowserInterop
        {
            public int InstallCount { get; private set; }
            public int UninstallCount { get; private set; }
            public int ReadyCount { get; private set; }
            public List<string> Events { get; } = new List<string>();
            public bool ThrowOnReady { get; set; }
            public bool ThrowOnUninstall { get; set; }
            public void Install(string configurationJson) { InstallCount++; }
            public void Uninstall(string transportId)
            {
                UninstallCount++;
                if (ThrowOnUninstall)
                {
                    throw new InvalidOperationException("uninstall failed");
                }
            }
            public void Send(string transportId, string message, string remoteEndpoint) { }
            public void SendEvent(string transportId, string eventName, string payloadJson, string remoteEndpoint)
            {
                Events.Add(eventName + ":" + payloadJson);
            }
            public void NotifyReady(string transportId)
            {
                ReadyCount++;
                if (ThrowOnReady)
                {
                    throw new InvalidOperationException("ready failed");
                }
            }
        }
    }
}
