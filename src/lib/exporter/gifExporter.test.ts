import { describe, expect, it } from "vitest";
import { calculateOutputDimensions } from "./gifExporter";
import { GIF_SIZE_PRESETS } from "./types";

describe("calculateOutputDimensions", () => {
	it("uses the selected aspect ratio for scaled GIF exports", () => {
		expect(calculateOutputDimensions(1080, 1920, "medium", GIF_SIZE_PRESETS, 16 / 9)).toEqual({
			width: 1280,
			height: 720,
		});
	});

	it("fits original-size GIF exports within the source bounds at the selected aspect ratio", () => {
		expect(calculateOutputDimensions(1080, 1920, "original", GIF_SIZE_PRESETS, 16 / 9)).toEqual({
			width: 1080,
			height: 606,
		});
	});

	// 竖屏(9:16)是小红书/抖音核心场景,之前没覆盖(review testqa F7)。
	it("handles vertical 9:16 target (small red book / douyin)", () => {
		expect(calculateOutputDimensions(1080, 1920, "medium", GIF_SIZE_PRESETS, 9 / 16)).toEqual({
			width: 404, // round(720 * 9/16)=405 → 取偶 404
			height: 720,
		});
	});

	it("uses the large (1080p) preset height", () => {
		expect(calculateOutputDimensions(1280, 720, "large", GIF_SIZE_PRESETS, 16 / 9)).toEqual({
			width: 1920,
			height: 1080,
		});
	});

	it("falls back to source aspect when target ratio is invalid (0 / NaN)", () => {
		// source 1000x500 = 2.0;非法比例应回退到源比例,而不是产出畸形尺寸
		expect(calculateOutputDimensions(1000, 500, "medium", GIF_SIZE_PRESETS, 0)).toEqual({
			width: 1440,
			height: 720,
		});
		expect(calculateOutputDimensions(1000, 500, "medium", GIF_SIZE_PRESETS, Number.NaN)).toEqual({
			width: 1440,
			height: 720,
		});
	});
});
