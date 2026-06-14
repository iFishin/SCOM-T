import yaml from "js-yaml";

/* ── PromptRow shape (mirrors the type in App.tsx) ── */
export interface PromptRow {
  id: number;
  selected: boolean;
  command: string;
  isHex: boolean;
  ender: "" | "\r\n" | "\r" | "\n";
  interval: string;
  device?: string;
  expectedResponses?: string[];
}

/* ── Type for the YAML document shape ── */
interface YamlCommand {
  command: string;
  hex_mode: boolean;
  line_ending: string;
  timeout: number;
  order: number;
  is_selected?: boolean;
  device?: string;
  expected_responses?: string[];
}

interface YamlDoc {
  Commands?: YamlCommand[];
}

/* ── Line-ending mapping ── */
const ENDER_TO_YAML: Record<string, string> = {
  "\r\n": "CRLF",
  "\n": "LF",
  "\r": "CR",
  "": "None",
};

const YAML_TO_ENDER: Record<string, "" | "\r\n" | "\r" | "\n"> = {
  CRLF: "\r\n",
  LF: "\n",
  CR: "\r",
  None: "",
};

/* ── Serialize ── */
export function serializeToYaml(rows: PromptRow[]): string {
  const commands: YamlCommand[] = (rows ?? []).map((r) => ({
    command: r.command,
    hex_mode: r.isHex,
    line_ending: ENDER_TO_YAML[r.ender] ?? "CRLF",
    timeout: Math.max(0, parseInt(r.interval) || 0),
    order: r.id,
    ...(r.selected ? { is_selected: true } : {}),
    ...(r.device ? { device: r.device } : {}),
    ...(r.expectedResponses?.length ? { expected_responses: r.expectedResponses } : {}),
  }));

  return yaml.dump({ Commands: commands }, { indent: 2, lineWidth: -1, noRefs: true, quotingType: "'" });
}

/* ── Parse ── */
export function parseYamlToRows(
  yamlText: string,
):
  | { valid: true; rows: PromptRow[] }
  | { valid: false; error: string }
{
  const trimmed = yamlText.trim();
  if (!trimmed) return { valid: true, rows: [] };

  let raw: unknown;
  try {
    raw = yaml.load(trimmed);
  } catch (e: unknown) {
    return { valid: false, error: `YAML parse error: ${(e as Error).message}` };
  }

  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "Expected a top-level object with a 'Commands' key." };
  }

  const doc = raw as YamlDoc;

  if (!Array.isArray(doc.Commands)) {
    return { valid: false, error: "Expected 'Commands' to be an array." };
  }

  if (doc.Commands.length > 500) {
    return { valid: false, error: `'Commands' has ${doc.Commands.length} entries; maximum is 500.` };
  }

  const rows: PromptRow[] = [];

  for (let i = 0; i < doc.Commands.length; i++) {
    const cmd = doc.Commands[i];

    if (typeof cmd !== "object" || cmd === null) {
      return { valid: false, error: `Entry ${i + 1} is not an object.` };
    }

    const ender = YAML_TO_ENDER[cmd.line_ending] ?? "\r\n";

    rows.push({
      id: typeof cmd.order === "number" ? cmd.order : i + 1,
      selected: cmd.is_selected === true,
      command: String(cmd.command ?? ""),
      isHex: cmd.hex_mode === true,
      ender,
      interval: cmd.timeout > 0 ? String(cmd.timeout) : "",
      device: typeof cmd.device === "string" && cmd.device ? cmd.device : undefined,
      expectedResponses: coerceStringArray(cmd.expected_responses),
    });
  }

  return { valid: true, rows };
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(String);
  if (value !== undefined && value !== null) return [String(value)];
  return undefined;
}
