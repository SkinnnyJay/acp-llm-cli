import { describe, expect, it } from "vitest";
import { extractModelIds, extractRetiredModelIds } from "../scripts/model.constants";

describe("extractModelIds", () => {
  it("anthropic: keeps ids from status-table rows that are not retired", () => {
    const page = [
      "| API model name             | Current state | Deprecated     | Tentative retirement date |",
      "| :------------------------- | :------------ | :------------- | :------------------------ |",
      "| claude-fable-5-2           | Active        | N/A            | Not sooner than 2027      |",
      "| claude-sonnet-4-5-20250929 | Deprecated    | September 2026 | November 30, 2026         |",
      "| claude-opus-4-20250514     | Retired       | April 14, 2026 | June 15, 2026             |",
      "| November 30, 2026 | `claude-sonnet-4-5-20250929` | `claude-sonnet-5-5` |",
      "Migrate to `claude-opus-5-5`.",
    ].join("\n");
    expect(extractModelIds("anthropic", page)).toEqual([
      "claude-fable-5-2",
      "claude-sonnet-4-5-20250929",
    ]);
  });

  it("openai: keeps model links, drops images, family names and other modalities", () => {
    const page = [
      '<a href="/api/docs/models/gpt-6.1-sol">GPT-6.1 Sol</a>',
      '<a href="/api/docs/models/gpt-6-luna">GPT-6 Luna</a>',
      '<a href="/api/docs/models/gpt-6-luna">GPT-6 Luna</a>',
      '<a href="/api/docs/models/o3-mini">o3 mini</a>',
      '<a href="/api/docs/models/gpt-image-2.6-flare">image</a>',
      '<a href="/api/docs/models/gpt-realtime-2">realtime</a>',
      '<a href="/api/docs/models/gpt-6-family">family</a>',
      "background-image:url(/images/api/models/gpt-6-astra-texture.webp)",
      '<img src="/images/api/models/icons/gpt-6-cyber.png" alt="gpt-6-cyber"/>',
      "GPT-6 is described in gpt-6-family",
    ].join("\n");
    expect(extractModelIds("openai", page)).toEqual(["gpt-6.1-sol", "gpt-6-luna", "o3-mini"]);
  });

  it("gemini: keeps ids on code-only list lines, drops anchors, slugs and other modalities", () => {
    const page = [
      '## Gemini 2.5 Flash  {% id="gemini-25-flash" %}',
      "  `gemini-2.5-flash` is [deprecated](/docs/deprecations#gemini-2.5-flash-models)",
      "  * [Gemini 3.8 Flash](/docs/models/gemini-3.8-flash)",
      "  * `gemini-3.8-flash`",
      "  * `gemini-2.5-flash`",
      "  * `gemini-2.5-flash`",
      "  * `gemini-3.8-flash-tts`",
      "  * `gemini-3.1-flash-live-preview`",
      "  * `gemini-3.5-transcribe`   ",
      "    `gemini-3.5-transcribe-live`",
      "  * `gemini-2.5-flash-image`",
      "  * `gemini-embedding-001`",
      "  * `gemini-2.5-flash-models`",
      "For example: `gemini-3.6-flash`.",
      '{% id="gemini-3-8-flash" %}',
    ].join("\n");
    expect(extractModelIds("gemini", page)).toEqual(["gemini-3.8-flash", "gemini-2.5-flash"]);
  });

  it("gemini: reads several ids from one line", () => {
    expect(extractModelIds("gemini", "  * `gemini-3.5-pro`   \n    `gemini-3.4-pro`")).toEqual([
      "gemini-3.5-pro",
      "gemini-3.4-pro",
    ]);
  });

  it("xai: keeps quoted ids from the page's model data, drops other modalities and slugs", () => {
    const page = [
      '<a href="/developers/grok-4-7">Grok 4.7</a> utm_content=highlights-grok-47',
      '<a href="/grok-bot/overview">Grok Bot</a>',
      '{"languageModels":[{"name":"grok-4.7","version":"1.0"}],',
      '"aliases":["grok-4.20-reasoning","grok-4.20","grok-4.7"]},',
      '{"imageModels":[{"name":"grok-imagine-image"}]}',
    ].join("\n");
    expect(extractModelIds("xai", page)).toEqual(["grok-4.7", "grok-4.20-reasoning", "grok-4.20"]);
  });

  it("returns nothing for an unrecognised page or vendor", () => {
    expect(extractModelIds("openai", "<html>no models here</html>")).toEqual([]);
    expect(extractModelIds("other", "`claude-opus-5-5`")).toEqual([]);
  });
});

describe("extractRetiredModelIds", () => {
  const page = [
    "| claude-fable-5-2           | Active        | N/A            | Not sooner than 2027      |",
    "| claude-sonnet-4-5-20250929 | Deprecated    | September 2026 | November 30, 2026         |",
    "| claude-opus-4-20250514     | Retired       | April 14, 2026 | June 15, 2026             |",
  ].join("\n");

  it("anthropic: returns retired ids and each undated alias", () => {
    expect(extractRetiredModelIds("anthropic", page)).toEqual([
      "claude-opus-4-20250514",
      "claude-opus-4",
    ]);
  });

  it("returns [] for another vendor", () => {
    expect(extractRetiredModelIds("openai", page)).toEqual([]);
  });
});
