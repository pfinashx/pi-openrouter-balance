/**
 * OpenRouter balance in footer status. Version 0.2.0
 *
 * Reads baseUrl and apiKey of provider "openrouter-proxy" from ~/.pi/agent/models.json,
 * calls GET {baseUrl}/credits and shows "○ ⭕ OR balance: $X.XX" in the footer.
 * The balance is colored by thresholds from ~/.pi/agent/openrouter-balance.json.
 * Refreshes on session start, after agent settles, every 5 min, and via /or-balance.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openrouter-proxy";
const STATUS_KEY = "openrouter-balance";
const REFRESH_MS = 5 * 60 * 1000;
const AGENT_DIR = join(homedir(), ".pi", "agent");

interface ProviderConfig {
	baseUrl?: string;
	apiKey?: string;
}

interface Thresholds {
	green: number;
	yellow: number;
}

interface BalanceConfig {
	icon: string;
	thresholds: Thresholds;
}

const DEFAULT_CONFIG: BalanceConfig = {
	icon: "⭕",
	thresholds: { green: 20, yellow: 5 },
};

type ThemeColor = "success" | "warning" | "error";

async function loadProvider(): Promise<ProviderConfig> {
	const raw = await readFile(join(AGENT_DIR, "models.json"), "utf8");
	const json = JSON.parse(raw) as { providers?: Record<string, ProviderConfig> };
	const provider = json.providers?.[PROVIDER];
	if (!provider?.baseUrl || !provider.apiKey) {
		throw new Error(`provider "${PROVIDER}" not found in models.json`);
	}
	return provider;
}

async function loadConfig(): Promise<BalanceConfig> {
	let user: Partial<BalanceConfig>;
	try {
		user = JSON.parse(await readFile(join(AGENT_DIR, "openrouter-balance.json"), "utf8"));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_CONFIG;
		throw new Error(`openrouter-balance.json: ${(err as Error).message}`);
	}
	return {
		icon: typeof user.icon === "string" ? user.icon : DEFAULT_CONFIG.icon,
		thresholds: {
			green: user.thresholds?.green ?? DEFAULT_CONFIG.thresholds.green,
			yellow: user.thresholds?.yellow ?? DEFAULT_CONFIG.thresholds.yellow,
		},
	};
}

async function fetchBalance(): Promise<number> {
	const { baseUrl, apiKey } = await loadProvider();
	const response = await fetch(`${baseUrl!.replace(/\/$/, "")}/credits`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const payload = (await response.json()) as { data: { total_credits: number; total_usage: number } };
	return payload.data.total_credits - payload.data.total_usage;
}

function balanceColor(balance: number, t: Thresholds): ThemeColor {
	if (balance >= t.green) return "success";
	if (balance >= t.yellow) return "warning";
	return "error";
}

function renderStatus(ctx: ExtensionContext, cfg: BalanceConfig, balance: number | undefined) {
	const theme = ctx.ui.theme;
	const fg = (color: ThemeColor | "dim" | "muted", text: string) => (theme?.fg ? theme.fg(color, text) : text);
	const sep = fg("dim", "○");
	const label = fg("muted", "OR balance: ");
	const value =
		balance === undefined ? fg("dim", "n/a") : fg(balanceColor(balance, cfg.thresholds), `$${balance.toFixed(2)}`);
	ctx.ui.setStatus(STATUS_KEY, `${sep} ${cfg.icon} ${label}${value}`);
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;

	async function refresh(ctx: ExtensionContext) {
		let cfg: BalanceConfig;
		try {
			cfg = await loadConfig();
		} catch (err) {
			cfg = DEFAULT_CONFIG;
			ctx.ui.notify((err as Error).message, "warning");
		}
		try {
			const balance = await fetchBalance();
			renderStatus(ctx, cfg, balance);
		} catch (err) {
			renderStatus(ctx, cfg, undefined);
			ctx.ui.notify(`OpenRouter balance: ${(err as Error).message}`, "warning");
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await refresh(ctx);
		clearInterval(timer);
		timer = setInterval(() => void refresh(ctx), REFRESH_MS);
		timer.unref?.();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		clearInterval(timer);
		timer = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("or-balance", {
		description: "Refresh OpenRouter balance in footer",
		handler: async (_args, ctx) => {
			await refresh(ctx);
		},
	});
}
