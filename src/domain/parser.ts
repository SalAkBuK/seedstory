import type {
  ParsedSchema,
  PrismaField,
  PrismaModel,
  RelationMetadata,
  SchemaDiagnostic,
} from "./schema";

const SCALAR_TYPES = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function blocks(source: string, keyword: "model" | "enum") {
  const expression = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{([\\s\\S]*?)\\}`, "g");
  return [...source.matchAll(expression)].map((match) => ({
    name: match[1],
    body: match[2],
    offset: match.index ?? 0,
  }));
}

function findAttribute(attributes: string, name: string): string | undefined {
  const marker = `@${name}`;
  const start = attributes.indexOf(marker);
  if (start < 0) return undefined;

  const afterMarker = start + marker.length;
  if (attributes[afterMarker] !== "(") return marker;

  let depth = 0;
  let inString = false;
  for (let index = afterMarker; index < attributes.length; index += 1) {
    const character = attributes[index];
    if (character === '"' && attributes[index - 1] !== "\\") inString = !inString;
    if (inString) continue;
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return attributes.slice(start, index + 1);
    }
  }

  return attributes.slice(start);
}

function parseList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRelation(attribute?: string): RelationMetadata | undefined {
  if (!attribute || attribute === "@relation") return attribute ? { fields: [], references: [] } : undefined;
  const contents = attribute.slice(attribute.indexOf("(") + 1, -1);
  const fields = contents.match(/fields\s*:\s*\[([^\]]*)\]/)?.[1];
  const references = contents.match(/references\s*:\s*\[([^\]]*)\]/)?.[1];
  const name = contents.match(/^\s*"([^"]+)"/)?.[1] ?? contents.match(/name\s*:\s*"([^"]+)"/)?.[1];
  return { name, fields: parseList(fields), references: parseList(references) };
}

function parseFieldLine(
  rawLine: string,
  modelNames: Set<string>,
  enumNames: Set<string>,
): PrismaField | undefined {
  const line = rawLine.trim();
  if (!line || line.startsWith("@@")) return undefined;

  const match = line.match(/^(\w+)\s+([\w.]+)(\[\])?(\?)?\s*(.*)$/);
  if (!match) return undefined;

  const [, name, type, listMarker, optionalMarker, attributes] = match;
  const defaultAttribute = findAttribute(attributes, "default");
  const defaultValue = defaultAttribute?.startsWith("@default(")
    ? defaultAttribute.slice(9, -1).trim()
    : undefined;
  const relation = parseRelation(findAttribute(attributes, "relation"));
  const kind = modelNames.has(type)
    ? "relation"
    : enumNames.has(type)
      ? "enum"
      : "scalar";

  return {
    name,
    type,
    kind,
    isList: Boolean(listMarker),
    isOptional: Boolean(optionalMarker),
    isId: /(^|\s)@id(\s|$)/.test(attributes),
    isUnique: /(^|\s)@unique(\s|$)/.test(attributes),
    defaultValue,
    relation,
  };
}

export function parsePrismaSchema(source: string): ParsedSchema {
  const cleaned = stripComments(source);
  const enumBlocks = blocks(cleaned, "enum");
  const modelBlocks = blocks(cleaned, "model");
  const diagnostics: SchemaDiagnostic[] = [];
  const enumNames = new Set(enumBlocks.map((item) => item.name));
  const modelNames = new Set(modelBlocks.map((item) => item.name));

  const enums = enumBlocks.map((item) => ({
    name: item.name,
    values: item.body
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((value) => value && /^\w+$/.test(value) && !value.startsWith("@@")),
  }));

  const models: PrismaModel[] = modelBlocks.map((item) => {
    const fields = item.body
      .split("\n")
      .map((line) => parseFieldLine(line, modelNames, enumNames))
      .filter((field): field is PrismaField => Boolean(field));

    if (!fields.some((field) => field.isId)) {
      diagnostics.push({ severity: "warning", message: `${item.name} has no field marked @id.` });
    }

    for (const field of fields) {
      if (field.kind === "scalar" && !SCALAR_TYPES.has(field.type)) {
        diagnostics.push({
          severity: "warning",
          message: `${item.name}.${field.name} uses unsupported scalar type ${field.type}.`,
        });
      }
      if (field.kind === "relation" && field.relation && field.relation.fields.length !== field.relation.references.length) {
        diagnostics.push({
          severity: "error",
          message: `${item.name}.${field.name} has mismatched relation fields and references.`,
        });
      }
    }

    return { name: item.name, fields };
  });

  if (models.length === 0) {
    diagnostics.push({ severity: "error", message: "No Prisma model blocks were found." });
  }

  return { models, enums, diagnostics };
}
