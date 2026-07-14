import {
  dateTimeFieldKey,
  isDateTimeField,
  type DateTimeFieldConfig,
  type ScenarioConfigV1,
  type TemporalRule,
} from "./scenario-config";
import type { ParsedSchema, PrismaModel } from "./schema";

export const DAY_MS = 86_400_000;

export interface ModelTemporalPlan {
  fieldOrder: string[];
  configurations: Map<string, DateTimeFieldConfig>;
  rulesByTarget: Map<string, TemporalRule[]>;
}

export class TemporalConfigError extends Error {}

export function parseDate(value: string, label: string): number {
  const timestamp = Date.parse(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (!Number.isFinite(timestamp)) throw new TemporalConfigError(`${label} is not a valid date: ${value}.`);
  return timestamp;
}

export function effectiveMinimumOffset(rule: TemporalRule): number {
  return rule.minOffsetDays ?? 1;
}

function assertOffset(value: number | undefined, label: string, rule: TemporalRule) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TemporalConfigError(`${rule.model} rule ${rule.id} ${label} must be a positive integer.`);
  }
}

function compileModelPlan(
  model: PrismaModel,
  config: ScenarioConfigV1,
  fieldConfigurations: Map<string, DateTimeFieldConfig>,
): ModelTemporalPlan {
  const dateFields = model.fields.filter(isDateTimeField);
  const fieldNames = new Set(dateFields.map((field) => field.name));
  const rules = config.temporalRules.filter((rule) => rule.model === model.name);
  const dependencies = new Map(dateFields.map((field) => [field.name, new Set<string>()]));
  const rulesByTarget = new Map<string, TemporalRule[]>();

  for (const rule of rules) {
    if (!fieldNames.has(rule.targetField) || !fieldNames.has(rule.referenceField)) {
      throw new TemporalConfigError(
        `${rule.model} rule ${rule.id} must reference DateTime fields on ${model.name}.`,
      );
    }
    if (rule.targetField === rule.referenceField) {
      throw new TemporalConfigError(`${rule.model} rule ${rule.id} cannot compare a field with itself.`);
    }
    if (rule.type !== "after" && rule.type !== "before") {
      throw new TemporalConfigError(`${rule.model} rule ${rule.id} has unsupported type ${String(rule.type)}.`);
    }
    assertOffset(rule.minOffsetDays, "minimum offset", rule);
    assertOffset(rule.maxOffsetDays, "maximum offset", rule);
    if (
      rule.maxOffsetDays !== undefined &&
      rule.maxOffsetDays < effectiveMinimumOffset(rule)
    ) {
      throw new TemporalConfigError(`${rule.model} rule ${rule.id} maximum offset is less than its minimum.`);
    }
    dependencies.get(rule.targetField)?.add(rule.referenceField);
    rulesByTarget.set(rule.targetField, [...(rulesByTarget.get(rule.targetField) ?? []), rule]);
  }

  const fieldOrder: string[] = [];
  const remaining = new Set(dateFields.map((field) => field.name));
  while (remaining.size > 0) {
    const ready = [...remaining].filter((field) =>
      [...(dependencies.get(field) ?? [])].every((dependency) => fieldOrder.includes(dependency)),
    );
    if (ready.length === 0) {
      throw new TemporalConfigError(
        `${model.name} has a temporal dependency cycle involving: ${[...remaining].join(", ")}.`,
      );
    }
    for (const field of ready) {
      fieldOrder.push(field);
      remaining.delete(field);
    }
  }

  const configurations = new Map<string, DateTimeFieldConfig>();
  for (const field of dateFields) {
    const configuration = fieldConfigurations.get(dateTimeFieldKey(model.name, field.name));
    if (!configuration) {
      throw new TemporalConfigError(`${model.name}.${field.name} is missing a DateTime configuration.`);
    }
    if (configuration.generator !== "range" && configuration.generator !== "fixed") {
      throw new TemporalConfigError(`${model.name}.${field.name} has an unsupported generator.`);
    }
    if (
      !Number.isFinite(configuration.nullPercentage) ||
      configuration.nullPercentage < 0 ||
      configuration.nullPercentage > 100
    ) {
      throw new TemporalConfigError(`${model.name}.${field.name} null percentage must be between 0 and 100.`);
    }
    if (!field.isOptional && configuration.nullPercentage !== 0) {
      throw new TemporalConfigError(`${model.name}.${field.name} is required and cannot generate null values.`);
    }
    configurations.set(field.name, configuration);
  }

  return { fieldOrder, configurations, rulesByTarget };
}

export function compileTemporalPlans(
  schema: ParsedSchema,
  config: ScenarioConfigV1,
): Map<string, ModelTemporalPlan> {
  if (config.version !== 1) throw new TemporalConfigError(`Unsupported scenario version ${String(config.version)}.`);
  if (!config.name.trim()) throw new TemporalConfigError("Scenario name cannot be empty.");
  if (!Number.isSafeInteger(config.seed)) throw new TemporalConfigError("Seed must be a safe integer.");
  const scenarioStart = parseDate(config.scenarioStart, "Scenario start");
  const scenarioEnd = parseDate(config.scenarioEnd, "Scenario end");
  if (scenarioStart > scenarioEnd) throw new TemporalConfigError("Scenario start must be on or before scenario end.");

  const fieldConfigurations = new Map<string, DateTimeFieldConfig>();
  for (const field of config.dateTimeFields) {
    const key = dateTimeFieldKey(field.model, field.field);
    if (fieldConfigurations.has(key)) throw new TemporalConfigError(`${key} has duplicate DateTime configurations.`);
    if (field.generator === "fixed") {
      if (!field.fixedDate) throw new TemporalConfigError(`${key} requires a fixed date.`);
      const fixedDate = parseDate(field.fixedDate, `${key} fixed date`);
      if (fixedDate < scenarioStart || fixedDate > scenarioEnd) {
        throw new TemporalConfigError(`${key} fixed date must be inside the scenario range.`);
      }
    }
    fieldConfigurations.set(key, field);
  }

  const modelNames = new Set(schema.models.map((model) => model.name));
  for (const rule of config.temporalRules) {
    if (!modelNames.has(rule.model)) {
      throw new TemporalConfigError(`Rule ${rule.id} references unknown model ${rule.model}.`);
    }
  }

  return new Map(
    schema.models.map((model) => [model.name, compileModelPlan(model, config, fieldConfigurations)]),
  );
}
