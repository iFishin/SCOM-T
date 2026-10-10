import yaml from "js-yaml";
import { parseResponseSetDoc, serializeResponseSetDoc } from "../utils/responseSetYaml";
import type { ResponseSet } from "../utils/responseSetYaml";
import { serializeToYaml, parseYamlToRows, type PromptRow } from "../utils/yamlConfig";

// ── Types ──

export type MarketplaceItemType = "response_set" | "prompt_config" | "command_text";

export type MarketplaceItem = {
  id: string;
  name: string;
  description?: string;
  type: MarketplaceItemType;
  uploadedBy?: string;
  updatedAt?: string;
};

export type MarketplaceFetchState = "idle" | "loading" | "loaded" | "error";

export type MarketplaceDownload =
  | { type: "response_set"; set: ResponseSet }
  | { type: "prompt_config"; rows: PromptRow[] }
  | { type: "command_text"; text: string };

export class ItemExistsError extends Error {
  existing: { name: string; type: MarketplaceItemType; updatedAt?: string };
  constructor(existing: { name: string; type: MarketplaceItemType; updatedAt?: string }) {
    super("Item already exists");
    this.existing = existing;
  }
}

type ValidationResult =
  | { valid: true; set: ResponseSet }
  | { valid: false; error: string };

const MAX_COMMANDS = 500;

// ── Validation ──

export function validateResponseSetPayload(id: string, text: string): ValidationResult {
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

  // Delegate the field mapping to the shared parser so the marketplace and the
  // on-disk store can never drift apart.
  const set = parseResponseSetDoc(obj, id);
  if (!set) {
    return { valid: false, error: "Malformed payload" };
  }
  return { valid: true, set: { ...set, id, name: obj.name } };
}

function authHeaders(authToken?: string): Record<string, string> {
  if (!authToken || !authToken.trim()) {
    throw new Error("Cloud marketplace requires an auth token");
  }
  return { Authorization: `Bearer ${authToken.trim()}` };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string") return data.error;
  } catch {
    // ignore
  }
  return `Request failed: ${res.status}`;
}

async function readErrorBody(res: Response): Promise<{ error?: string; existing?: Record<string, unknown> }> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ── Hook ──

export function useCloudMarketplace() {
  async function listMarketplaceItems(serverUrl: string, authToken?: string): Promise<MarketplaceItem[]> {
    const base = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/items`, {
      headers: authHeaders(authToken),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Malformed marketplace list response");
    return data
      .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: typeof item.description === "string" ? item.description : undefined,
        type: (item.type === "prompt_config" ? "prompt_config" : item.type === "command_text" ? "command_text" : "response_set") as MarketplaceItemType,
        uploadedBy: typeof item.uploaded_by === "string" ? item.uploaded_by : undefined,
        updatedAt: typeof item.updated_at === "string" ? item.updated_at : undefined,
      }));
  }

  async function downloadMarketplaceItem(
    serverUrl: string,
    id: string,
    authToken?: string,
  ): Promise<MarketplaceDownload> {
    const base = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/items/${encodeURIComponent(id)}`, {
      headers: authHeaders(authToken),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    const data = await res.json();
    if (!data || typeof data.payload !== "string") throw new Error("Malformed marketplace item response");

    if (data.type === "prompt_config") {
      const result = parseYamlToRows(data.payload);
      if (!result.valid) throw new Error(result.error);
      return { type: "prompt_config", rows: result.rows };
    }

    if (data.type === "command_text") {
      return { type: "command_text", text: data.payload };
    }

    const result = validateResponseSetPayload(id, data.payload);
    if (!result.valid) throw new Error(result.error);
    return { type: "response_set", set: result.set };
  }

  async function uploadMarketplaceItem(
    serverUrl: string,
    id: string,
    type: MarketplaceItemType,
    content: ResponseSet | PromptRow[] | string,
    authToken?: string,
    overwrite?: boolean,
    uploadedBy?: string,
  ): Promise<void> {
    const base = serverUrl.replace(/\/+$/, "");
    const name = type === "response_set" ? (content as ResponseSet).name : id;
    const description = type === "response_set" ? (content as ResponseSet).description : undefined;
    const payload =
      type === "response_set"
        ? serializeResponseSetDoc(content as ResponseSet)
        : type === "prompt_config"
          ? serializeToYaml(content as PromptRow[])
          : (content as string);
    const res = await fetch(`${base}/items/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...authHeaders(authToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, type, payload, overwrite: overwrite === true, uploaded_by: uploadedBy || undefined }),
    });
    if (res.status === 409) {
      const body = await readErrorBody(res);
      const existing = (body.existing ?? {}) as Record<string, unknown>;
      throw new ItemExistsError({
        name: typeof existing.name === "string" ? existing.name : id,
        type: existing.type === "prompt_config" ? "prompt_config" : existing.type === "command_text" ? "command_text" : "response_set",
        updatedAt: typeof existing.updated_at === "string" ? existing.updated_at : undefined,
      });
    }
    if (!res.ok) throw new Error(await readErrorMessage(res));
  }

  async function deleteMarketplaceItem(serverUrl: string, id: string, authToken?: string): Promise<void> {
    const base = serverUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(authToken),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
  }

  return {
    listMarketplaceItems,
    downloadMarketplaceItem,
    uploadMarketplaceItem,
    deleteMarketplaceItem,
  };
}
