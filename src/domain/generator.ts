import { createRandom, type RandomSource } from "./random";
import type {
  GeneratedData,
  GeneratedRecord,
  GenerationResult,
  ParsedSchema,
  PrismaField,
  PrismaModel,
  ScalarValue,
} from "./schema";

const FIRST_NAMES = ["Amina", "Omar", "Maya", "Yusuf", "Noor", "Zain", "Leila", "Rayan"];
const LAST_NAMES = ["Khan", "Rahman", "Malik", "Siddiqui", "Hassan", "Farooq", "Qureshi", "Aziz"];
const STREETS = ["Cedar Walk", "Harbour Lane", "Juniper Street", "Orchard Road", "Palm Avenue"];

interface ForeignKeyBinding {
  targetModel: string;
  targetField: string;
}

export class GenerationError extends Error {}

function dependencyOrder(schema: ParsedSchema): string[] {
  const modelNames = new Set(schema.models.map((model) => model.name));
  const dependencies = new Map<string, Set<string>>(
    schema.models.map((model) => [model.name, new Set<string>()]),
  );

  for (const model of schema.models) {
    for (const field of model.fields) {
      if (
        field.kind === "relation" &&
        field.relation?.fields.length &&
        modelNames.has(field.type) &&
        field.type !== model.name
      ) {
        dependencies.get(model.name)?.add(field.type);
      }
    }
  }

  const order: string[] = [];
  const remaining = new Set(modelNames);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((name) =>
      [...(dependencies.get(name) ?? [])].every((dependency) => order.includes(dependency)),
    );
    if (ready.length === 0) {
      throw new GenerationError(
        `Cannot determine dependency order. The owning relations contain a cycle: ${[...remaining].join(", ")}.`,
      );
    }
    for (const name of ready) {
      order.push(name);
      remaining.delete(name);
    }
  }

  return order;
}

function foreignKeyBindings(model: PrismaModel): Map<string, ForeignKeyBinding> {
  const bindings = new Map<string, ForeignKeyBinding>();
  for (const relationField of model.fields.filter((field) => field.kind === "relation")) {
    relationField.relation?.fields.forEach((fieldName, index) => {
      bindings.set(fieldName, {
        targetModel: relationField.type,
        targetField: relationField.relation?.references[index] ?? "id",
      });
    });
  }
  return bindings;
}

function identifier(model: PrismaModel, field: PrismaField, index: number, random: RandomSource): ScalarValue {
  if (field.type === "Int" || field.type === "BigInt") return index + 1;
  return `${model.name.toLowerCase()}_${String(index + 1).padStart(3, "0")}_${random.integer(1000, 9999)}`;
}

function parseDefault(value: string | undefined): ScalarValue | undefined {
  if (!value || /^(cuid|uuid|autoincrement|now)\(/.test(value)) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value.replace(/^"|"$/g, "");
}

function scalarValue(
  model: PrismaModel,
  field: PrismaField,
  index: number,
  random: RandomSource,
): ScalarValue {
  if (field.isId) return identifier(model, field, index, random);
  const defaultValue = parseDefault(field.defaultValue);
  if (defaultValue !== undefined) return defaultValue;

  const name = field.name.toLowerCase();
  if (field.type === "String") {
    const firstName = random.pick(FIRST_NAMES);
    const lastName = random.pick(LAST_NAMES);
    if (name.includes("email")) return `${firstName}.${lastName}.${index + 1}@example.test`.toLowerCase();
    if (name.includes("name")) return `${firstName} ${lastName}`;
    if (name.includes("address")) return `${random.integer(10, 990)} ${random.pick(STREETS)}`;
    if (name.includes("title")) return `${model.name} ${index + 1}`;
    if (name.includes("number")) return `${model.name.slice(0, 1).toUpperCase()}-${String(index + 1).padStart(3, "0")}`;
    return `${field.name}-${index + 1}-${random.integer(100, 999)}`;
  }
  if (field.type === "Boolean") return random.next() >= 0.25;
  if (field.type === "Int" || field.type === "BigInt") return random.integer(1, 500);
  if (field.type === "Float" || field.type === "Decimal") return Number((random.next() * 5000 + 50).toFixed(2));
  if (field.type === "DateTime") {
    const base = Date.UTC(2025, 0, 1);
    return new Date(base + random.integer(0, 365) * 86_400_000).toISOString();
  }
  if (field.type === "Json") return "{}";
  return `${field.name}-${index + 1}`;
}

function createRecord(
  schema: ParsedSchema,
  model: PrismaModel,
  index: number,
  data: GeneratedData,
  random: RandomSource,
): GeneratedRecord {
  const bindings = foreignKeyBindings(model);
  const enumMap = new Map(schema.enums.map((item) => [item.name, item.values]));
  const record: GeneratedRecord = {};

  for (const field of model.fields) {
    if (field.kind === "relation" || field.isList) continue;
    const binding = bindings.get(field.name);
    if (binding) {
      const candidates = data[binding.targetModel] ?? [];
      if (candidates.length === 0) {
        if (field.isOptional) {
          record[field.name] = null;
          continue;
        }
        throw new GenerationError(
          `${model.name}.${field.name} requires ${binding.targetModel}, but that model has zero generated records.`,
        );
      }
      const parent = candidates[index % candidates.length];
      record[field.name] = parent[binding.targetField] ?? null;
      continue;
    }
    if (field.kind === "enum") {
      const values = enumMap.get(field.type) ?? [];
      record[field.name] = parseDefault(field.defaultValue) ?? random.pick(values);
      continue;
    }
    record[field.name] = scalarValue(model, field, index, random);
  }

  return record;
}

export function generateRecords(
  schema: ParsedSchema,
  counts: Record<string, number>,
  seed: number,
): GenerationResult {
  if (!Number.isSafeInteger(seed)) throw new GenerationError("Seed must be a safe integer.");
  if (schema.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new GenerationError("Schema has parse errors. Resolve them before generating records.");
  }

  const order = dependencyOrder(schema);
  const modelMap = new Map(schema.models.map((model) => [model.name, model]));
  const data: GeneratedData = {};
  const random = createRandom(seed);

  for (const modelName of order) {
    const model = modelMap.get(modelName);
    if (!model) continue;
    const requestedCount = counts[modelName] ?? 0;
    if (!Number.isSafeInteger(requestedCount) || requestedCount < 0 || requestedCount > 500) {
      throw new GenerationError(`${modelName} count must be an integer between 0 and 500.`);
    }
    data[modelName] = Array.from({ length: requestedCount }, (_, index) =>
      createRecord(schema, model, index, data, random),
    );
  }

  return { data, order };
}
