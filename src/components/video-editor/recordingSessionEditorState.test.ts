import { describe, expect, it } from "vitest";
import { createInitialEditorStateFromRecordingSession } from "./recordingSessionEditorState";

describe("createInitialEditorStateFromRecordingSession", () => {
	it("applies recorded webcam preview shape and size to the new editor state", () => {
		const state = createInitialEditorStateFromRecordingSession({
			screenVideoPath: "/tmp/screen.webm",
			webcamVideoPath: "/tmp/webcam.webm",
			createdAt: 123,
			webcamSettings: {
				maskShape: "circle",
				sizePreset: 32,
			},
		});

		expect(state.webcamMaskShape).toBe("circle");
		expect(state.webcamSizePreset).toBe(32);
	});

	it("ignores webcam metadata when the session has no webcam track", () => {
		const state = createInitialEditorStateFromRecordingSession({
			screenVideoPath: "/tmp/screen.webm",
			createdAt: 123,
			webcamSettings: {
				maskShape: "circle",
				sizePreset: 32,
			},
		});

		expect(state.webcamMaskShape).toBe("rectangle");
		expect(state.webcamSizePreset).toBe(25);
	});
});
