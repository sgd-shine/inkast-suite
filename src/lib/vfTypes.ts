// video-factory(成片编排)的共享类型 —— 渲染进程 / preload / 主进程 共用,无 node 依赖。
// 任务对象 Job 的字段与 video-factory/lib/jobs.mjs 一一对应(移植自该实现)。

export type JobType = "recording" | "idea" | "slides";
export type JobMode = "simple" | "publish-ready";
export type JobStatus =
	| "queued"
	| "running"
	| "awaiting-confirm"
	| "awaiting-preview"
	| "done"
	| "failed"
	| "interrupted";
// plan=拆页(Gate A) · preview=渲染前轻量预览(Gate B) · render=正式合成 · null=非翻页类。
export type JobPhase = "plan" | "preview" | "render" | null;

export interface JobStage {
	key: string;
	label: string;
	at: string;
}

export interface JobPlanPage {
	id: string;
	kicker: string;
	heading: string;
	bullets: string[];
	narration: string;
	visual_hint: string;
}

export interface JobPlan {
	title: string;
	deck: Record<string, unknown>;
	pages: JobPlanPage[];
}

export interface Job {
	id: string;
	slug: string;
	title: string;
	type: JobType;
	input: string;
	mode: JobMode;
	status: JobStatus;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	stages: JobStage[];
	variants: string[];
	artifacts: string[];
	exitCode: number | null;
	reportStatus: string | null;
	error: string | null;
	engineInput: string | null;
	phase: JobPhase;
	plan: JobPlan | null;
	sawSuccess?: boolean;
	/** 漏斗溯源:发起本任务的驾驶舱选题 id(成片完成→回写该选题「已成稿」+产物,§5.4)。 */
	sourceCardId?: string;
	/** Gate B:确认文案后先出渲染前预览(--preview-pack)、人确认再正式渲染。仅 slides 类型有意义。 */
	wantPreview?: boolean;
	/** Gate B 预览产物(cover.png / motion-preview.mp4 等绝对路径),awaiting-preview 时展示。 */
	previewArtifacts?: string[];
}

export interface SubmitInput {
	type: JobType;
	input: string;
	title?: string;
	mode?: JobMode;
	/** 漏斗溯源:驾驶舱选题 id(可选)。 */
	sourceCardId?: string;
	/** Gate B:渲染前先出预览(默认 slides 开启)。 */
	wantPreview?: boolean;
}

/** 漏斗预填:从 资料库录屏 / 拉片报告 / 驾驶舱选题 跳到成片 Tab 时带过去的投料(用户审后再提交,不自动花 API)。 */
export interface ProducePrefill {
	type: JobType;
	input: string;
	title?: string;
	/** 驾驶舱选题溯源 id —— 成片完成后回写该选题「已成稿」(§5.4)。 */
	sourceCardId?: string;
}

export interface EngineInfo {
	pipelineRoot: string;
	ready: boolean;
}

export interface SmokeResult {
	code: number | null;
	output: string;
}

export interface VfResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}
