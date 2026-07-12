import type { CropRegion, CursorTelemetryPoint, ZoomFocus } from "../types";

export const MIN_DWELL_DURATION_MS = 360;
export const MAX_DWELL_DURATION_MS = 6000;
export const DWELL_MOVE_THRESHOLD = 0.035;
const DWELL_CLUSTER_RADIUS = 0.075;
const MAX_SAMPLE_GAP_MS = 280;
const PASS_THROUGH_SPEED_PER_SECOND = 0.85;
const INTERACTION_CANDIDATE_STRENGTH = 10_000;
const MIN_SUGGESTION_DURATION_MS = 1200;
const MAX_SUGGESTION_DURATION_MS = 2800;
const INTERACTION_SUGGESTION_DURATION_MS = 1600;
const DWELL_PADDING_MS = 650;
export const MIN_AUTO_ZOOM_SUGGESTION_SPACING_MS = 4500;
const AUTO_ZOOM_TARGET_INTERVAL_MS = 12_000;
const MAX_AUTO_ZOOM_SUGGESTIONS_PER_VIDEO = 12;

export interface ZoomDwellCandidate {
	centerTimeMs: number;
	focus: ZoomFocus;
	strength: number;
	kind?: "dwell" | "interaction";
	durationMs?: number;
}

export interface ZoomSuggestion {
	span: { start: number; end: number };
	focus: ZoomFocus;
	centerTimeMs: number;
}

interface SelectZoomSuggestionsOptions {
	reservedSpans?: Array<{ start: number; end: number }>;
	minSpacingMs?: number;
	maxSuggestions?: number;
}

export interface NormalizeCursorTelemetryOptions {
	cropRegion?: CropRegion | null;
	dropOutsideCrop?: boolean;
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
	return clamp(value, 0, 1);
}

