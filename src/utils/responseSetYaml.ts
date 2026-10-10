import yaml from "js-yaml";

/**
 * Response-set document model and its YAML form.
 *
 * Kept free of Tauri/IO so both the on-disk store (`useResponseSet`) and the
 * cloud marketplace share one mapping — duplicated mappings are how field
 * drift (e.g. a dropped `match_mode`) creeps in.
 */

export type ResponseSetCommand = {
  command: string;
  commandRegex?: boolean;
  isHex?: boolean;
  group?: string;
  description?: string;
  expectedResponses: string[];
  expectedResponseRegex?: boolean[];
  matchMode: "all" | "any";
};

export type ResponseSet = {
  id: string;
  name: string;
  description?: string;
  commands: ResponseSetCommand[];
};

/** Wire/document shape (`snake_case` differs from the in-memory model). */
export interface YamlResponseSet {
  name: string;
  description?: string;
  commands: {
    command: string;
    command_regex?: boolean;
    is_hex?: boolean;
    group?: string;
    description?: string;
    expected_responses?: string[];
    expected_responses_regex?: boolean[];
    match_mode?: "all" | "any";
  }[];
}

/**
 * Parse an already-`yaml.load`-ed document into a ResponseSet.
 * Returns null when the value is not a usable object.
 */
export function parseResponseSetDoc(raw: unknown, fallbackName: string): ResponseSet | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const doc = raw as YamlResponseSet;
  return {
    id: fallbackName,
    name: doc.name || fallbackName,
    description: typeof doc.description === "string" ? doc.description : undefined,
    commands: Array.isArray(doc.commands)
      ? doc.commands.map((c) => {
          const responses = Array.isArray(c.expected_responses) ? c.expected_responses.map(String) : [];
          const regex = Array.isArray(c.expected_responses_regex) ? c.expected_responses_regex : [];
          return {
            command: c.command || "",
            commandRegex: c.command_regex === true,
            isHex: c.is_hex === true,
            group: typeof c.group === "string" ? c.group : undefined,
            description: typeof c.description === "string" ? c.description : undefined,
            expectedResponses: responses,
            expectedResponseRegex: regex.length === responses.length ? regex : undefined,
            matchMode: c.match_mode === "any" ? ("any" as const) : ("all" as const),
          };
        }).filter((c) => c.command)
      : [],
  };
}

/** Serialize a ResponseSet into YAML text. */
export function serializeResponseSetDoc(set: ResponseSet): string {
  const doc: YamlResponseSet = {
    name: set.name,
    description: set.description,
    commands: set.commands.map((c) => {
      const hasRegex = c.expectedResponseRegex?.some(Boolean);
      return {
        command: c.command,
        command_regex: c.commandRegex || undefined,
        is_hex: c.isHex || undefined,
        group: c.group || undefined,
        description: c.description || undefined,
        expected_responses: c.expectedResponses.length > 0 ? c.expectedResponses : undefined,
        expected_responses_regex: hasRegex ? c.expectedResponseRegex : undefined,
        match_mode: c.matchMode === "any" ? "any" : undefined,
      };
    }),
  };
  return yaml.dump(doc, { indent: 2, lineWidth: -1, noRefs: true, quotingType: "'" });
}
