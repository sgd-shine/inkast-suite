/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--radix-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--radix-accordion-content-height)" },
					to: { height: "0" },
				},
				"record-pulse": {
					"0%, 100%": { boxShadow: "0 0 8px rgba(239, 68, 68, 0.15)" },
					"50%": { boxShadow: "0 0 16px rgba(239, 68, 68, 0.4)" },
				},
				"mic-panel-in": {
					from: { opacity: "0", transform: "translateY(4px)" },
					to: { opacity: "1", transform: "translateY(0)" },
				},
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"record-pulse": "record-pulse 1.5s ease-in-out infinite",
				"mic-panel-in": "mic-panel-in 0.15s ease-out",
			},
			boxShadow: {
				"hud-bar": "0 2px 16px rgba(0, 0, 0, 0.25), 0 0 40px rgba(100, 80, 200, 0.08)",
				"mic-panel": "0 2px 12px rgba(0, 0, 0, 0.2), 0 0 30px rgba(100, 80, 200, 0.06)",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			colors: {
				// Inkast 品牌色系(全局基准 · §2「各 Tab 同套变量」的单一来源)。
				// 现各 Tab 已统一用这套绿色系字面值(无蓝色原型残留);此处收成具名 token
				// 作为权威调色板,新代码可写 bg-ink-green 等,旧字面值与之等值。
				ink: {
					base: "#0A0C0E", // 全局底
					surface: "#0C0F12", // 头部/侧栏面
					card: "#15181C", // 卡片面
					green: "#34B27B", // 主品牌绿
					"green-2": "#3DC489", // 浅绿强调(文字/图标)
					"green-ink": "#06140D", // 绿底上的深字
				},
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				chart: {
					1: "hsl(var(--chart-1))",
					2: "hsl(var(--chart-2))",
					3: "hsl(var(--chart-3))",
					4: "hsl(var(--chart-4))",
					5: "hsl(var(--chart-5))",
				},
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
};
