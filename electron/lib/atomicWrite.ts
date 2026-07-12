// 原子写文件:写到同目录临时文件,再 rename 覆盖目标。
// 为什么需要:裸 fs.writeFileSync 以 O_TRUNC 打开 —— 先把目标截断成 0 字节再写。若在
// 「截断后、写完前」进程崩溃/掉电/被 kill,目标文件留成截断的非法内容;各 loader 的
// try/catch 会静默回退默认值 = 无声丢数据(密钥清空 / 选题流转回 EMPTY / 任务历史清空)。
// rename 在同一文件系统上是原子操作,故读者要么看到旧内容、要么看到完整新内容,绝不截断。
import fs from "node:fs";

/**
 * 原子覆盖写。opts.mode 同时作用于临时文件创建(rename 保留其权限),用于 keys.json 0600。
 * 失败时清理残留的临时文件,不留垃圾。
 */
export function atomicWriteFileSync(file: string, data: string, opts?: { mode?: number }): void {
	const tmp = `${file}.inkast-tmp-${process.pid}`;
	try {
		fs.writeFileSync(tmp, data, opts?.mode != null ? { mode: opts.mode } : undefined);
		fs.renameSync(tmp, file);
	} catch (e) {
		try {
			fs.rmSync(tmp, { force: true });
		} catch {
			/* 临时文件清理失败:忽略,优先把原始写错误抛给调用方 */
		}
		throw e;
	}
}
