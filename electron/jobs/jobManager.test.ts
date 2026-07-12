// JobManager 集成测试：用一个假引擎脚本（仅测试用）验证 spawn→解析→落盘全链路。
// 注意：这个 fake 只存在于测试临时目录，绝不进入产品路径——产品永远指向真实 video-pipeline。
// 移植自 video-factory/test/jobs.test.mjs(node:test → vitest)。这是反假进度的回归安全网。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import {
	buildArgs,
	friendlyError,
	isVideoFile,
	type Job,
	JobManager,
	makeSlug,
	needsBriefFile,
} from "./jobManager";

function makeFakePipeline(behavior: "pass" | "fail" = "pass"): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-test-"));
	fs.mkdirSync(path.join(root, "output"), { recursive: true });
	const script = `#!/usr/bin/env bash
SLUG="$1"
mkdir -p "build/$SLUG" output
if [[ " $* " == *" --slides-draft "* ]]; then
  echo "=== [slides] ==="
  cat > "build/$SLUG/script.json" <<'EOF'
{"title":"测试翻页","deck":{"flavor":"ppt","theme":"light"},
 "scenes":[{"id":"s1","type":"slide","deck":true,"kicker":"开场","heading":"钩子页",
   "bullets":["要点一","要点二"],"narration":"先说要点一。再说要点二。",
   "bullet_offsets":[0,0.5],"page_index":1,"page_count":1,"visual_hint":""}]}
EOF
  printf '{"slug":"%s","status":"pass"}' "$SLUG" > "build/$SLUG/run-report.json"
  echo "✅ 完成"
  exit 0
fi
if [[ " $* " == *" --preview-pack "* ]]; then
  mkdir -p "output/previews/$SLUG"
  echo "fake-cover" > "output/previews/$SLUG/cover.png"
  echo "fake-motion" > "output/previews/$SLUG/motion-preview.mp4"
  echo "=== [preview-pack] ==="
  echo "  预览包 -> output/previews/$SLUG"
  printf '{"slug":"%s","status":"pass"}' "$SLUG" > "build/$SLUG/run-report.json"
  echo "✅ 完成"
  exit 0
fi
echo "=== [storyboard] ==="
echo "=== [compose] ==="
if [ "${behavior}" = "pass" ]; then
  echo "fake" > "output/$SLUG.douyin.fast.mp4"
  echo "  成片 -> output/$SLUG.douyin.fast.mp4"
  printf '{"slug":"%s","status":"pass"}' "$SLUG" > "build/$SLUG/run-report.json"
  echo "✅ 完成"
  exit 0
else
  printf '{"slug":"%s","status":"fail"}' "$SLUG" > "build/$SLUG/run-report.json"
  echo "boom" >&2
  exit 3
fi
`;
	fs.writeFileSync(path.join(root, "video.sh"), script, { mode: 0o755 });
	return root;
}

function waitStatus(mgr: JobManager, jobId: string, statuses: string[], ms = 8000): Promise<Job> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`超时未到达 ${statuses}`)), ms);
		const check = (j: Job) => {
			if (j.id === jobId && statuses.includes(j.status)) {
				clearTimeout(t);
				resolve(j);
			}
		};
		mgr.on("update", check);
	});
}

function waitDone(mgr: JobManager, jobId: string, ms = 8000): Promise<Job> {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error("超时未完成")), ms);
		mgr.on("update", (j: Job) => {
			if (j.id === jobId && ["done", "failed"].includes(j.status)) {
				clearTimeout(t);
				resolve(j);
			}
		});
	});
}

test("buildArgs：simple 与 publish-ready", () => {
	expect(buildArgs({ slug: "s", input: "想法", mode: "simple" })).toEqual([
		"s",
		"--input",
		"想法",
		"--simple",
	]);
	expect(buildArgs({ slug: "s", input: "/a.mov", mode: "publish-ready" })).toEqual([
		"s",
		"--input",
		"/a.mov",
		"--publish-ready",
	]);
});

test("makeSlug / isVideoFile", () => {
	expect(makeSlug(new Date("2026-06-11T08:09:10"))).toMatch(/^vf-20260611-080910$/);
	expect(isVideoFile("/x/a.MOV")).toBe(true);
	expect(isVideoFile("/x/a.txt")).toBe(false);
});

test("成功链路：阶段解析 + 产物收集 + run-report pass", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	const job = mgr.submit({ type: "idea", input: "测试一句想法", mode: "simple" });
	const done = await waitDone(mgr, job.id);

	expect(done.status).toBe("done");
	expect(done.reportStatus).toBe("pass");
	expect(done.stages.map((s) => s.key)).toEqual(["storyboard", "compose"]);
	expect(done.artifacts.length).toBe(1);
	expect(done.artifacts[0].endsWith(`${job.slug}.douyin.fast.mp4`)).toBe(true);
	expect(fs.existsSync(done.artifacts[0]), "产物必须真实存在于磁盘").toBe(true);
	expect(mgr.logTail(job.id).includes("✅ 完成")).toBe(true);
}, 20000);

