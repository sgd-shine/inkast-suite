import { describe, expect, it } from "vitest";
import { detectPauses, downmixToMono, totalPauseMs } from "./pauseDetection";

const SR = 16000;

/** 生成一段正弦"人声"。 */
function tone(durationMs: number, amplitude = 0.5, freq = 220): Float32Array {
	const n = Math.round((SR * durationMs) / 1000);
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SR);
	return out;
}

/** 一段静音。 */
function silence(durationMs: number): Float32Array {
	return new Float32Array(Math.round((SR * durationMs) / 1000));
}

function concat(...parts: Float32Array[]): Float32Array {
	const len = parts.reduce((a, p) => a + p.length, 0);
	const out = new Float32Array(len);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

describe("detectPauses", () => {
	it("detects a long silent gap between speech and pads both ends", () => {
		// 1s speech, 1.5s silence, 1s speech.
		const samples = concat(tone(1000), silence(1500), tone(1000));
		const pauses = detectPauses(samples, SR, { minPauseMs: 700, paddingMs: 120 });
		expect(pauses).toHaveLength(1);
		const p = pauses[0];
		// 静音在 [1000,2500]ms;两端各留 120ms → 约 [1120,2380]。
		expect(p.startMs).toBeGreaterThanOrEqual(1080);
		expect(p.startMs).toBeLessThanOrEqual(1180);
		expect(p.endMs).toBeGreaterThanOrEqual(2320);
		expect(p.endMs).toBeLessThanOrEqual(2420);
	});

	it("ignores short pauses below minPauseMs", () => {
		// 0.3s 静音 < 700ms → 不算长停顿。
		const samples = concat(tone(800), silence(300), tone(800));
		expect(detectPauses(samples, SR, { minPauseMs: 700 })).toHaveLength(0);
	});

	it("returns nothing for all-silence (no speech)", () => {
		expect(detectPauses(silence(3000), SR)).toHaveLength(0);
	});

	it("detects multiple pauses", () => {
		const samples = concat(tone(800), silence(1000), tone(800), silence(1000), tone(800));
		const pauses = detectPauses(samples, SR, { minPauseMs: 700, paddingMs: 100 });
		expect(pauses).toHaveLength(2);
		expect(pauses[0].endMs).toBeLessThan(pauses[1].startMs);
	});

	it("totalPauseMs sums removable duration", () => {
		const pauses = [
			{ startMs: 100, endMs: 600 },
			{ startMs: 1000, endMs: 1800 },
		];
		expect(totalPauseMs(pauses)).toBe(1300);
	});

	it("downmixToMono averages channels", () => {
		const a = new Float32Array([1, 0, -1]);
		const b = new Float32Array([0, 1, 1]);
		expect(Array.from(downmixToMono([a, b]))).toEqual([0.5, 0.5, 0]);
	});
});
