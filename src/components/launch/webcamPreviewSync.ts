type WebcamRecorderSyncOptions = {
	overlayOpen: boolean;
	webcamEnabled: boolean;
	recording: boolean;
	setWebcamEnabled: (enabled: boolean) => Promise<boolean>;
	closeCameraOverlay?: () => void;
};

export async function syncCameraPreviewWithWebcamRecorder({
	overlayOpen,
	webcamEnabled,
	recording,
	setWebcamEnabled,
	closeCameraOverlay,
}: WebcamRecorderSyncOptions): Promise<void> {
	if (recording || overlayOpen === webcamEnabled) {
		return;
	}

	const enabled = await setWebcamEnabled(overlayOpen);
	if (!enabled && overlayOpen) {
		closeCameraOverlay?.();
	}
}
