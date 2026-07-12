import { Fragment, type ReactNode } from "react";
import { type MdBlock, parseInline, parseMarkdownBlocks } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// 安全的 Markdown 渲染:把解析出的块/行内 token 构建成 React 元素(不用 dangerouslySetInnerHTML,
// 无 XSS 面)。覆盖拉片报告用到的子集;样式贴合暗色面板。见 src/lib/markdown.ts 的取舍说明。

/** 行内 token → React 节点(粗体/斜体/行内代码/纯文本)。 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
	return parseInline(text).map((tok, idx) => {
		const key = `${keyPrefix}-${idx}`;
		switch (tok.type) {
			case "bold":
				return (
					<strong key={key} className="font-semibold text-slate-100">
						{tok.text}
					</strong>
				);
			case "italic":
				return (
					<em key={key} className="italic">
						{tok.text}
					</em>
				);
			case "code":
				return (
					<code
						key={key}
						className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[11.5px] text-[#3DC489]"
					>
						{tok.text}
					</code>
				);
			default:
				return <Fragment key={key}>{tok.text}</Fragment>;
		}
	});
}

/** 多行文本(段落/引用):行间用 <br/>,各行行内解析。 */
function renderMultiline(text: string, keyPrefix: string): ReactNode[] {
	return text.split("\n").map((line, idx) => (
		<Fragment key={`${keyPrefix}-${idx}`}>
			{idx > 0 && <br />}
			{renderInline(line, `${keyPrefix}-${idx}`)}
		</Fragment>
	));
}

function renderBlock(block: MdBlock, i: number): ReactNode {
	const key = `${block.type}-${i}`;
	switch (block.type) {
		case "heading": {
			const cls =
				block.level === 1
					? "mt-4 mb-2 text-[16px] font-bold text-slate-100"
					: block.level === 2
						? "mt-4 mb-1.5 border-b border-white/[0.08] pb-1 text-[14px] font-semibold text-slate-100"
						: "mt-3 mb-1 text-[12.5px] font-semibold text-slate-200";
			return (
				<div key={key} className={cls}>
					{renderInline(block.text, key)}
				</div>
			);
		}
		case "hr":
			return <hr key={key} className="my-3 border-white/[0.08]" />;
		case "list": {
			const inner = block.items.map((it, j) => (
				<li
					key={`${key}-${j}`}
					className="text-[12.5px] leading-relaxed text-slate-300 marker:text-slate-600"
				>
					{renderInline(it, `${key}-${j}`)}
				</li>
			));
			return block.ordered ? (
				<ol key={key} className="my-1.5 list-decimal space-y-1 pl-5">
					{inner}
				</ol>
			) : (
				<ul key={key} className="my-1.5 list-disc space-y-1 pl-5">
					{inner}
				</ul>
			);
		}
		case "table":
			return (
				<div key={key} className="my-2 overflow-x-auto custom-scrollbar">
					<table className="w-full border-collapse text-[11.5px]">
						<thead>
							<tr>
								{block.headers.map((hd, j) => (
									<th
										key={`${key}-h-${j}`}
										className="border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-left font-semibold text-slate-200"
									>
										{renderInline(hd, `${key}-h-${j}`)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{block.rows.map((row, r) => (
								<tr key={`${key}-r-${r}`}>
									{row.map((c, cI) => (
										<td
											key={`${key}-r-${r}-${cI}`}
											className="border border-white/[0.08] px-2 py-1 align-top text-slate-300"
										>
											{renderInline(c, `${key}-r-${r}-${cI}`)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		case "code":
			return (
				<pre
					key={key}
					className="custom-scrollbar my-2 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-slate-300"
				>
					{block.text}
				</pre>
			);
		case "quote":
			return (
				<blockquote
					key={key}
					className="my-2 border-l-2 border-[#34B27B]/40 pl-3 text-[12.5px] italic text-slate-400"
				>
					{renderMultiline(block.text, key)}
				</blockquote>
			);
		default:
			return (
				<p key={key} className="my-1.5 text-[12.5px] leading-relaxed text-slate-300">
					{renderMultiline(block.text, key)}
				</p>
			);
	}
}

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
	const blocks = parseMarkdownBlocks(markdown);
	return <div className={cn("text-slate-300", className)}>{blocks.map(renderBlock)}</div>;
}

export default MarkdownView;
