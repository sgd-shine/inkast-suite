import { useEffect, useState } from "react";
import { CameraOverlay } from "./components/camera-overlay/CameraOverlay";
import { DrawOverlay } from "./components/draw-overlay/DrawOverlay";
import { CountdownOverlay } from "./components/launch/CountdownOverlay.tsx";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { Prompter } from "./components/prompter/Prompter";
import { RegionSelect } from "./components/region-select/RegionSelect";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { Workspace } from "./components/workspace/Workspace";
import { ShortcutsProvider } from "./contexts/ShortcutsContext";
import { loadAllCustomFonts } from "./lib/customFonts";

export default function App() {
	const [windowType, setWindowType] = useState(
		() => new URLSearchParams(window.location.search).get("windowType") || "",
	);

	useEffect(() => {
		const type = new URLSearchParams(window.location.search).get("windowType") || "";
		if (type !== windowType) {
			setWindowType(type);
		}

		if (
			type === "hud-overlay" ||
			type === "source-selector" ||
			type === "countdown-overlay" ||
			type === "camera-overlay" ||
			type === "draw-overlay" ||
			type === "prompter" ||
			type === "region-selector"
		) {
			document.body.style.background = "transparent";
			document.documentElement.style.background = "transparent";
			document.getElementById("root")?.style.setProperty("background", "transparent");
		}

		// HUD is a fixed-size BrowserWindow; pin the document shell and hide overflow
		// so the renderer can't introduce scrollbars (see issue #305).
		if (type === "hud-overlay") {
			document.documentElement.style.height = "100%";
			document.documentElement.style.overflow = "hidden";
			document.body.style.height = "100%";
			document.body.style.margin = "0";
			document.body.style.overflow = "hidden";
			const root = document.getElementById("root");
			root?.style.setProperty("height", "100%");
			root?.style.setProperty("min-height", "0");
			root?.style.setProperty("overflow", "hidden");
		}
	}, [windowType]);

	useEffect(() => {
		// Load custom fonts on app initialization
		loadAllCustomFonts().catch((error) => {
			console.error("Failed to load custom fonts:", error);
		});
	}, []);

	const content = (() => {
		switch (windowType) {
			case "hud-overlay":
				return <LaunchWindow />;
			case "source-selector":
				return <SourceSelector />;
			case "countdown-overlay":
				return <CountdownOverlay />;
			case "camera-overlay":
				return <CameraOverlay />;
			case "draw-overlay":
				return <DrawOverlay />;
			case "prompter":
				return <Prompter />;
			case "region-selector":
				return <RegionSelect />;
			// Inkast 整合:编辑器窗口 = 5-Tab 工作台外壳(录制 Tab 内嵌完整编辑器)。
			// 窗口类型仍是 editor,main.ts 的窗口生命周期/菜单/未保存关闭流全部不变。
			case "editor":
				return (
					<ShortcutsProvider>
						<Workspace />
					</ShortcutsProvider>
				);
			default:
				return (
					<div className="w-full h-full bg-background text-foreground">
						<h1>Inkast</h1>
					</div>
				);
		}
	})();

	return (
		<TooltipProvider>
			{content}
			<Toaster theme="dark" className="pointer-events-auto" />
		</TooltipProvider>
	);
}
