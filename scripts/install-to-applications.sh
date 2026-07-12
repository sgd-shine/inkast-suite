#!/usr/bin/env bash
# 把已打包并 resign 的 Inkast.app 安装到 /Applications,并刷新快捷方式 + 图标缓存。
#
# 解决"找不到优化后的最新版":历史上系统里堆了多个 Inkast 变体(com.sgd.inkast /
# com.sgd.inkast-suite / release 里的构建产物 / 桌面旧 symlink),打开的常常是旧的。
# 统一成单一入口 /Applications/Inkast.app,且每轮打包后自动:覆盖安装 + 桌面快捷方式
# 指向它 + 注销项目里 release 副本的索引 + 刷新 Dock 图标。
#
# 在 scripts/resign-local.sh 之后运行。打包链:
#   npx vite build && npx electron-builder --mac --arm64 --dir \
#     && bash scripts/resign-local.sh && bash scripts/install-to-applications.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
APP_NAME="${INKAST_APP_NAME:-Inkast.app}"
SRC="release/${VERSION}/mac-arm64/${APP_NAME}"
DEST="/Applications/${APP_NAME}"
DESKTOP_LINK="${HOME}/Desktop/${APP_NAME}"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if [ ! -d "$SRC" ]; then
	echo "❌ 找不到构建产物: $SRC(先跑 electron-builder --mac --arm64 --dir)" >&2
	exit 1
fi

# 1. 覆盖安装到 /Applications。ditto 保留代码签名 + xattr → 录屏/摄像头 TCC 授权随签名身份保留,不失效。
rm -rf "$DEST"
ditto "$SRC" "$DEST"
echo "✓ 安装 → $DEST"

# 2. 桌面快捷方式:优先 Finder 别名(显示 App 绿色快门图标,一眼认出)。Finder 别名用 inode
#    bookmark,ditto 每轮换 inode 会让它失效,所以这里每轮重建。osascript 控制 Finder 若被拒,
#    回退 symlink(纯路径、永不失效、能打开,只是图标可能是通用样式)。
rm -f "$DESKTOP_LINK"
if osascript >/dev/null 2>&1 <<OSA
tell application "Finder"
	set newAlias to make alias file to (POSIX file "$DEST") at (path to desktop folder)
	set name of newAlias to "$APP_NAME"
end tell
OSA
then
	echo "✓ 桌面快捷方式(Finder 别名,显示 App 图标) → $DEST"
else
	ln -sfn "$DEST" "$DESKTOP_LINK"
	echo "✓ 桌面快捷方式(symlink 回退) → $DEST"
fi

# 3. LaunchServices:注销项目 release 里的同名构建产物,注册 /Applications 最新版。
#    ⚠️ 关键:光 -u 注销不够 —— 只要 release/ 里的 .app 文件还在磁盘上,Spotlight 过一会儿
#    会自动重新索引它 → 又冒出"第二个 App"。所以装好后直接删掉构建产物(/Applications 是
#    ditto 独立拷贝,删 release 源不影响它;下次打包 electron-builder 会重新生成)。
"$LSREGISTER" -u "$SRC" 2>/dev/null || true
"$LSREGISTER" -f "$DEST" 2>/dev/null || true
rm -rf "$SRC"
echo "✓ 启动数据库已更新 + 已删除 release 构建产物(系统只认 /Applications 这一份)"

# 4. 刷新 Dock 图标缓存,让启动台/Dock 立刻显示最新图标。只重启 Dock,不动 Finder(避免关掉用户的访达窗口)。
killall Dock 2>/dev/null || true
echo "✓ 图标已刷新"

echo "✅ 完成:打开「${DEST}」或双击桌面「${APP_NAME%.app}」即是最新版"
