import { createRandom, type RandomSource } from "./random";
import {
  createDefaultScenarioConfig,
  isDateTimeField,
  type ScenarioConfigV1,
} from "./scenario-config";
import {
  compileTemporalPlans,
  DAY_MS,
  effectiveMinimumOffset,
  parseDate,
  TemporalConfigError,
  type ModelTemporalPlan,
} from "./temporal";
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

interface TemporalBounds {
  lower: number;
  upper: number;
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
  if (field.type === "Json") return "{}";
  return `${field.name}-${index + 1}`;
}

function calculateTemporalBounds(
  model: PrismaModel,
  plan: ModelTemporalPlan,
  config: ScenarioConfigV1,
): Map<string, TemporalBounds> {
  const scenarioStart = parseDate(config.scenarioStart, "Scenario start");
  const scenarioEnd = parseDate(config.scenarioEnd, "Scenario end");
  const bounds = new Map<string, TemporalBounds>();
  for (const fieldName of plan.fieldOrder) {
    const fieldConfig = plan.configurations.get(fieldName);
    const fixed = fieldConfig?.generator === "fixed"
      ? parseDate(fieldConfig.fixedDate ?? "", `${model.name}.${fieldName} fixed date`)
      : undefined;
    bounds.set(fieldName, { lower: fixed ?? scenarioStart, upper: fixed ?? scenarioEnd });
  }

  for (const targetField of [...plan.fieldOrder].reverse()) {
    const targetBounds = bounds.get(targetField);
    if (!targetBounds) continue;
    for (const rule of plan.rulesByTarget.get(targetField) ?? []) {
      const referenceBounds = bounds.get(rule.referenceField);
      if (!referenceBounds) continue;
      const minimum = effectiveMinimumOffset(rule) * DAY_MS;
      const maximum = rule.maxOffsetDays === undefined ? undefined : rule.maxOffsetDays * DAY_MS;
      if (rule.type === "after") {
        if (maximum !== undefined) referenceBounds.lower = Math.max(referenceBounds.lower, targetBounds.lower - maximum);
        referenceBounds.upper = Math.min(referenceBounds.upper, targetBounds.upper - minimum);
      } else {
        referenceBounds.lower = Math.max(referenceBounds.lower, targetBounds.lower + minimum);
        if (maximum !== undefined) referenceBounds.upper = Math.min(referenceBounds.upper, targetBounds.upper + maximum);
      }
      if (referenceBounds.lower > referenceBounds.upper) {
        throw new GenerationError(
          `${model.name} rule ${rule.id} is impossible inside the scenario range and fixed-date constraints.`,
        );
      }
    }
  }
  return bounds;
}

function generateDateTimeValues(
  model: PrismaModel,
  record: GeneratedRecord,
  plan: ModelTemporalPlan,
  config: ScenarioConfigV1,
  random: RandomSource,
  baseBounds: Map<string, TemporalBounds>,
) {
  const fieldMap = new Map(model.fields.map((field) => [field.name, field]));

  for (const fieldName of plan.fieldOrder) {
    const field = fieldMap.get(fieldName);
    const fieldConfig = plan.configurations.get(fieldName);
    if (!field || !fieldConfig) continue;

    const shouldBeNull = field.isOptional && (
      fieldConfig.nullPercentage === 100 ||
      (fieldConfig.nullPercentage > 0 && random.next() * 100 < fieldConfig.nullPercentage)
    );
    if (shouldBeNull) {
      record[fieldName] = null;
      continue;
    }

    const configuredBounds = baseBounds.get(fieldName);
    let lowerBound = configuredBounds?.lower ?? parseDate(config.scenarioStart, "Scenario start");
    let upperBound = configuredBounds?.upper ?? parseDate(config.scenarioEnd, "Scenario end");
    for (const rule of plan.rulesByTarget.get(fieldName) ?? []) {
      const referenceValue = record[rule.referenceField];
      if (typeof referenceValue !== "string") {
        throw new GenerationError(
          `${model.name}.${fieldName} cannot apply rule ${rule.id} because ${rule.referenceField} is null or invalid.`,
        );
      }
      const referenceDate = parseDate(referenceValue, `${model.name}.${rule.referenceField}`);
      const minimum = effectiveMinimumOffset(rule) * DAY_MS;
      const maximum = rule.maxOffsetDays === undefined ? undefined : rule.maxOffsetDays * DAY_MS;
      if (rule.type === "after") {
        lowerBound = Math.max(lowerBound, referenceDate + minimum);
        if (maximum !== undefined) upperBound = Math.min(upperBound, referenceDate + maximum);
      } else {
        upperBound = Math.min(upperBound, referenceDate - minimum);
        if (maximum !== undefined) lowerBound = Math.max(lowerBound, referenceDate - maximum);
      }
    }

    if (lowerBound > upperBound) {
      throw new GenerationError(
        `${model.name}.${fieldName} has impossible temporal constraints inside the scenario range.`,
      );
    }

    if (fieldConfig.generator === "fixed") {
      const fixedDate = parseDate(fieldConfig.fixedDate ?? "", `${model.name}.${fieldName} fixed date`);
      if (fixedDate < lowerBound || fixedDate > upperBound) {
        throw new GenerationError(
          `${model.name}.${fieldName} fixed date violates its temporal rules or scenario range.`,
        );
      }
      record[fieldName] = new Date(fixedDate).toISOString();
      continue;
    }

    const firstDay = Math.ceil(lowerBound / DAY_MS);
    const lastDay = Math.floor(upperBound / DAY_MS);
    if (firstDay > lastDay) {
      throw new GenerationError(`${model.name}.${fieldName} has no whole-day value satisfying its constraints.`);
    }
    record[fieldName] = new Date(random.integer(firstDay, lastDay) * DAY_MS).toISOString();
  }
}

