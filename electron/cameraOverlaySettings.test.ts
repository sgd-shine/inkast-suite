import { afterEach, describe, expect, it } from "vitest";
import {
	getCameraOverlayRecordingSettings,
	resolveCameraOverlayRecordingSettings,
	setCameraOverlayLiveMetricsProvider,
	updateCameraOverlaySettings,
} from "./cameraOverlaySettings";

describe("resolveCameraOverlayRecordingSettings", () => {
	it("maps the live preview shape and visual size to recording webcam settings", () => {
		expect(
			resolveCameraOverlayRecordingSettings({
				shape: "circle",
				sizePx: 360,
				displaySize: { width: 1440, height: 900 },
			}),
		).toEqual({
			maskShape: "circle",
			sizePreset: 32,
		});
	});

	it("clamps the exported webcam size to the editor-supported range", () => {
		expect(
			resolveCameraOverlayRecordingSettings({
				shape: "square",
				sizePx: 40,
				displaySize: { width: 1440, height: 900 },
			}),
		).toEqual({
			maskShape: "square",
			sizePreset: 10,
		});

		// 超大 sizePx → 预设封顶到新上限 100(原为 50;放开后摄像头能做大)。
		expect(
			resolveCameraOverlayRecordingSettings({
				shape: "square",
				sizePx: 1500,
				displaySize: { width: 1440, height: 900 },
			}),
		).toEqual({
			maskShape: "square",
			sizePreset: 100,
		});
	});
});

describe("getCameraOverlayRecordingSettings live metrics provider", () => {
	afterEach(() => {
		setCameraOverlayLiveMetricsProvider(null);
	});

	it("refreshes from the live window provider at read time (captures final position/size)", () => {
		// Simulate windows.ts: the provider syncs the live window's size + position.
		setCameraOverlayLiveMetricsProvider(() => {
			updateCameraOverlaySettings({
				sizePx: 300,
				displaySize: { width: 1000, height: 1000 },
				position: { cx: 0.2, cy: 0.8 },
			});
		});

		const settings = getCameraOverlayRecordingSettings();
		expect(settings.position).toEqual({ cx: 0.2, cy: 0.8 });
	});

	it("does not infinitely recurse when the provider updates settings", () => {
		// updateCameraOverlaySettings returns the snapshot, which reads recording
		// settings again — the re-entrancy guard must prevent infinite recursion.
		let calls = 0;
		setCameraOverlayLiveMetricsProvider(() => {
			calls += 1;
			updateCameraOverlaySettings({ position: { cx: 0.5, cy: 0.5 } });
		});

		expect(() => getCameraOverlayRecordingSettings()).not.toThrow();
		// Provider runs exactly once per top-level read (no re-entrant explosion).
		expect(calls).toBe(1);
	});

	it("clamps out-of-range live positions to [0,1]", () => {
		setCameraOverlayLiveMetricsProvider(() => {
			updateCameraOverlaySettings({ position: { cx: 1.4, cy: -0.3 } });
		});
		const settings = getCameraOverlayRecordingSettings();
		expect(settings.position).toEqual({ cx: 1, cy: 0 });
	});
});
