// 由 URL 后缀判媒体类型(纯函数,可测)。驾驶舱媒体预览(§5.1):图片→缩略图+灯箱、视频→内联播、其余→链接。
export type MediaKind = "image" | "video" | "link";

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)$/;

export function mediaKind(url?: string): MediaKind {
	if (!url) return "link";
	const u = url.split(/[?#]/)[0].toLowerCase();
	if (IMAGE_EXT.test(u)) return "image";
	if (VIDEO_EXT.test(u)) return "video";
	return "link";
}
