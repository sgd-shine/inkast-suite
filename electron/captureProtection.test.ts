import { describe, expect, it, vi } from "vitest";
import { protectCameraPreviewFromScreenCapture } from "./captureProtection";

describe("protectCameraPreviewFromScreenCapture", () => {
	it("marks the live camera preview window as excluded from screen capture", () => {
		const win = {
			setContentProtection: vi.fn(),
		};

		protectCameraPreviewFromScreenCapture(win);

		expect(win.setContentProtection).toHaveBeenCalledExactlyOnceWith(true);
	});
});
