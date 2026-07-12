import { describe, expect, it } from "vitest";
import { localeToWhisperLanguage } from "./language";

describe("localeToWhisperLanguage", () => {
	it("maps zh variants to chinese", () => {
		expect(localeToWhisperLanguage("zh-CN")).toBe("chinese");
		expect(localeToWhisperLanguage("zh-TW")).toBe("chinese");
		expect(localeToWhisperLanguage("zh")).toBe("chinese");
	});

	it("maps common app locales to whisper language names", () => {
		expect(localeToWhisperLanguage("en")).toBe("english");
		expect(localeToWhisperLanguage("ja-JP")).toBe("japanese");
		expect(localeToWhisperLanguage("ko-KR")).toBe("korean");
		expect(localeToWhisperLanguage("pt-BR")).toBe("portuguese");
		expect(localeToWhisperLanguage("fr")).toBe("french");
	});

	it("is case- and separator-insensitive", () => {
		expect(localeToWhisperLanguage("ZH-cn")).toBe("chinese");
		expect(localeToWhisperLanguage("en_US")).toBe("english");
	});

	it("returns undefined for empty or unknown locales (whisper defaults to english)", () => {
		expect(localeToWhisperLanguage(undefined)).toBeUndefined();
		expect(localeToWhisperLanguage(null)).toBeUndefined();
		expect(localeToWhisperLanguage("")).toBeUndefined();
		expect(localeToWhisperLanguage("xx")).toBeUndefined();
	});
});
