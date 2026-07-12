import { expect, test } from "vitest";
import { extractKeyFindings, findingsToTopicCards } from "./lapianFindings";

test("解析「**关键发现 ×5**」标题 + 数字列表", () => {
	const report = `## 产出① 拉片报告
- **封面**:示例
- **一句话结论**:快剪口播

**关键发现 ×5**
1. 开场 0.5s 硬切撞色大字卡建立钩子
2. 全程 BGM 卡点切镜,每 2 拍一刀
3. 关键词用黄底黑字撞色高亮
4. 画面右下角固定品牌浮标
5. 收尾 CTA 用箭头动效引导

## 配帧逐段表
| 时间码 | 代表帧 |`;
	const f = extractKeyFindings(report);
	expect(f).toHaveLength(5);
	expect(f[0]).toBe("开场 0.5s 硬切撞色大字卡建立钩子");
	expect(f[4]).toBe("收尾 CTA 用箭头动效引导");
});

test("升级版三产出结构:Hook拆解/情绪曲线/可复刻度在前,关键发现照常抽且不溢到产出③", () => {
	// 锚定首个「关键发现」,不被前面的 Hook/情绪曲线/可复刻度小节干扰;停在配帧逐段表,
	// 不越界到后面的「产出③ 二次创作素材包(改写标题…)」。守住拉片→选题池互喂兼容性。
	const report = `## 产出① 拉片报告
- **Hook 拆解(前 3 秒)**:类型=反差数据 | 强度 9/10
- **内容结构 + 情绪曲线**:钩子→痛点→揭示→CTA,先抑后扬
- **可复刻度评分 7/10**:拍摄8 图形6
- **关键发现 ×5**
1. 开头 3 秒用具体数字制造反差
2. 每 8 秒一个信息钩子维持留存
3. 字幕用撞色高亮关键词
4. BGM 在揭示点卡鼓点
5. 结尾 CTA 用提问引导评论
- **配帧逐段表**:时间码 | 代表帧
## 产出③ 二次创作素材包
- **改写标题 ×8**:原 → 角度 → 标题`;
	const f = extractKeyFindings(report);
	expect(f).toHaveLength(5);
	expect(f[0]).toBe("开头 3 秒用具体数字制造反差");
	expect(f[4]).toBe("结尾 CTA 用提问引导评论");
});

test("遇到下游小节(配帧/产出②)即停,不越界", () => {
	const report = `**关键发现 ×5**
- 第一条
- 第二条
**配帧逐段表**(每段一行):时间码 | 代表帧
- 这行不该被算进发现`;
	expect(extractKeyFindings(report)).toEqual(["第一条", "第二条"]);
});

test("CJK 圈号列表 + 强调标记清洗", () => {
	const report = `### 关键发现
① **撞色高亮**建立视觉锚点
② 卡点剪辑制造节奏
③ \`Remotion\` 图形层做动效`;
	expect(extractKeyFindings(report)).toEqual([
		"撞色高亮建立视觉锚点",
		"卡点剪辑制造节奏",
		"Remotion 图形层做动效",
	]);
});

test("抽不到关键发现段→空数组(不编造)", () => {
	expect(extractKeyFindings("## 随便\n没有那个段落\n- a\n- b")).toEqual([]);
	expect(extractKeyFindings("")).toEqual([]);
});

test("max 截断", () => {
	const report = `关键发现\n- a\n- b\n- c\n- d`;
	expect(extractKeyFindings(report, 2)).toEqual(["a", "b"]);
});

test("findingsToTopicCards 造卡:稳定 id / 注入字段 / 标题截断", () => {
	const report = `**关键发现 ×5**\n- 短发现\n- ${"很".repeat(50)}`;
	const cards = findingsToTopicCards(report, "lp-123", "示例视频");
	expect(cards).toHaveLength(2);
	expect(cards[0].id).toBe("lp-123-f0");
	expect(cards[0].kind).toBe("rec");
	expect(cards[0].status).toBe("候选");
	expect(cards[0].angle).toBe("短发现");
	expect(cards[0].why).toContain("示例视频");
	expect(cards[0].origin).toBe("output/analyses/lp-123/report.md");
	// 第二条标题被截断带省略号,但 angle 保留全文
	expect(cards[1].title.endsWith("…")).toBe(true);
	expect(cards[1].angle.length).toBe(50);
});