function createRecord(
  schema: ParsedSchema,
  model: PrismaModel,
  index: number,
  data: GeneratedData,
  random: RandomSource,
  temporalPlan: ModelTemporalPlan,
  config: ScenarioConfigV1,
  temporalBounds: Map<string, TemporalBounds>,
): GeneratedRecord {
  const bindings = foreignKeyBindings(model);
  const enumMap = new Map(schema.enums.map((item) => [item.name, item.values]));
  const record: GeneratedRecord = {};

  for (const field of model.fields) {
    if (field.kind === "relation" || field.isList || isDateTimeField(field)) continue;
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

  generateDateTimeValues(model, record, temporalPlan, config, random, temporalBounds);
  return record;
}

export function generateScenarioRecords(
  schema: ParsedSchema,
  config: ScenarioConfigV1,
): GenerationResult {
  if (schema.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new GenerationError("Schema has parse errors. Resolve them before generating records.");
  }

  let temporalPlans: Map<string, ModelTemporalPlan>;
  try {
    temporalPlans = compileTemporalPlans(schema, config);
  } catch (error) {
    if (error instanceof TemporalConfigError) throw new GenerationError(error.message);
    throw error;
  }

  const order = dependencyOrder(schema);
  const modelMap = new Map(schema.models.map((model) => [model.name, model]));
  const data: GeneratedData = {};
  const random = createRandom(config.seed);
  const temporalBoundsByModel = new Map(
    schema.models.map((model) => {
      const plan = temporalPlans.get(model.name);
      if (!plan) return [model.name, new Map<string, TemporalBounds>()] as const;
      return [model.name, calculateTemporalBounds(model, plan, config)] as const;
    }),
  );

  for (const modelName of order) {
    const model = modelMap.get(modelName);
    const temporalPlan = temporalPlans.get(modelName);
    const temporalBounds = temporalBoundsByModel.get(modelName);
    if (!model || !temporalPlan || !temporalBounds) continue;
    const requestedCount = config.recordCounts[modelName] ?? 0;
    if (!Number.isSafeInteger(requestedCount) || requestedCount < 0 || requestedCount > 500) {
      throw new GenerationError(`${modelName} count must be an integer between 0 and 500.`);
    }
    data[modelName] = Array.from({ length: requestedCount }, (_, index) =>
      createRecord(schema, model, index, data, random, temporalPlan, config, temporalBounds),
    );
  }

  return { data, order };
}

export function generateRecords(
  schema: ParsedSchema,
  counts: Record<string, number>,
  seed: number,
): GenerationResult {
  const config = createDefaultScenarioConfig(schema, "", { seed, recordCounts: counts });
  return generateScenarioRecords(schema, config);
}