function roundNormalized(value: number) {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function isDefaultCrop(cropRegion?: CropRegion | null) {
	return (
		!cropRegion ||
		(Math.abs(cropRegion.x) <= 0.0001 &&
			Math.abs(cropRegion.y) <= 0.0001 &&
			Math.abs(cropRegion.width - 1) <= 0.0001 &&
			Math.abs(cropRegion.height - 1) <= 0.0001)
	);
}

function isInsideCrop(sample: CursorTelemetryPoint, cropRegion: CropRegion) {
	const cropRight = cropRegion.x + cropRegion.width;
	const cropBottom = cropRegion.y + cropRegion.height;
	const epsilon = 0.0005;
	return (
		sample.cx >= cropRegion.x - epsilon &&
		sample.cx <= cropRight + epsilon &&
		sample.cy >= cropRegion.y - epsilon &&
		sample.cy <= cropBottom + epsilon
	);
}

function normalizeSampleToCrop(
	sample: CursorTelemetryPoint,
	cropRegion?: CropRegion | null,
	dropOutsideCrop = false,
): CursorTelemetryPoint | null {
	if (isDefaultCrop(cropRegion)) {
		return {
			...sample,
			cx: roundNormalized(clamp01(sample.cx)),
			cy: roundNormalized(clamp01(sample.cy)),
		};
	}

	if (!cropRegion || cropRegion.width <= 0 || cropRegion.height <= 0) {
		return null;
	}

	if (dropOutsideCrop && !isInsideCrop(sample, cropRegion)) {
		return null;
	}

	return {
		...sample,
		cx: roundNormalized(clamp01((sample.cx - cropRegion.x) / cropRegion.width)),
		cy: roundNormalized(clamp01((sample.cy - cropRegion.y) / cropRegion.height)),
	};
}

function normalizeTelemetrySample(
	sample: CursorTelemetryPoint,
	totalMs: number,
	options: NormalizeCursorTelemetryOptions = {},
): CursorTelemetryPoint {
	const cropSample = normalizeSampleToCrop(
		sample,
		options.cropRegion,
		options.dropOutsideCrop ?? false,
	);
	const normalized = cropSample ?? sample;
	return {
		...normalized,
		timeMs: Math.max(0, Math.min(sample.timeMs, totalMs)),
		cx: roundNormalized(clamp01(normalized.cx)),
		cy: roundNormalized(clamp01(normalized.cy)),
	};
}

export function normalizeCursorTelemetry(
	telemetry: CursorTelemetryPoint[],
	totalMs: number,
	options: NormalizeCursorTelemetryOptions = {},
): CursorTelemetryPoint[] {
	return [...telemetry]
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.sort((a, b) => a.timeMs - b.timeMs)
		.map((sample) => normalizeSampleToCrop(sample, options.cropRegion, options.dropOutsideCrop))
		.filter((sample): sample is CursorTelemetryPoint => sample !== null)
		.map((sample) => normalizeTelemetrySample(sample, totalMs));
}

function isIntentInteraction(sample: CursorTelemetryPoint) {
	return (
		sample.interactionType === "click" ||
		sample.interactionType === "double-click" ||
		sample.interactionType === "right-click" ||
		sample.interactionType === "middle-click"
	);
}

function getWeightedRecentFocus(samples: CursorTelemetryPoint[]): ZoomFocus {
	if (samples.length === 0) {
		return { cx: 0.5, cy: 0.5 };
	}

	const last = samples[samples.length - 1];
	const first = samples[0];
	const runDuration = Math.max(1, last.timeMs - first.timeMs);
	const recentWindowStart = last.timeMs - Math.min(900, runDuration * 0.65);
	const focusSamples = samples.filter((sample) => sample.timeMs >= recentWindowStart);
	const source = focusSamples.length > 0 ? focusSamples : samples;
	const totalWeight = source.reduce((sum, sample) => {
		const age = Math.max(0, last.timeMs - sample.timeMs);
		return sum + 1 / (1 + age / 350);
	}, 0);

	const cx =
		source.reduce((sum, sample) => {
			const age = Math.max(0, last.timeMs - sample.timeMs);
			return sum + sample.cx * (1 / (1 + age / 350));
		}, 0) / totalWeight;
	const cy =
		source.reduce((sum, sample) => {
			const age = Math.max(0, last.timeMs - sample.timeMs);
			return sum + sample.cy * (1 / (1 + age / 350));
		}, 0) / totalWeight;

	return { cx: roundNormalized(clamp01(cx)), cy: roundNormalized(clamp01(cy)) };
}

function getRunBounds(samples: CursorTelemetryPoint[]) {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const sample of samples) {
		minX = Math.min(minX, sample.cx);
		maxX = Math.max(maxX, sample.cx);
		minY = Math.min(minY, sample.cy);
		maxY = Math.max(maxY, sample.cy);
	}

	return {
		width: maxX - minX,
		height: maxY - minY,
		diagonal: Math.hypot(maxX - minX, maxY - minY),
	};
}

export function getZoomSuggestionDurationMs(candidate: ZoomDwellCandidate, totalMs: number) {
	const base =
		candidate.kind === "interaction"
			? INTERACTION_SUGGESTION_DURATION_MS
			: Math.max(MIN_SUGGESTION_DURATION_MS, candidate.strength + DWELL_PADDING_MS);
	const duration = clamp(base, MIN_SUGGESTION_DURATION_MS, MAX_SUGGESTION_DURATION_MS);
	return Math.min(totalMs, Math.round(duration));
}

function getMaxAutoZoomSuggestions(totalMs: number) {
	if (!Number.isFinite(totalMs) || totalMs <= 0) {
		return 0;
	}

	return Math.max(
		1,
		Math.min(
			MAX_AUTO_ZOOM_SUGGESTIONS_PER_VIDEO,
			Math.ceil(totalMs / AUTO_ZOOM_TARGET_INTERVAL_MS),
		),
	);
}