test("失败链路：非零退出码 → failed + 错误信息", async () => {
	const root = makeFakePipeline("fail");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	const job = mgr.submit({ type: "idea", input: "会失败的任务", mode: "simple" });
	const done = await waitDone(mgr, job.id);

	expect(done.status).toBe("failed");
	expect(done.error, "失败必须带错误信息").toBeTruthy();
	expect(mgr.logTail(job.id).includes("[err] boom")).toBe(true);
}, 20000);

test("长文案落盘成 brief 文件传路径（防 File name too long）", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });

	// 短句：直接走命令行（idea 工作流）
	const short = mgr.submit({ type: "idea", input: "一句简短想法", mode: "simple" });
	expect(short.engineInput).toBeNull();
	expect(buildArgs(short)[2]).toBe("一句简短想法");

	// 长文案/多行：必须落盘传路径（article 工作流）
	const longText = `大陆背景与历史阶段\n3.1 初鸣纪\n${"回响".repeat(300)}`;
	const long = mgr.submit({ type: "idea", input: longText, mode: "simple" });
	expect(long.engineInput, "长文案必须有 engineInput 文件").toBeTruthy();
	expect((long.engineInput as string).endsWith(`${long.slug}.md`)).toBe(true);
	expect(fs.readFileSync(long.engineInput as string, "utf8").trim()).toBe(longText.trim());
	expect(buildArgs(long)[2]).toBe(long.engineInput);
	await waitDone(mgr, long.id);
}, 20000);

test("翻页讲解全链路（不预览）：拆页→待确认→改文案→确认→合成", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });

	// wantPreview:false → 确认后直接渲染(不走 Gate B 预览)
	const job = mgr.submit({
		type: "slides",
		input: "一段原始材料",
		mode: "simple",
		wantPreview: false,
	});
	expect(job.phase).toBe("plan");
	expect(buildArgs(job).includes("--slides-draft")).toBe(true);

	// 拆页完成 → 待确认，plan 已加载
	const awaiting = await waitStatus(mgr, job.id, ["awaiting-confirm"]);
	expect(awaiting.plan?.title).toBe("测试翻页");
	expect(awaiting.plan?.pages.length).toBe(1);
	expect(awaiting.plan?.pages[0].heading).toBe("钩子页");

	// 改文案 → 写回 script.json，要点时刻退化为均匀分布
	mgr.savePlan(job.id, {
		pages: [
			{
				id: "s1",
				kicker: "开场",
				heading: "改过的标题",
				bullets: ["新要点"],
				narration: "改过的口播词。",
				visual_hint: "",
			},
		],
	});
	const saved = JSON.parse(
		fs.readFileSync(path.join(root, "build", job.slug, "script.json"), "utf8"),
	);
	expect(saved.scenes[0].heading).toBe("改过的标题");
	expect(saved.scenes[0].bullet_offsets).toEqual([0]);

	// 确认 → 进入合成（--from voice）→ 完成且有成片
	const confirmed = mgr.confirm(job.id);
	expect(confirmed.phase).toBe("render");
	expect(buildArgs(confirmed).join(" ").includes("--from voice")).toBe(true);
	const done = await waitStatus(mgr, job.id, ["done", "failed"]);
	expect(done.status).toBe("done");
	expect(done.artifacts.length).toBe(1);
}, 20000);

test("buildArgs：Gate B preview 阶段 → --preview-pack", () => {
	expect(buildArgs({ slug: "s", input: "x", type: "slides", phase: "preview" })).toEqual([
		"s",
		"--preview-pack",
	]);
});

test("Gate B 全链路:拆页→待确认→确认→预览→待预览确认→确认渲染→合成", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });

	// 默认 slides 即 wantPreview(不传也开启)
	const job = mgr.submit({ type: "slides", input: "原始材料", mode: "simple" });
	expect(job.wantPreview).toBe(true);

	await waitStatus(mgr, job.id, ["awaiting-confirm"]);
	// 确认文案 → 不直接渲染,先进预览阶段
	const previewing = mgr.confirm(job.id);
	expect(previewing.phase).toBe("preview");

	// 预览渲染完成 → 待预览确认 + 收集到 cover/motion 预览产物(cover 排前)
	const awaitingPreview = await waitStatus(mgr, job.id, ["awaiting-preview"]);
	expect(awaitingPreview.previewArtifacts?.length).toBe(2);
	expect(awaitingPreview.previewArtifacts?.[0].endsWith("cover.png")).toBe(true);

	// 确认预览 → 正式渲染(--from voice)→ 完成出成片
	const rendering = mgr.confirmPreview(job.id);
	expect(rendering.phase).toBe("render");
	expect(buildArgs(rendering).join(" ").includes("--from voice")).toBe(true);
	const done = await waitStatus(mgr, job.id, ["done", "failed"]);
	expect(done.status).toBe("done");
	expect(done.artifacts.length).toBe(1);
}, 20000);

