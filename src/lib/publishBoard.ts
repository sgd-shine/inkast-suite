// 发布看板(A 档·只读监控)的共享模型 + 分类逻辑(纯函数,可测;渲染/主进程共用,无 node 依赖)。
//
// 设计(见 §5.5/§6.3):只读扫描 KnowledgePlanet/Operations/Publishing 的文件系统,
// 把图文稿按发布流水线分格(候选→草稿→发布准备→已发布)+ 计数 + 停太久告警。不碰发布执行。
//
// ★ 应对 Codex 改结构:分类规则全收在下面「单一映射表」MAPPING 里。结构变动(新目录/新前缀)
//   多数只改这表几行;不认识的目录/状态一律归「未分类」并高亮 = 提醒该更新这张表的告警。

export type PublishStage = "candidate" | "draft" | "ready" | "published" | "uncategorized";

/** 流水线展示顺序。 */
export const STAGE_ORDER: PublishStage[] = [
	"candidate",
	"draft",
	"ready",
	"published",
	"uncategorized",
];

/** 从稿件 frontmatter 解析出的展示元数据(让看板卡片能一眼区分,而非一堵同质墙)。 */
export interface PublishMeta {
	title?: string;
	summary?: string; // digest / summary / description / 摘要
	section?: string; // 栏目 / 分类
	tags?: string[];
	topicType?: string; // topic_type / 题材
	cover?: string; // thumb / cover / image / 封面(路径或 URL)
}

/** 扫描到的单个文件(主进程 fs 填,纯逻辑只读它)。 */
export interface PublishFile {
	path: string; // 绝对路径
	name: string; // basename
	relDir: string; // 相对 Publishing 根的目录(如 "Drafts/快讯" / "Published")
	modifiedMs: number;
	meta?: PublishMeta; // .md 稿件的 frontmatter(主进程读首部解析)
}

/** 一条图文稿(同题多产物归并:md/html/.planet.md/.short.md/公众号自动+图片测试)。 */
export interface PublishItem {
	key: string; // 归并键(日期::标题)
	title: string;
	date?: string;
	stage: PublishStage;
	relDir: string;
	files: string[]; // 该稿的全部产物(绝对路径)
	primaryPath: string; // 打开用(优先 .md)
	modifiedMs: number; // 组内最新
	stale: boolean; // 停太久告警(仅在制品)
	meta?: PublishMeta; // 归并后的 frontmatter(取首个有 meta 的产物)
}

export interface PublishStageGroup {
	stage: PublishStage;
	count: number;
	items: PublishItem[];
}

export interface PublishBoardResult {
	ok: boolean;
	publishingDir: string;
	stages: PublishStageGroup[];
	uncategorizedCount: number;
	error?: string;
}

// ───────────────────────── 单一映射表(改结构主要改这里)─────────────────────────
export const MAPPING = {
	/** 目录 → 阶段(按相对目录前缀匹配,自上而下取首个命中)。 */
	dirToStage: [
		{ match: "Published", stage: "published" as PublishStage },
		{ match: "Review/发布准备", stage: "ready" as PublishStage },
		{ match: "Drafts", stage: "draft" as PublishStage },
	],
	/** 仅当目录判为 draft 时,文件名命中这些规则再细分为 candidate(候选_ 前缀 / _候选 后缀)。 */
	candidateName: [/^候选[_-]/, /[_-]候选(\.|$)/],
	/** 已知前缀/变体词,归并同题稿时从文件名里剥掉(date 与扩展名单独处理)。 */
	knownTokens: ["公众号自动", "公众号图片测试", "候选", "发布版", "转发文案", "排版修复"],
	// 注:看板**只反映 Publishing 目录的文件现实**,不接 vault 选题流转状态(2026-06-21 负责人定)。
	// 原因:选题卡(KnowledgePlanet 每日 JSON)与 Publishing 稿件无稳定关联键,只能靠标题模糊匹配,
	// 会造幽灵/重复卡;且选题流转状态在「驾驶舱」已可见,不必在此重复。原 statusToStage 死代码已删。
	/** 纳入看板的扩展名(图片等其它文件忽略)。 */
	includeExt: [".md", ".html", ".json"],
	/** 在制品多少天没动 = 停太久告警。 */
	staleDays: 14,
};

