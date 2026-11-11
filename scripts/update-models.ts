/**
 * Fetches available model IDs and writes src/domain/models/*.ts.
 * Run: npm run update-models
 *
 * Sources per vendor: its models API when its key is set, otherwise its public documentation page.
 * Env: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or GOOGLE_API_KEY, XAI_API_KEY
 * Optional: ACP_LLM_CLI_MODELS_DRY_RUN=1 to log only, no write.
 * Additive by default: existing ids are kept. ACP_LLM_CLI_MODELS_PRUNE=1 makes the fetch authoritative.
 * Router variants (ids containing ":") and Anthropic ids containing "." are always dropped.
 * A vendor whose page cannot be fetched or yields no ids keeps its file untouched.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_KEY } from "../src/domain/env.keys";
import { ModelIdSchema as ANTHROPIC_SCHEMA } from "../src/domain/models/anthropic.models";
import { ModelIdSchema as GEMINI_SCHEMA } from "../src/domain/models/gemini.models";
import { ModelIdSchema as OPENAI_SCHEMA } from "../src/domain/models/openai.models";
import { ModelIdSchema as XAI_SCHEMA } from "../src/domain/models/xai.models";
import {
  extractModelIds,
  extractRetiredModelIds,
  renderModelModule,
  selectModelIds,
} from "./model.constants";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const MODELS_DIR = join(ROOT, "src", "domain", "models");
const DRY_RUN = process.env[ENV_KEY.ACP_LLM_CLI_MODELS_DRY_RUN] === "1";

const PRUNE = process.env[ENV_KEY.ACP_LLM_CLI_MODELS_PRUNE] === "1";

const EXISTING: Record<string, readonly string[]> = {
  anthropic: ANTHROPIC_SCHEMA.options,
  openai: OPENAI_SCHEMA.options,
  gemini: GEMINI_SCHEMA.options,
  xai: XAI_SCHEMA.options,
};

function writeModelConstants(
  provider: string,
  modelIds: string[],
  headerComment: string,
  retired: readonly string[] = []
): void {
  // Anthropic ids never contain "."; those are router spellings (claude-opus-4.8 for claude-opus-4-8).
  const valid = (id: string) => provider !== "anthropic" || !id.includes(".");
  const merged = selectModelIds((EXISTING[provider] ?? []).filter(valid), modelIds.filter(valid), {
    prune: PRUNE,
  });
  // The refresh is additive, so ids the vendor has since retired are removed explicitly.
  const sorted = merged.filter((id) => !retired.includes(id));
  const content = renderModelModule(headerComment, sorted);

  const outPath = join(MODELS_DIR, `${provider}.models.ts`);
  if (DRY_RUN) {
    console.log(`[dry-run] would write ${outPath} (${sorted.length} models)`);
    return;
  }
  mkdirSync(MODELS_DIR, { recursive: true });
  writeFileSync(outPath, content, "utf8");
  console.log(`Wrote ${outPath} (${sorted.length} models)`);
}

async function fetchAnthropic(): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("ANTHROPIC_API_KEY not set, using the Anthropic documentation page instead");
    return [];
  }
  const out: string[] = [];
  let afterId: string | undefined;
  do {
    const url = new URL("https://api.anthropic.com/v1/models");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url.toString(), {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": key,
      },
    });
    if (!res.ok) {
      console.warn("Anthropic models fetch failed:", res.status, await res.text());
      break;
    }
    const data = (await res.json()) as {
      data?: { id?: string }[];
      last_id?: string;
      has_more?: boolean;
    };
    const list = data.data ?? [];
    for (const m of list) if (m.id) out.push(m.id);
    afterId = data.has_more ? data.last_id : undefined;
  } while (afterId);
  return out;
}

async function fetchOpenAI(): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("OPENAI_API_KEY not set, using the OpenAI documentation page instead");
    return [];
  }
  const out: string[] = [];
  let url: string | null = "https://api.openai.com/v1/models";
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.warn("OpenAI models fetch failed:", res.status, await res.text());
      break;
    }
    const data = (await res.json()) as {
      data?: { id?: string }[];
      next?: string | null;
    };
    const list = data.data ?? [];
    for (const m of list) if (m.id) out.push(m.id);
    url = data.next ?? null;
  }
  return out;
}

async function fetchGemini(): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    console.warn(
      "GEMINI_API_KEY / GOOGLE_API_KEY not set, using the Gemini documentation page instead"
    );
    return [];
  }
  const out: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("key", key);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.warn("Gemini models fetch failed:", res.status, await res.text());
      break;
    }
    const data = (await res.json()) as {
      models?: { name?: string }[];
      nextPageToken?: string;
    };
    const list = data.models ?? [];
    for (const m of list) {
      const name = m.name;
      if (name?.startsWith("models/")) out.push(name.replace(/^models\//, ""));
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function fetchXAI(): Promise<string[]> {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    console.warn("XAI_API_KEY not set, using the xAI documentation page instead");
    return [];
  }
  const res = await fetch("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.warn("xAI models fetch failed:", res.status, await res.text());
    return [];
  }
  const data = (await res.json()) as { data?: { id?: string }[] };
  const list = data.data ?? [];
  return list.map((m) => m.id).filter((id): id is string => Boolean(id));
}

const PAGES: Record<string, string> = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/model-deprecations.md",
  openai: "https://developers.openai.com/api/docs/models",
  gemini: "https://ai.google.dev/gemini-api/docs/models.md.txt",
  xai: "https://docs.x.ai/developers/models",
};

/** Public documentation page, used when the vendor's API key is not set. */
async function fetchPage(provider: string): Promise<{ ids: string[]; retired: string[] }> {
  const url = PAGES[provider] as string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "model-list-check" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`${provider} models page fetch failed:`, res.status);
      return { ids: [], retired: [] };
    }
    const text = await res.text();
    return {
      ids: extractModelIds(provider, text),
      retired: extractRetiredModelIds(provider, text),
    };
  } catch (err) {
    console.warn(`${provider} models page fetch error:`, err);
    return { ids: [], retired: [] };
  }
}

async function main(): Promise<void> {
  console.log(
    "Fetching model lists (provider APIs when keys are set, else documentation pages)..."
  );
  const apiLists = await Promise.all([fetchAnthropic(), fetchOpenAI(), fetchGemini(), fetchXAI()]);
  const headers: Record<string, string> = {
    anthropic: "Anthropic (Claude) model IDs",
    openai: "OpenAI model IDs",
    gemini: "Google Gemini model IDs",
    xai: "xAI (Grok) model IDs",
  };

  for (const [i, provider] of (["anthropic", "openai", "gemini", "xai"] as const).entries()) {
    const fromApi = apiLists[i] as string[];
    const page = fromApi.length ? undefined : await fetchPage(provider);
    const ids = page?.ids ?? fromApi;
    if (!ids.length) {
      console.warn(`No ${provider} model ids found, leaving its file untouched`);
      continue;
    }
    const source = fromApi.length ? "provider API" : "vendor documentation page";
    writeModelConstants(
      provider,
      ids,
      `${headers[provider]} — ${source}. Run script to refresh.`,
      page?.retired
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
