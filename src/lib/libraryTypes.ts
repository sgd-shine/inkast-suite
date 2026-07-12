// 资料库共享类型 —— 渲染/preload/主进程共用,无 node 依赖。
// 统一资产视图:录屏原档 + 成片 + 拉片报告(都按路径读,不复制)。

export type LibraryKind = "recording" | "film" | "analysis";

export interface LibraryItem {
	name: string;
	path: string;
	kind: LibraryKind;
	sizeBytes?: number;
	modifiedMs?: number;
}

export interface LibraryData {
	recordings: LibraryItem[];
	films: LibraryItem[];
	analyses: LibraryItem[];
}

export interface LibraryResult {
	ok: boolean;
	data?: LibraryData;
	error?: string;
	recordingsDir: string;
	outputDir: string;
}