const DAY_MS = 86_400_000;

/** 目录 → 基础阶段;无命中=未分类。 */
export function dirStage(relDir: string): PublishStage {
	for (const rule of MAPPING.dirToStage) {
		if (relDir === rule.match || relDir.startsWith(`${rule.match}/`)) return rule.stage;
	}
	return "uncategorized";
}

/** 文件 → 最终阶段(目录定基,draft 再按文件名细分候选)。 */
export function classifyStage(relDir: string, name: string): PublishStage {
	const base = dirStage(relDir);
	if (base === "draft" && MAPPING.candidateName.some((re) => re.test(name))) return "candidate";
	return base;
}

/** 文件名 → { date, title }(剥扩展名/日期/已知前缀,折叠分隔符),用于同题归并。 */
export function titleKey(name: string): { date?: string; title: string } {
	let s = name
		.replace(/\.(planet|short)\.(md|html)$/i, "")
		.replace(/\.(md|html|json|mdx|txt)$/i, "");
	const date = s.match(/\d{4}-\d{2}-\d{2}/)?.[0];
	s = s.replace(/\d{4}-\d{2}-\d{2}/, "");
	for (const tok of MAPPING.knownTokens) s = s.split(tok).join("");
	const title = s
		.replace(/[_\-—\s]+/g, " ")
		.replace(/^[\s_-]+|[\s_-]+$/g, "")
		.trim();
	return { date, title };
}

