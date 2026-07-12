// 驾驶舱信源(radar/hot/social)的 body 清洗。
//
// vault 里的 body 由 Codex(库外 runtime,App 只读不能改其生成)机械拼成,混了三类内容:
//   ① 真正的要点(被模板前缀/套话尾包裹):"<来源> 这条信号的要点是：<要点>。它先作为「X」的事实入口，后续判断要回到原文和第二来源。"
//   ② 抓取噪音:"可读段落补充：English Deutsch Español…"(网页导航菜单/截断句,无意义)
//   ③ 元数据说明:"承重：只作热度和选题灵感，不单独写成事实。"
// 直接全量展示 → 负责人反馈"意义不大、不直观"。这里只**过滤噪音 + 裁掉模板套话**,
// 不改写/不编造事实(守「无假数据」铁律):② ③ 整段删,① 去掉前缀和尾巴只留要点。

const NOISE_HEADS = ["可读段落补充", "承重"] as const;

// 模板前缀:"…这条信号的要点是：" 或 "…这条视频围绕「X」展开，重点是"
const LEAD_PATTERNS: RegExp[] = [
	/^.*?这条信号的要点是[：:]\s*/u,
	/^.*?这条视频围绕[「『][^」』]*[」』]展开[，,]\s*重点是\s*/u,
];

// 套话尾:"。它先作为「X」的…入口，后续…(原文|原视频)和第二来源。"
const TAIL_PATTERN = /[。.]?\s*它先作为[「『][^」』]*[」』].*?第二来源[。.]?\s*$/u;

/** 把一条信源的 body 段落清洗成「只剩要点」。空/全噪音 → 返回空数组(调用方据此隐藏区块)。 */
export function cleanFeedBody(body: readonly string[] | undefined | null): string[] {
	if (!body) return [];
	const out: string[] = [];
	for (const raw of body) {
		let s = (raw ?? "").trim();
		if (!s) continue;
		if (NOISE_HEADS.some((h) => s.startsWith(h))) continue; // ② ③ 整段噪音/元数据
		for (const re of LEAD_PATTERNS) s = s.replace(re, "");
		s = s.replace(TAIL_PATTERN, "").trim();
		if (s) out.push(s);
	}
	return out;
}
