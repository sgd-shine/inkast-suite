// 长任务(成片/拉片)终态提醒:系统通知 + Dock 角标(主线四·task 1)。
// 设计意图:用户投了长任务可以切走干别的,完成/待确认/失败时用「系统级」手段叫回来 ——
// 而应内 Tab 角标(Workspace 层)负责窗口在前台时的提示。故这里只在窗口「不在前台」(切走/
// 最小化)时才打扰:系统通知 + Dock 角标计数 +1;窗口重新获得焦点即清零(角标语义 =
// 「你不在时完成了 N 件」,看一眼 App 就清掉,诚实不留旧账)。
//
// 反假:不模拟任何进度;只在主进程拿到真实终态事件时被调用一次。
import { app, type BrowserWindow, Notification } from "electron";

// 「你不在时需要你关注」的累计数(完成/待确认/失败)。窗口获得焦点即清零。
let attention = 0;

function setBadge(n: number): void {
	try {
		if (process.platform === "darwin") {
			// macOS:Dock 图标角标用字符串(空串 = 不显示)。
			app.dock?.setBadge?.(n > 0 ? String(n) : "");
		} else {
			// Windows/Linux:任务栏角标用数字(0 = 清除)。
			app.setBadgeCount?.(n);
		}
	} catch {
		/* 角标失败(平台不支持/Dock 不可用)不影响主流程 */
	}
}

/** 窗口重新获得焦点时调用:清零「待关注」角标(用户已回到 App,旧账作废)。 */
export function clearAttention(): void {
	if (attention === 0) return;
	attention = 0;
	setBadge(0);
}

/**
 * 长任务终态提醒。窗口在前台(且未最小化)时**不打扰**——应内 Tab 角标已提示;
 * 切走/最小化才用系统通知 + Dock 角标 +1。点击通知把主窗口唤回前台。
 * @returns 是否真的发了通知(窗口在前台时为 false;便于日志/测试)。
 */
export function notifyTaskAttention(
	getWindow: () => BrowserWindow | null,
	opts: { title: string; body: string },
): boolean {
	const win = getWindow();
	// 在前台且未最小化 → 用户正看着 App,不用系统通知/角标(Tab 角标负责)。
	if (win && !win.isDestroyed() && win.isFocused() && !win.isMinimized()) return false;

	attention += 1;
	setBadge(attention);

	try {
		if (Notification.isSupported()) {
			const n = new Notification({ title: opts.title, body: opts.body });
			n.on("click", () => {
				const w = getWindow();
				if (w && !w.isDestroyed()) {
					if (w.isMinimized()) w.restore();
					w.show();
					w.focus();
				}
			});
			n.show();
		}
	} catch {
		/* 通知构造/展示失败不影响主流程 */
	}
	return true;
}