function unquote(s: string): string {
	return s.replace(/^['"]+|['"]+$/g, "").trim();
}

/** 解析稿件首部 frontmatter(--- ... ---)为展示元数据。纯函数,主进程读首部 4KB 后调它(可测)。
 *  只做轻量解析:标量 key: value、内联数组 key: [a,b]、块级列表(后续 - item 行)。支持中文 key。 */
export function parseFrontmatter(content: string): PublishMeta {
	const m = content.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return {};
	const scalars: Record<string, string> = {};
	const lists: Record<string, string[]> = {};
	let curList: string | null = null;
	for (const line of m[1].split(/\r?\n/)) {
		const item = line.match(/^\s*-\s+(.*)$/);
		if (curList && item) {
			lists[curList].push(unquote(item[1]));
			continue;
		}
		const kv = line.match(/^([A-Za-z0-9_一-龥]+):\s*(.*)$/);
		if (!kv) {
			curList = null;
			continue;
		}
		const key = kv[1].toLowerCase();
		const val = kv[2].trim();
		if (val === "") {
			curList = key;
			lists[key] = lists[key] ?? [];
			continue;
		}
		curList = null;
		const inline = val.match(/^\[(.*)\]$/);
		if (inline) {
			lists[key] = inline[1]
				.split(",")
				.map((s) => unquote(s.trim()))
				.filter(Boolean);
			continue;
		}
		scalars[key] = unquote(val);
	}
	const pick = (...keys: string[]): string | undefined => {
		for (const k of keys) if (scalars[k]?.trim()) return scalars[k].trim();
		return undefined;
	};
	const tags =
		lists.tags && lists.tags.length
			? lists.tags
			: scalars.tags
				? scalars.tags
						.split(/[,，]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined;
	const meta: PublishMeta = {
		title: pick("title", "标题"),
		summary: pick("digest", "summary", "description", "desc", "摘要"),
		section: pick("section", "栏目", "分类"),
		tags: tags && tags.length ? tags : undefined,
		topicType: pick("topic_type", "topictype", "题材"),
		cover: pick("thumb", "cover", "image", "封面"),
	};
	return meta;
}

function isIncluded(name: string): boolean {
	const lower = name.toLowerCase();
	return MAPPING.includeExt.some((ext) => lower.endsWith(ext));
}

function pickPrimary(files: PublishFile[]): string {
	const md = files.find((f) => f.name.toLowerCase().endsWith(".md"));
	const html = files.find((f) => f.name.toLowerCase().endsWith(".html"));
	return (md ?? html ?? files[0]).path;
}

/** 扫描文件清单 → 按阶段分格的看板(纯函数;nowMs 注入时钟以便测试)。 */
export function buildBoard(files: PublishFile[], nowMs: number): PublishStageGroup[] {
	// 1) 过滤扩展名 + 分阶段
	const byStage = new Map<PublishStage, PublishFile[]>();
	for (const f of files) {
		if (!isIncluded(f.name)) continue;
		const stage = classifyStage(f.relDir, f.name);
		const arr = byStage.get(stage) ?? [];
		arr.push(f);
		byStage.set(stage, arr);
	}

	// 2) 每个阶段内按 (日期::标题) 归并同题稿
	const groups: PublishStageGroup[] = [];
	for (const stage of STAGE_ORDER) {
		const stageFiles = byStage.get(stage) ?? [];
		const items = new Map<string, PublishFile[]>();
		for (const f of stageFiles) {
			const { date, title } = titleKey(f.name);
			const key = `${date ?? ""}::${title || f.name}`;
			const arr = items.get(key) ?? [];
			arr.push(f);
			items.set(key, arr);
		}
		const list: PublishItem[] = [];
		for (const [key, fs] of items) {
			const { date, title } = titleKey(fs[0].name);
			const modifiedMs = Math.max(...fs.map((f) => f.modifiedMs));
			const inFlight = stage !== "published" && stage !== "uncategorized";
			const primaryPath = pickPrimary(fs);
			// 取 meta:优先主文件(.md),否则任一带 meta 的产物。
			const meta = (fs.find((f) => f.path === primaryPath && f.meta) ?? fs.find((f) => f.meta))
				?.meta;
			list.push({
				key,
				title: meta?.title || title || fs[0].name,
				date,
				stage,
				relDir: fs[0].relDir,
				files: fs.map((f) => f.path),
				primaryPath,
				modifiedMs,
				stale: inFlight && nowMs - modifiedMs >= MAPPING.staleDays * DAY_MS,
				meta,
			});
		}
		list.sort((a, b) => b.modifiedMs - a.modifiedMs);
		groups.push({ stage, count: list.length, items: list });
	}
	return groups;
}

export function uncategorizedCount(groups: PublishStageGroup[]): number {
	return groups.find((g) => g.stage === "uncategorized")?.count ?? 0;
}

// ───────────────────────── 文件管理(可写操作的共享纯逻辑)─────────────────────────
// 看板从「只读监控」扩成可管理稿件:删除(废纸篓)/编辑/重命名/阶段间移动。
// 安全敏感:这里只放纯校验+映射;真正的路径白名单/原子写/trash 在主进程(electron/publish)。

/** 可作为「移动目标」的阶段 → Publishing 下的目录。candidate(=draft 里候选前缀)与
 *  uncategorized 没有独立目录,不能作为移动目标。 */
export const STAGE_DIR: Partial<Record<PublishStage, string>> = {
	draft: "Drafts",
	ready: "Review/发布准备",
	published: "Published",
};

/** 可移动到的目标阶段(有对应实体目录的)。 */
export const MOVABLE_STAGES: PublishStage[] = ["draft", "ready", "published"];

/** 可在内置编辑器打开编辑的扩展名(文本稿件;图片/二进制不可编辑,避免误写坏)。 */
export const EDITABLE_EXT = [".md", ".html", ".txt", ".json", ".mdx", ".markdown"] as const;

export function isEditablePath(p: string): boolean {
	const lower = p.toLowerCase();
	return EDITABLE_EXT.some((e) => lower.endsWith(e));
}

/** 校验重命名的新文件名:非空、不含路径分隔符 / .. / 前导点(防目录穿越、防隐藏文件)。 */
export function isValidRename(newName: string): boolean {
	const s = (newName ?? "").trim();
	if (!s) return false;
	if (s.includes("/") || s.includes("\\")) return false;
	if (s.includes("..")) return false;
	if (s.startsWith(".")) return false;
	return true;
}

/** 文件管理操作的统一返回(成功带 data,失败带可读中文 error)。后端 wrap / preload / 前端共用。 */
export type PublishMut<T> = { ok: true; data: T } | { ok: false; error: string };

/** 一次移动里「源→新位置」的配对。move 返回它,撤销时把 to 改回 from —— 精确还原原位置
 *  (含子目录),而非按阶段根目录重新落点(那会丢掉 Drafts/快讯 这类子目录)。 */
export interface PublishMovePair {
	from: string;
	to: string;
}
