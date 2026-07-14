import type { ParsedSchema, PrismaField } from "./schema";

export const SCENARIO_CONFIG_VERSION = 1 as const;

export type DateTimeGenerator = "range" | "fixed";
export type TemporalRuleType = "after" | "before";

export interface DateTimeFieldConfig {
  model: string;
  field: string;
  generator: DateTimeGenerator;
  fixedDate?: string;
  nullPercentage: number;
}

export interface TemporalRule {
  id: string;
  type: TemporalRuleType;
  model: string;
  targetField: string;
  referenceField: string;
  minOffsetDays?: number;
  maxOffsetDays?: number;
}

export interface ScenarioConfigV1 {
  version: typeof SCENARIO_CONFIG_VERSION;
  name: string;
  schemaSource: string;
  seed: number;
  scenarioStart: string;
  scenarioEnd: string;
  recordCounts: Record<string, number>;
  dateTimeFields: DateTimeFieldConfig[];
  temporalRules: TemporalRule[];
}

export class ScenarioConfigError extends Error {}

export function dateTimeFieldKey(model: string, field: string): string {
  return `${model}.${field}`;
}

export function isDateTimeField(field: PrismaField): boolean {
  return field.kind === "scalar" && field.type === "DateTime" && !field.isList;
}

export function defaultDateTimeFieldConfig(
  model: string,
  field: PrismaField,
): DateTimeFieldConfig {
  const normalizedName = field.name.toLowerCase();
  const optionalDefault = normalizedName === "resolvedat"
    ? 45
    : normalizedName === "enddate"
      ? 35
      : field.isOptional
        ? 20
        : 0;

  return {
    model,
    field: field.name,
    generator: "range",
    nullPercentage: field.isOptional ? optionalDefault : 0,
  };
}

export function createDefaultScenarioConfig(
  schema: ParsedSchema,
  schemaSource: string,
  overrides: Partial<Pick<
    ScenarioConfigV1,
    "name" | "seed" | "scenarioStart" | "scenarioEnd" | "recordCounts" | "temporalRules"
  >> = {},
): ScenarioConfigV1 {
  return {
    version: SCENARIO_CONFIG_VERSION,
    name: overrides.name ?? "Untitled scenario",
    schemaSource,
    seed: overrides.seed ?? 42,
    scenarioStart: overrides.scenarioStart ?? "2025-01-01",
    scenarioEnd: overrides.scenarioEnd ?? "2025-12-31",
    recordCounts: Object.fromEntries(
      schema.models.map((model) => [model.name, overrides.recordCounts?.[model.name] ?? 3]),
    ),
    dateTimeFields: schema.models.flatMap((model) =>
      model.fields
        .filter(isDateTimeField)
        .map((field) => defaultDateTimeFieldConfig(model.name, field)),
    ),
    temporalRules: overrides.temporalRules ?? [],
  };
}

export function reconcileScenarioConfig(
  schema: ParsedSchema,
  schemaSource: string,
  current: ScenarioConfigV1,
): ScenarioConfigV1 {
  const existingFields = new Map(
    current.dateTimeFields.map((field) => [dateTimeFieldKey(field.model, field.field), field]),
  );
  const validFields = new Set<string>();
  const dateTimeFields = schema.models.flatMap((model) =>
    model.fields.filter(isDateTimeField).map((field) => {
      const key = dateTimeFieldKey(model.name, field.name);
      validFields.add(key);
      const existing = existingFields.get(key);
      return existing
        ? { ...existing, nullPercentage: field.isOptional ? existing.nullPercentage : 0 }
        : defaultDateTimeFieldConfig(model.name, field);
    }),
  );

  const modelNames = new Set(schema.models.map((model) => model.name));
  return {
    ...current,
    schemaSource,
    recordCounts: Object.fromEntries(
      schema.models.map((model) => [model.name, current.recordCounts[model.name] ?? 3]),
    ),
    dateTimeFields,
    temporalRules: current.temporalRules.filter((rule) =>
      modelNames.has(rule.model) &&
      validFields.has(dateTimeFieldKey(rule.model, rule.targetField)) &&
      validFields.has(dateTimeFieldKey(rule.model, rule.referenceField)),
    ),
  };
}

export function serializeScenarioConfig(config: ScenarioConfigV1): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function deserializeScenarioConfig(serialized: string): ScenarioConfigV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new ScenarioConfigError("Scenario configuration is not valid JSON.");
  }

  if (!value || typeof value !== "object") {
    throw new ScenarioConfigError("Scenario configuration must be a JSON object.");
  }
  const candidate = value as Partial<ScenarioConfigV1>;
  if (candidate.version !== SCENARIO_CONFIG_VERSION) {
    throw new ScenarioConfigError(`Unsupported scenario configuration version: ${String(candidate.version)}.`);
  }
  if (
    typeof candidate.name !== "string" ||
    typeof candidate.schemaSource !== "string" ||
    typeof candidate.seed !== "number" ||
    typeof candidate.scenarioStart !== "string" ||
    typeof candidate.scenarioEnd !== "string" ||
    !candidate.recordCounts ||
    typeof candidate.recordCounts !== "object" ||
    !Array.isArray(candidate.dateTimeFields) ||
    !Array.isArray(candidate.temporalRules)
  ) {
    throw new ScenarioConfigError("Scenario configuration is missing required version 1 fields.");
  }

  return candidate as ScenarioConfigV1;
}
