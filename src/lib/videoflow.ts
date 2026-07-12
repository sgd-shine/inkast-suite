// Inkast → 110 视频剪辑项目「桥接」纯逻辑(可测、无 node 依赖)。
// 把 Inkast 录屏原片送进 110 工作流:生成项目 slug / requirements.md / README.md / 启动提示词 /
// PROJECT_INDEX.md 行。真正的拷文件、写盘、建目录在 electron/videoflow/videoflow.ts。
// 设计依据:110_视频剪辑项目 的 _templates/video-project 约定(README + notes/requirements.md)。

export interface VideoflowProjectInput {
	/** 视频标题(取自录屏文件名或选题)。 */
	title: string;
	/** 放进 raw/ 的文件名(basename)。 */
	rawFileName: string;
	/** YYYYMMDD(由调用方注入,保持纯函数可测)。 */
	dateYmd: string;
	/** 创建时刻可读串(写进 requirements 人工确认点)。 */
	createdAtText: string;
	orientation?: "portrait" | "landscape";
	/** 核心观点(若从驾驶舱选题/我的观点带过来)。 */
	coreIdea?: string;
}

/** 110 单项目固定子目录(SOP §0)。 */
export const PROJECT_SUBDIRS = [
	"raw",
	"edit",
	"refs/keyframes",
	"canvas",
	"notes",
	"hyperframes",
	"renders",
	"publish",
	"reports",
] as const;

/** 项目 slug:`<YYYYMMDD>-<折叠后的标题>`;非字母数字(含 CJK 保留)折叠成连字符,空则 recording。 */
export function slugForProject(dateYmd: string, title: string): string {
	const base = title
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-+/g, "-")
		.slice(0, 40)
		.replace(/-+$/g, "");
	return `${dateYmd}-${base || "recording"}`;
}

/** notes/requirements.md 预填(贴合 110 模板字段;Inkast 自录素材填好已知项,其余留空待人工)。 */
export function requirementsTemplate(input: VideoflowProjectInput): string {
	const aspect = input.orientation === "landscape" ? "横屏 1280x720" : "竖屏 1080x1920";
	return `# Requirements

## 目标

- 核心观点:${input.coreIdea ?? ""}
- 目标受众:
- 目标平台:
- 目标时长:先做 15 秒测试片
- 画幅:${aspect}

## 素材

- 原始视频:raw/${input.rawFileName}(Inkast 录屏 → 送进工作流)
- 原始音频:从原视频提取到 edit/audio/
- 图片/截图:抽帧到 refs/keyframes/
- 风格参考:
- B-roll:

## 约束

- 是否允许公开发布:
- 是否含第三方版权素材:否(Inkast 自录)
- 是否需要打码:
- 是否需要人声替换:
- 是否需要保留原声:是(口播原声)

## 第一轮交付

- [x] 只建项目(Inkast 桥接已建项目目录 + 复制素材)
- [ ] 15 秒烟测片
- [ ] 30 秒测试片
- [ ] 完整成片

## 人工确认点

- 由 Inkast「送进视频工作流」于 ${input.createdAtText} 创建。下一步在 Codex 按 110 工作流推进(base_cut → 字幕 → 分镜 → HyperFrames → 渲染)。
`;
}

/** 项目 README.md(状态 materials_ready)。 */
export function readmeTemplate(input: VideoflowProjectInput): string {
	const aspect = input.orientation === "landscape" ? "横屏 1280x720" : "竖屏 1080x1920";
	return `# ${input.title}

项目目标:

\`\`\`text
${input.coreIdea?.trim() || "<一句话说明这条视频要表达什么>"}
\`\`\`

## 基本信息

- 状态:materials_ready
- 来源:Inkast 录屏 → 送进视频工作流
- 画幅:${aspect}
- 目标时长:先做 15 秒测试片
- 原始素材:raw/${input.rawFileName}

## 下一步

先完善 \`notes/requirements.md\`,再进入素材入库和基础剪辑(base_cut + 字幕)。
`;
}

/** 给用户复制到 Codex 的启动提示词(对应 110 PROMPTS.md「启动项目」)。 */
export function startupPrompt(projectDir: string, input: VideoflowProjectInput): string {
	return `按 110 视频剪辑项目工作流继续这个项目:
项目目录:${projectDir}
原始素材:raw/${input.rawFileName}(Inkast 录屏导出)
目标:先做 15 秒测试片。
要求:先读 notes/requirements.md;生成基础剪辑 base_cut.mp4、字幕 subtitles.srt、关键帧、storyboard.md、DESIGN.md,并更新 PROJECT_INDEX.md。先跑通链路给证据路径,不追求最终质量。`;
}

/** PROJECT_INDEX.md 的一行(markdown 表格)。note 里转义竖线避免破表。 */
export function indexRow(slug: string, projectRoot: string, note: string): string {
	const safe = note.replace(/\|/g, "/");
	return `| ${slug} | materials_ready | \`${projectRoot}\` | ${safe} |`;
}

/**
 * 把新行插进 PROJECT_INDEX.md:定位表头分隔行(| --- | ... |)后插入。
 * 找不到表格则在末尾追加一段降级表(不丢数据)。纯函数,可测。
 */
export function insertIndexRow(indexContent: string, row: string): string {
	const lines = indexContent.split("\n");
	const sep = lines.findIndex((l) => /^\s*\|?\s*-{2,}\s*\|/.test(l) && l.includes("---"));
	if (sep >= 0) {
		lines.splice(sep + 1, 0, row);
		return lines.join("\n");
	}
	// 没有表格:降级追加。
	return `${indexContent.replace(/\s*$/, "")}\n\n${row}\n`;
}
