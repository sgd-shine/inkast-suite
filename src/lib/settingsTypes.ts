// App 内「外部路径设置」共享类型(渲染/preload/主进程共用,无 node 依赖)。
// 负责人定调:别靠路径指向磁盘各处的散落文件、文件被移就坏 —— 把引擎/发布/驾驶舱三条外部
// 路径收进 App 内可视化设置,失效时 UI 里点「选择目录」重选,而非手改 userData/*.json。

/** 一条外部路径的当前状态。 */
export interface PathSetting {
	/** 当前解析到的路径(env → userData 配置 → 默认 三级回退后的结果)。 */
	path: string;
	/** 路径是否有效(引擎=含 video.sh;发布=含哨兵目录;驾驶舱=含 YYYY-MM-DD.json)。 */
	ok: boolean;
	/** 来源:env=环境变量覆盖(改配置不生效需改 env)/ config=App 内配置 / default=内置默认。 */
	source: "env" | "config" | "default";
	/** 仅引擎用:该路径是否就是 App 专属副本(userData/engine)。已采用=true,不再依赖外部开发树。 */
	managed?: boolean;
}

export interface AppSettings {
	engine: PathSetting; // video-pipeline 成片引擎根
	publishing: PathSetting; // 发布看板扫描根(Publishing)
	cockpit: PathSetting; // 驾驶舱每日选题 vault 目录
}

/** 选目录结果。canceled=用户取消;ok=true 时 path 为新路径。 */
export interface PickResult {
	ok: boolean;
	canceled?: boolean;
	path?: string;
	error?: string;
}

/** 导出备份结果(主线三):把 App 自有状态/配置拷到用户选定目录(不含媒体文件与密钥)。 */
export interface BackupResult {
	ok: boolean;
	canceled?: boolean;
	/** 备份输出目录(Inkast-Backup-<时间戳>)。 */
	dir?: string;
	/** 已拷贝的文件名。 */
	files?: string[];
	/** 不存在/拷贝失败而跳过的项。 */
	skipped?: string[];
	error?: string;
}