export function selectZoomSuggestions(
	candidates: ZoomDwellCandidate[],
	totalMs: number,
	options: SelectZoomSuggestionsOptions = {},
): ZoomSuggestion[] {
	const maxSuggestions = options.maxSuggestions ?? getMaxAutoZoomSuggestions(totalMs);
	const minSpacingMs = options.minSpacingMs ?? MIN_AUTO_ZOOM_SUGGESTION_SPACING_MS;
	const reservedSpans = [...(options.reservedSpans ?? [])].sort((a, b) => a.start - b.start);
	const acceptedCenters: number[] = [];
	const suggestions: ZoomSuggestion[] = [];
	const sortedCandidates = [...candidates].sort((a, b) => b.strength - a.strength);

	for (const candidate of sortedCandidates) {
		if (suggestions.length >= maxSuggestions) {
			break;
		}

		const tooCloseToAccepted = acceptedCenters.some(
			(center) => Math.abs(center - candidate.centerTimeMs) < minSpacingMs,
		);

		if (tooCloseToAccepted) {
			continue;
		}

		const suggestionDuration = getZoomSuggestionDurationMs(candidate, totalMs);
		const centeredStart = Math.round(candidate.centerTimeMs - suggestionDuration / 2);
		const candidateStart = Math.max(0, Math.min(centeredStart, totalMs - suggestionDuration));
		const candidateEnd = candidateStart + suggestionDuration;
		const hasOverlap = reservedSpans.some(
			(span) => candidateEnd > span.start && candidateStart < span.end,
		);

		if (hasOverlap) {
			continue;
		}

		reservedSpans.push({ start: candidateStart, end: candidateEnd });
		acceptedCenters.push(candidate.centerTimeMs);
		suggestions.push({
			span: { start: candidateStart, end: candidateEnd },
			focus: candidate.focus,
			centerTimeMs: candidate.centerTimeMs,
		});
	}

	return suggestions.sort((a, b) => a.span.start - b.span.start);
}

export function detectZoomDwellCandidates(samples: CursorTelemetryPoint[]): ZoomDwellCandidate[] {
	if (samples.length < 2) {
		return [];
	}

	const dwellCandidates: ZoomDwellCandidate[] = [];
	let runStart = 0;

	for (const sample of samples) {
		if (!isIntentInteraction(sample)) {
			continue;
		}

		dwellCandidates.push({
			centerTimeMs: Math.round(sample.timeMs),
			focus: { cx: sample.cx, cy: sample.cy },
			strength: INTERACTION_CANDIDATE_STRENGTH,
			kind: "interaction",
			durationMs: INTERACTION_SUGGESTION_DURATION_MS,
		});
	}

	const pushRunIfDwell = (startIndex: number, endIndexExclusive: number) => {
		if (endIndexExclusive - startIndex < 2) {
			return;
		}

		const start = samples[startIndex];
		const end = samples[endIndexExclusive - 1];
		const runDuration = end.timeMs - start.timeMs;
		if (runDuration < MIN_DWELL_DURATION_MS) {
			return;
		}

		const runSamples = samples.slice(startIndex, endIndexExclusive);
		const bounds = getRunBounds(runSamples);
		if (bounds.diagonal > DWELL_CLUSTER_RADIUS) {
			return;
		}
		const focus = getWeightedRecentFocus(runSamples);

		dwellCandidates.push({
			centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
			focus,
			strength: Math.min(runDuration, MAX_DWELL_DURATION_MS),
			kind: "dwell",
			durationMs: getZoomSuggestionDurationMs(
				{
					centerTimeMs: Math.round((start.timeMs + end.timeMs) / 2),
					focus,
					strength: Math.min(runDuration, MAX_DWELL_DURATION_MS),
					kind: "dwell",
				},
				Number.POSITIVE_INFINITY,
			),
		});
	};

	for (let index = 1; index < samples.length; index += 1) {
		const prev = samples[index - 1];
		const curr = samples[index];
		const distance = Math.hypot(curr.cx - prev.cx, curr.cy - prev.cy);
		const gapMs = curr.timeMs - prev.timeMs;
		const speed = gapMs > 0 ? distance / (gapMs / 1000) : Number.POSITIVE_INFINITY;
		const nextRunBounds = getRunBounds(samples.slice(runStart, index + 1));

		if (
			gapMs > MAX_SAMPLE_GAP_MS ||
			distance > DWELL_MOVE_THRESHOLD ||
			speed > PASS_THROUGH_SPEED_PER_SECOND ||
			nextRunBounds.diagonal > DWELL_CLUSTER_RADIUS
		) {
			pushRunIfDwell(runStart, index);
			runStart = index;
		}
	}
	pushRunIfDwell(runStart, samples.length);

	return dwellCandidates;
}