test("Gate B 守卫:非待预览态不可确认预览;预览态可回退改稿(replan)", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	const job = mgr.submit({ type: "slides", input: "材料", mode: "simple" });
	expect(() => mgr.confirmPreview(job.id)).toThrow(/不在待预览/);
	await waitStatus(mgr, job.id, ["awaiting-confirm"]);
	mgr.confirm(job.id);
	const awaitingPreview = await waitStatus(mgr, job.id, ["awaiting-preview"]);
	// 预览态回退改稿 → 回到 plan 阶段重新拆页,预览产物作废
	const replanned = mgr.replan(awaitingPreview.id);
	expect(replanned.phase).toBe("plan");
	expect(replanned.previewArtifacts).toBeUndefined();
	await waitStatus(mgr, job.id, ["awaiting-confirm"]);
}, 20000);

test("确认点守卫：非待确认状态不可确认/改稿", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	const job = mgr.submit({ type: "idea", input: "普通任务", mode: "simple" });
	expect(() => mgr.confirm(job.id)).toThrow(/不在待确认/);
	expect(() => mgr.savePlan(job.id, { pages: [] })).toThrow(/不在待确认/);
	await waitStatus(mgr, job.id, ["done", "failed"]);
}, 20000);

test("needsBriefFile 阈值", () => {
	expect(needsBriefFile("短句")).toBe(false);
	expect(needsBriefFile("有\n换行")).toBe(true);
	expect(needsBriefFile("汉".repeat(61))).toBe(true); // 61*3=183 字节 > 180
});

test("投料校验：录屏文件必须存在且是视频", () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	expect(() => mgr.submit({ type: "recording", input: "/不存在.mov" })).toThrow(/不存在/);
	expect(() => mgr.submit({ type: "idea", input: "  " })).toThrow(/为空/);
	expect(() => mgr.submit({ type: "idea", input: "x", mode: "bad" as never })).toThrow(/未知模式/);
});

test("串行队列：同一时间只跑一个任务", async () => {
	const root = makeFakePipeline("pass");
	const mgr = new JobManager({ pipelineRoot: root, dataDir: path.join(root, "data") });
	const a = mgr.submit({ type: "idea", input: "任务A", mode: "simple" });
	const b = mgr.submit({ type: "idea", input: "任务B", mode: "simple" });
	expect(mgr.get(b.id)?.status).toBe("queued");
	await waitDone(mgr, b.id);
	expect(mgr.get(a.id)?.status).toBe("done");
	expect(mgr.get(b.id)?.status).toBe("done");
}, 20000);

// ---------- friendlyError：把拆页常见报错翻成人话 ----------
test("friendlyError：缺 LLM 密钥（KeyError）→ 指向粘贴框", () => {
	const log = "[err] KeyError: 'ANTHROPIC_API_KEY'\n=== [slides] ===\nEXIT=1";
	expect(friendlyError(log)).toMatch(/缺少 LLM 密钥|粘贴/);
});

test("friendlyError：引擎自带的缺 key 提示也能识别", () => {
	expect(friendlyError("RuntimeError: 拆页需要 LLM key:请在 video-factory/.env 配置")).toMatch(
		/缺少 LLM 密钥/,
	);
});

test("friendlyError：密钥无效 401 → 提示检查密钥", () => {
	expect(friendlyError("[err] urllib.error.HTTPError: HTTP Error 401: Unauthorized")).toMatch(
		/密钥无效|被拒/,
	);
});

test("friendlyError：余额不足 402 → 提示充值", () => {
	expect(friendlyError("[err] HTTP Error 402: Payment Required")).toMatch(/余额不足|充值/);
	expect(friendlyError('{"error":{"message":"Insufficient Balance"}}')).toMatch(/余额不足|充值/);
});

test("friendlyError：限流 429 → 提示稍后重跑", () => {
	expect(friendlyError("[err] HTTP Error 429: Too Many Requests")).toMatch(/限流|429/);
});

test("friendlyError：模型名不对 404 → 提示换模型", () => {
	expect(friendlyError("[err] urllib.error.HTTPError: HTTP Error 404: Not Found")).toMatch(
		/模型|404/,
	);
});

test("friendlyError：成功渲染日志里的帧号(401/987)不误判为密钥错误", () => {
	// 关键回归：Remotion 进度 "Rendered 401/987" 不能被当成 HTTP 401
	expect(friendlyError("Rendered 401/987, time remaining: 55s\nRendered 402/987")).toBeNull();
});

test("friendlyError：无法识别时返回 null（调用方保留通用错误）", () => {
	expect(friendlyError("Bundling 71%\nsome unrelated failure")).toBeNull();
	expect(friendlyError("")).toBeNull();
});
