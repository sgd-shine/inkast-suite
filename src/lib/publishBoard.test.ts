import { expect, test } from "vitest";
import {
	buildBoard,
	classifyStage,
	isEditablePath,
	isValidRename,
	MOVABLE_STAGES,
	type PublishFile,
	parseFrontmatter,
	STAGE_DIR,
	titleKey,
	uncategorizedCount,
} from "./publishBoard";

test("parseFrontmatter:解析摘要/栏目/题材/标签(标量+内联数组+块级列表)", () => {
	const md = [
		"---",
		'title: "那首唱了四十年的歌"',
		"digest: 一段关于坚持的故事",
		"section: 公众号文章",
		"topic_type: 情感",
		"tags: [回忆, 音乐]",
		"---",
		"正文……",
	].join("\n");
	const m = parseFrontmatter(md);
	expect(m.title).toBe("那首唱了四十年的歌");
	expect(m.summary).toBe("一段关于坚持的故事");
	expect(m.section).toBe("公众号文章");
	expect(m.topicType).toBe("情感");
	expect(m.tags).toEqual(["回忆", "音乐"]);
});

test("parseFrontmatter:块级列表 tags + 中文 key + 无 frontmatter 返回空", () => {
	const block = ["---", "tags:", "  - a", "  - b", "摘要: 中文键也认", "---", "x"].join("\n");
	const m = parseFrontmatter(block);
	expect(m.tags).toEqual(["a", "b"]);
	expect(m.summary).toBe("中文键也认");
	expect(parseFrontmatter("没有 frontmatter 的正文")).toEqual({
		title: undefined,
		summary: undefined,
		section: undefined,
		tags: undefined,
		topicType: undefined,
		cover: undefined,
	});
});

test("isEditablePath:只认文本稿件扩展名", () => {
	expect(isEditablePath("/x/a.md")).toBe(true);
	expect(isEditablePath("/x/A.HTML")).toBe(true);
	expect(isEditablePath("/x/note.txt")).toBe(true);
	expect(isEditablePath("/x/cover.png")).toBe(false);
	expect(isEditablePath("/x/clip.mp4")).toBe(false);
});

test("isValidRename:挡空名/路径分隔符/穿越/隐藏文件", () => {
	expect(isValidRename("新标题.md")).toBe(true);
	expect(isValidRename("  ")).toBe(false);
	expect(isValidRename("")).toBe(false);
	expect(isValidRename("a/b.md")).toBe(false); // 跨目录
	expect(isValidRename("..\\x")).toBe(false); // 反斜杠
	expect(isValidRename("../etc/passwd")).toBe(false); // 目录穿越
	expect(isValidRename(".hidden")).toBe(false); // 隐藏文件
});

test("STAGE_DIR / MOVABLE_STAGES:只有三个有实体目录的阶段可作移动目标", () => {
	expect(STAGE_DIR.draft).toBe("Drafts");
	expect(STAGE_DIR.ready).toBe("Review/发布准备");
	expect(STAGE_DIR.published).toBe("Published");
	expect(STAGE_DIR.candidate).toBeUndefined(); // candidate 在 Drafts 里靠前缀,无独立目录
	expect(STAGE_DIR.uncategorized).toBeUndefined();
	expect(MOVABLE_STAGES).toEqual(["draft", "ready", "published"]);
});

test("classifyStage:目录定基,Drafts 候选_ 细分为 candidate", () => {
	expect(classifyStage("Published", "2026-05-16_公众号自动_X.md")).toBe("published");
	expect(classifyStage("Review/发布准备", "发布版_AI宠物军备竞赛.md")).toBe("ready");
	expect(classifyStage("Drafts/快讯", "候选_2026-05-24_Anthropic.md")).toBe("candidate");
	expect(classifyStage("Drafts/公众号文章", "2026-05-01_某稿.md")).toBe("draft");
	expect(classifyStage("天外目录", "x.md")).toBe("uncategorized");
});

test("Published 里 _候选 后缀仍算 published(目录优先,不被前缀规则拉回候选)", () => {
	// 候选名规则只在 draft 基础上生效,Published 的 _候选.md 保持 published
	expect(classifyStage("Published", "2026-05-04_为什么卡在登录_候选.md")).toBe("published");
});

test("titleKey:剥日期/已知前缀/扩展名,公众号自动+图片测试同题归一", () => {
	const a = titleKey("2026-05-16_公众号自动_外贸老板该注意.md");
	const b = titleKey("2026-05-16_公众号图片测试_外贸老板该注意.md");
	expect(a.date).toBe("2026-05-16");
	expect(a.title).toBe(b.title); // 同题 → 归并
	expect(a.title).toContain("外贸老板该注意");
});

test("titleKey:.planet.md / .short.md 变体与 .md 同题", () => {
	expect(titleKey("飞书CLI让AI直接干活.md").title).toBe(
		titleKey("飞书CLI让AI直接干活.planet.md").title,
	);
	expect(titleKey("飞书CLI让AI直接干活.short.md").title).toBe("飞书CLI让AI直接干活");
});

const f = (name: string, relDir: string, modifiedMs: number): PublishFile => ({
	path: `/PUB/${relDir}/${name}`,
	name,
	relDir,
	modifiedMs,
});

test("buildBoard:同题多产物归并成一条 + 分阶段计数", () => {
	const now = 1_700_000_000_000;
	const files: PublishFile[] = [
		f("2026-05-16_公众号自动_外贸该注意.md", "Published", now),
		f("2026-05-16_公众号图片测试_外贸该注意.md", "Published", now),
		f("飞书CLI让AI直接干活.md", "Published", now),
		f("飞书CLI让AI直接干活.planet.md", "Published", now),
		f("候选_2026-05-24_Anthropic.md", "Drafts/快讯", now),
		f("候选_2026-05-24_Anthropic.json", "Drafts/快讯", now),
		f("发布版_AI宠物.md", "Review/发布准备", now),
		f("封面.png", "Drafts/场景拆解/assets", now), // 非纳入扩展名 → 忽略
	];
	const groups = buildBoard(files, now);
	const by = (s: string) => groups.find((g) => g.stage === s);
	expect(by("published")?.count).toBe(2); // 外贸该注意(自动+图测归一)+ 飞书CLI(md+planet归一)
	expect(by("candidate")?.count).toBe(1); // Anthropic(md+json归一)
	expect(by("ready")?.count).toBe(1);
	expect(by("candidate")?.items[0].files).toHaveLength(2);
	expect(uncategorizedCount(groups)).toBe(0);
});

test("buildBoard:在制品停太久告警;已发布不告警", () => {
	const now = 1_700_000_000_000;
	const old = now - 30 * 86_400_000; // 30 天前
	const groups = buildBoard(
		[
			f("候选_2026-01-01_旧候选.md", "Drafts/快讯", old),
			f("2026-01-01_老文.md", "Published", old), // 已发布即便老也不算 stale
		],
		now,
	);
	const cand = groups.find((g) => g.stage === "candidate")?.items[0];
	const pub = groups.find((g) => g.stage === "published")?.items[0];
	expect(cand?.stale).toBe(true);
	expect(pub?.stale).toBe(false);
});

test("未分类目录归 uncategorized 并计数(= 提醒更新映射表)", () => {
	const now = 1_700_000_000_000;
	const groups = buildBoard([f("奇怪.md", "新结构目录", now)], now);
	expect(uncategorizedCount(groups)).toBe(1);
});
