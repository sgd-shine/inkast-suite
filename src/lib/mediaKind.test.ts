import { expect, test } from "vitest";
import { mediaKind } from "./mediaKind";

test("图片后缀(含 query/hash)", () => {
	expect(mediaKind("https://x.com/a.jpg")).toBe("image");
	expect(mediaKind("https://x.com/a.PNG?w=200")).toBe("image");
	expect(mediaKind("https://x.com/a.webp#frag")).toBe("image");
});

test("视频后缀", () => {
	expect(mediaKind("https://x.com/clip.mp4")).toBe("video");
	expect(mediaKind("/local/a.webm")).toBe("video");
});

test("文章/无后缀链接 → link;空 → link", () => {
	expect(mediaKind("https://blogs.nvidia.com/article")).toBe("link");
	expect(mediaKind("https://youtube.com/watch?v=abc")).toBe("link");
	expect(mediaKind(undefined)).toBe("link");
	expect(mediaKind("")).toBe("link");
});
