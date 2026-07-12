// 成片(翻页拆页)供应商显式选择,持久化到 userData/produce.json。
// 引擎(video-pipeline/slidedeck.py)认 SLIDES_PROVIDER env 锁定供应商;不锁定(auto)时它按可用 key 自动选。
import fs from "node:fs";
import path from "node:path";
import type { App } from "electron";
import type { SlidesProvider } from "../../src/lib/keyTypes";
import { atomicWriteFileSync } from "../lib/atomicWrite";

function cfgPath(app: App): string {
	return path.join(app.getPath("userData"), "produce.json");
}

export function getSlidesProvider(app: App): SlidesProvider {
	try {
		const cfg = JSON.parse(fs.readFileSync(cfgPath(app), "utf8")) as {
			slidesProvider?: SlidesProvider;
		};
		return cfg.slidesProvider ?? "auto";
	} catch {
		return "auto";
	}
}

export function saveSlidesProvider(app: App, provider: SlidesProvider): void {
	atomicWriteFileSync(cfgPath(app), JSON.stringify({ slidesProvider: provider }, null, 1));
}
