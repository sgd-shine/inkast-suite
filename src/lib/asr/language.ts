// Inkast §4:把 app 的界面 locale 映射成 whisper 的语言名(transformers.js 接受
// 小写英文语言名)。whisper 在 transformers.js 里不传 language 会"默认英语"(不是
// 自动检测),所以中文录音不给提示会转成乱码英文 —— 用界面语言当默认提示最稳妥。
// 未知 locale 返回 undefined → 交给 whisper 默认(英语)。

const PRIMARY_SUBTAG_TO_WHISPER: Record<string, string> = {
	en: "english",
	zh: "chinese",
	ja: "japanese",
	ko: "korean",
	es: "spanish",
	fr: "french",
	it: "italian",
	ru: "russian",
	ar: "arabic",
	tr: "turkish",
	vi: "vietnamese",
	pt: "portuguese",
	de: "german",
};

/** "zh-CN" → "chinese";"en" → "english";未知 → undefined。 */
export function localeToWhisperLanguage(locale: string | undefined | null): string | undefined {
	if (!locale) return undefined;
	const primary = locale.toLowerCase().split(/[-_]/)[0];
	return PRIMARY_SUBTAG_TO_WHISPER[primary];
}
