/**
 * OpenRouter balance in footer status.
 *
 * Reads baseUrl and apiKey of provider "openrouter-proxy" from ~/.pi/agent/models.json,
 * calls GET {baseUrl}/credits and shows "OR balance: $X.XX" in the footer.
 * Refreshes on session start, after agent settles, every 5 min, and via /or-balance.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER = "openrouter-proxy";
const STATUS_KEY = "openrouter-balance";
const REFRESH_MS = 5 * 60 * 1000;

interface ProviderConfig {
	baseUrl?: string;
	apiKey?: string;
}

async function loadProvider(): Promise<ProviderConfig> {
	const raw = await readFile(join(homedir(), ".pi", "agent", "models.json"), "utf8");
	const json = JSON.parse(raw) as { providers?: Record<string, ProviderConfig> };
	const provider = json.providers?.[PROVIDER];
	if (!provider?.baseUrl || !provider.apiKey) {
		throw new Error(`provider "${PROVIDER}" not found in models.json`);
	}
	return provider;
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

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;

	async function refresh(ctx: ExtensionContext) {
		try {
			const balance = await fetchBalance();
			ctx.ui.setStatus(STATUS_KEY, `OR balance: $${balance.toFixed(2)}`);
		} catch (err) {
			ctx.ui.setStatus(STATUS_KEY, `OR balance: n/a`);
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
