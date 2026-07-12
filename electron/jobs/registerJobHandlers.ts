// 把 JobManager 暴露给渲染进程:12 个请求/响应通道(vf:*) + 一个推送(vf:jobUpdate)。
// 这是 video-factory server.mjs 的 SSE/HTTP 表面在 Electron 里的等价物 —— server.mjs 至此退役。
// 反假进度:推送只搬运 manager 真实的 "update" 事件,绝不另造定时器进度。
import { spawn } from "node:child_process";
import path from "node:path";
import type { BrowserWindow, IpcMain } from "electron";
import { shell } from "electron";
import type {
	EngineInfo,
	Job,
	JobPlan,
	SmokeResult,
	SubmitInput,
	VfResult,
} from "../../src/lib/vfTypes";
import { augmentedPath } from "../lib/systemPath";
import type { JobManager } from "./jobManager";

export function registerJobHandlers(
	ipcMain: IpcMain,
	manager: JobManager,
	getWindow: () => BrowserWindow | null,
): void {
	// 推送:每次任务状态变化 → 发给主窗口(成片 Tab 订阅)。SSE→IPC 的核心,唯一事实来源。
	manager.on("update", (job: Job) => {
		const win = getWindow();
		if (win && !win.isDestroyed()) win.webContents.send("vf:jobUpdate", job);
	});

	const wrap = <T>(fn: () => T): VfResult<T> => {
		try {
			return { ok: true, data: fn() };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	};

	ipcMain.handle("vf:listJobs", () => wrap(() => manager.list()));
	ipcMain.handle(
		"vf:engineInfo",
		(): VfResult<EngineInfo> =>
			wrap(() => ({ pipelineRoot: manager.pipelineRoot, ready: manager.engineReady() })),
	);
	ipcMain.handle("vf:submitJob", (_e, input: SubmitInput) => wrap(() => manager.submit(input)));
	ipcMain.handle("vf:rerun", (_e, id: string) => wrap(() => manager.rerun(id)));
	ipcMain.handle("vf:cancel", (_e, id: string) => wrap(() => manager.cancel(id)));
	ipcMain.handle("vf:remove", (_e, id: string) => wrap(() => manager.remove(id)));
	ipcMain.handle("vf:restoreJob", (_e, job: Job) => wrap(() => manager.restore(job)));
	ipcMain.handle("vf:confirm", (_e, id: string) => wrap(() => manager.confirm(id)));
	ipcMain.handle("vf:confirmPreview", (_e, id: string) => wrap(() => manager.confirmPreview(id)));
	ipcMain.handle("vf:replan", (_e, id: string) => wrap(() => manager.replan(id)));
	ipcMain.handle("vf:savePlan", (_e, payload: { id: string; plan: Partial<JobPlan> }) =>
		wrap(() => manager.savePlan(payload.id, payload.plan)),
	);
	ipcMain.handle("vf:jobLog", (_e, payload: { id: string; lines?: number }) =>
		wrap(() => manager.logTail(payload.id, payload.lines)),
	);

	// 只允许打开引擎目录内的路径(白名单),其余拒绝。
	ipcMain.handle("vf:openPath", (_e, p: string) =>
		wrap(() => {
			const abs = path.resolve(p);
			const root = path.resolve(manager.pipelineRoot);
			// 用分隔符边界(非裸 startsWith),避免前缀同名的兄弟目录(如 …/video-pipeline-secrets)绕过白名单。
			if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("路径不在引擎目录内");
			shell.showItemInFolder(abs);
			return true;
		}),
	);

	// 健康自检:跑 video.sh smoke,检查 .venv / 依赖(faster_whisper/mlx/f5/soundfile)是否就绪。
	ipcMain.handle("vf:smoke", () => runSmoke(manager));
}

function runSmoke(manager: JobManager): Promise<VfResult<SmokeResult>> {
	return new Promise((resolve) => {
		if (!manager.engineReady()) {
			resolve({ ok: false, error: `找不到可执行的引擎: ${manager.videoSh}` });
			return;
		}
		let output = "";
		let settled = false;
		const done = (r: VfResult<SmokeResult>) => {
			if (settled) return;
			settled = true;
			clearTimeout(killer);
			resolve(r);
		};
		const child = spawn("bash", [manager.videoSh, "smoke"], {
			cwd: manager.pipelineRoot,
			// 打包版 GUI app 的 PATH 不含 homebrew → 引擎 smoke 内部裸名 ffmpeg 找不到、自检失败、
			// 成片页红字拦投料。补全 PATH 后自检才能真实反映引擎可用性。
			env: { ...process.env, PATH: augmentedPath() },
		});
		// 自检超时兜底:卡住的 smoke 不能无限挂起(投料前会等它),60s 杀掉并如实报错。
		const killer = setTimeout(() => {
			child.kill("SIGTERM");
			setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
			done({ ok: false, error: "引擎自检超时(60s),可能依赖卡住;手动跑 video.sh smoke 排查" });
		}, 60_000);
		killer.unref?.();
		child.stdout?.on("data", (d: Buffer) => {
			output += d.toString();
		});
		child.stderr?.on("data", (d: Buffer) => {
			output += d.toString();
		});
		child.on("error", (err: Error) => done({ ok: false, error: err.message }));
		child.on("close", (code) =>
			done({ ok: code === 0, data: { code, output: output.slice(-4000) } }),
		);
	});
}
