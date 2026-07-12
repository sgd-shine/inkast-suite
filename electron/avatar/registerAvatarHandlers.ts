// 把 AvatarManager 暴露给渲染进程:配置读写 / 提交 / 列表 / 删除 / 打开产物 + 进度推送(avatar:jobUpdate)。
import type { BrowserWindow, IpcMain } from "electron";
import { shell } from "electron";
import type { AvatarConfig, AvatarJob, AvatarResult } from "../../src/lib/avatarTypes";
import type { AvatarManager, AvatarSubmitInput } from "./avatarManager";

export function registerAvatarHandlers(
	ipcMain: IpcMain,
	manager: AvatarManager,
	getWindow: () => BrowserWindow | null,
): void {
	manager.on("update", (job: AvatarJob) => {
		const win = getWindow();
		if (win && !win.isDestroyed()) win.webContents.send("avatar:jobUpdate", job);
	});

	const wrap = <T>(fn: () => T): AvatarResult<T> => {
		try {
			return { ok: true, data: fn() };
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
	};

	ipcMain.handle("avatar:getConfig", () => wrap(() => manager.getConfigPublic()));
	ipcMain.handle("avatar:setConfig", (_e, partial: Partial<AvatarConfig>) =>
		wrap(() => manager.setConfig(partial)),
	);
	ipcMain.handle("avatar:submit", (_e, input: AvatarSubmitInput) =>
		wrap(() => manager.submit(input)),
	);
	ipcMain.handle("avatar:listJobs", () => wrap(() => manager.list()));
	ipcMain.handle("avatar:remove", (_e, id: string) => wrap(() => manager.remove(id)));
	ipcMain.handle("avatar:openOutput", (_e, p: string) =>
		wrap(() => {
			if (!manager.isOutputPath(p)) throw new Error("路径不在数字人产物目录内");
			shell.showItemInFolder(p);
			return true;
		}),
	);
}
