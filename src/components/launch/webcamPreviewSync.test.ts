import { describe, expect, it, vi } from "vitest";
import { syncCameraPreviewWithWebcamRecorder } from "./webcamPreviewSync";

describe("syncCameraPreviewWithWebcamRecorder", () => {
	it("enables the webcam recorder when the preview opens", async () => {
		const setWebcamEnabled = vi.fn().mockResolvedValue(true);

		await syncCameraPreviewWithWebcamRecorder({
			overlayOpen: true,
			webcamEnabled: false,
			recording: false,
			setWebcamEnabled,
		});

		expect(setWebcamEnabled).toHaveBeenCalledExactlyOnceWith(true);
	});

	it("closes the preview when webcam recorder enablement fails", async () => {
		const setWebcamEnabled = vi.fn().mockResolvedValue(false);
		const closeCameraOverlay = vi.fn();

		await syncCameraPreviewWithWebcamRecorder({
			overlayOpen: true,
			webcamEnabled: false,
			recording: false,
			setWebcamEnabled,
			closeCameraOverlay,
		});

		expect(closeCameraOverlay).toHaveBeenCalledOnce();
	});

	it("does not change recorder state while a recording is already running", async () => {
		const setWebcamEnabled = vi.fn();

		await syncCameraPreviewWithWebcamRecorder({
			overlayOpen: false,
			webcamEnabled: true,
			recording: true,
			setWebcamEnabled,
		});

		expect(setWebcamEnabled).not.toHaveBeenCalled();
	});
});
