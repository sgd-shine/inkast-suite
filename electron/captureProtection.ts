type CaptureProtectableWindow = {
	setContentProtection(enabled: boolean): void;
};

export function protectCameraPreviewFromScreenCapture(win: CaptureProtectableWindow): void {
	win.setContentProtection(true);
}
