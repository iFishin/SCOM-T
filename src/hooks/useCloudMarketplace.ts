import yaml from "js-yaml";
import type { ResponseSet, ResponseSetCommand } from "./useResponseSet";

// ── Types ──

export type MarketplaceItem = {
  id: string;
  name: string;
  description?: string;
};

export type MarketplaceFetchState = "idle" | "loading" | "loaded" | "error";

type ValidationResult =
  | { valid: true; set: ResponseSet }
  | { valid: false; error: string };

const MAX_COMMANDS = 500;

// ── Validation ──

function validateResponseSetPayload(id: string, text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch {
    return { valid: false, error: "Invalid YAML" };
  }
  if (!raw || typeof raw !== "object") {
    return { valid: false, error: "Empty or malformed payload" };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { valid: false, error: "Missing name" };
  }
  if (!Array.isArray(obj.commands)) {
    return { valid: false, error: "Missing commands array" };
  }
  if (obj.commands.length > MAX_COMMANDS) {
    return { valid: false, error: `Too many commands (max ${MAX_COMMANDS})` };
  }

  const commands: ResponseSetCommand[] = [];
  for (const raw of obj.commands) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.command !== "string" || !c.command.trim()) continue;
    const responses = Array.isArray(c.expected_responses)
      ? c.expected_responses.filter((r) => typeof r === "string")
      : [];
    const regex = Array.isArray(c.expected_responses_regex)
      ? c.expected_responses_regex.filter((r) => typeof r === "boolean")
      : [];
    commands.push({
      command: c.command,
      expectedResponses: responses,
      expectedResponseRegex: regex.length === responses.length ? regex : undefined,
      matchMode: c.match_mode === "any" ? "any" : "all",
    });
  }

  return {
    valid: true,
    set: {
      id,
      name: obj.name,
      description: typeof obj.description === "string" ? obj.description : undefined,
      commands,
    },
  };
}

// ── Hook ──

export function useCloudMarketplace() {
  async function listMarketplaceItems(serverUrl: string, authToken?: string): Promise<MarketplaceItem[]> {
    const base = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/index.json`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });
    if (!res.ok) throw new Error(`Failed to list marketplace items: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Malformed marketplace list response");
    return data
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: typeof item.description === "string" ? item.description : undefined,
      }));
  }

  async function downloadMarketplaceItem(
    serverUrl: string,
    id: string,
    authToken?: string,
  ): Promise<ResponseSet> {
    const base = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/response-sets/${encodeURIComponent(id)}.yaml`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    });
    if (!res.ok) throw new Error(`Failed to download item: ${res.status}`);
    const text = await res.text();
    const result = validateResponseSetPayload(id, text);
    if (!result.valid) throw new Error(result.error);
    return result.set;
  }

  return {
    listMarketplaceItems,
    downloadMarketplaceItem,
  };
}
