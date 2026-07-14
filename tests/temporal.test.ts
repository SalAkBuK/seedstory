import { describe, expect, it } from "vitest";
import { generateScenarioRecords, GenerationError } from "../src/domain/generator";
import { parsePrismaSchema } from "../src/domain/parser";
import {
  deserializeScenarioConfig,
  serializeScenarioConfig,
  type ScenarioConfigV1,
  type TemporalRule,
} from "../src/domain/scenario-config";
import { validateGeneratedData } from "../src/domain/validator";
import {
  PROPERTY_MANAGEMENT_SCENARIO,
  PROPERTY_MANAGEMENT_SCHEMA,
} from "../src/examples/property-management";

const TEMPORAL_SCHEMA = `
model Event {
  id        Int       @id @default(autoincrement())
  createdAt DateTime
  updatedAt DateTime
  expiresAt DateTime?
}`;

const schema = parsePrismaSchema(TEMPORAL_SCHEMA);

function scenario(
  rules: TemporalRule[] = [],
  overrides: Partial<ScenarioConfigV1> = {},
): ScenarioConfigV1 {
  return {
    version: 1,
    name: "Temporal test",
    schemaSource: TEMPORAL_SCHEMA,
    seed: 7301,
    scenarioStart: "2025-01-01",
    scenarioEnd: "2025-03-31",
    recordCounts: { Event: 30 },
    dateTimeFields: [
      { model: "Event", field: "createdAt", generator: "range", nullPercentage: 0 },
      { model: "Event", field: "updatedAt", generator: "range", nullPercentage: 0 },
      { model: "Event", field: "expiresAt", generator: "range", nullPercentage: 0 },
    ],
    temporalRules: rules,
    ...overrides,
  };
}

function daysBetween(later: unknown, earlier: unknown): number {
  return (Date.parse(String(later)) - Date.parse(String(earlier))) / 86_400_000;
}

describe("configurable temporal generation", () => {
  it("ships a valid example with active occupancies and unresolved requests", () => {
    const propertySchema = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);
    const result = generateScenarioRecords(propertySchema, PROPERTY_MANAGEMENT_SCENARIO);
    expect(result.data.Occupancy.some((record) => record.endDate === null)).toBe(true);
    expect(result.data.Occupancy.some((record) => record.endDate !== null)).toBe(true);
    expect(result.data.MaintenanceRequest.some((record) => record.resolvedAt === null)).toBe(true);
    expect(result.data.MaintenanceRequest.some((record) => record.resolvedAt !== null)).toBe(true);
    expect(validateGeneratedData(propertySchema, result.data, PROPERTY_MANAGEMENT_SCENARIO).valid).toBe(true);
  });

  it("is deterministic and keeps every generated date inside the scenario range", () => {
    const config = scenario();
    const first = generateScenarioRecords(schema, config);
    const second = generateScenarioRecords(schema, config);
    expect(first).toEqual(second);

    const start = Date.parse("2025-01-01T00:00:00.000Z");
    const end = Date.parse("2025-03-31T00:00:00.000Z");
    for (const record of first.data.Event) {
      for (const field of ["createdAt", "updatedAt", "expiresAt"]) {
        const value = Date.parse(String(record[field]));
        expect(value).toBeGreaterThanOrEqual(start);
        expect(value).toBeLessThanOrEqual(end);
      }
    }
  });

  it("supports after rules with minimum and maximum day offsets", () => {
    const config = scenario([{
      id: "updated-after-created",
      type: "after",
      model: "Event",
      targetField: "updatedAt",
      referenceField: "createdAt",
      minOffsetDays: 3,
      maxOffsetDays: 9,
    }]);
    const result = generateScenarioRecords(schema, config);
    for (const record of result.data.Event) {
      expect(daysBetween(record.updatedAt, record.createdAt)).toBeGreaterThanOrEqual(3);
      expect(daysBetween(record.updatedAt, record.createdAt)).toBeLessThanOrEqual(9);
    }
  });

  it("supports before rules with minimum and maximum day offsets", () => {
    const config = scenario([{
      id: "created-before-updated",
      type: "before",
      model: "Event",
      targetField: "createdAt",
      referenceField: "updatedAt",
      minOffsetDays: 2,
      maxOffsetDays: 5,
    }]);
    const result = generateScenarioRecords(schema, config);
    for (const record of result.data.Event) {
      expect(daysBetween(record.updatedAt, record.createdAt)).toBeGreaterThanOrEqual(2);
      expect(daysBetween(record.updatedAt, record.createdAt)).toBeLessThanOrEqual(5);
    }
  });

  it("supports fixed dates and deterministic optional null percentages", () => {
    const fixedConfig = scenario([], {
      dateTimeFields: [
        { model: "Event", field: "createdAt", generator: "fixed", fixedDate: "2025-01-12", nullPercentage: 0 },
        { model: "Event", field: "updatedAt", generator: "range", nullPercentage: 0 },
        { model: "Event", field: "expiresAt", generator: "range", nullPercentage: 100 },
      ],
    });
    const result = generateScenarioRecords(schema, fixedConfig);
    expect(result.data.Event.every((record) => record.createdAt === "2025-01-12T00:00:00.000Z")).toBe(true);
    expect(result.data.Event.every((record) => record.expiresAt === null)).toBe(true);

    const partialConfig = scenario([], {
      dateTimeFields: fixedConfig.dateTimeFields.map((field) =>
        field.field === "expiresAt" ? { ...field, nullPercentage: 50 } : field,
      ),
    });
    const first = generateScenarioRecords(schema, partialConfig);
    const second = generateScenarioRecords(schema, partialConfig);
    expect(first.data.Event.map((record) => record.expiresAt)).toEqual(
      second.data.Event.map((record) => record.expiresAt),
    );
    expect(first.data.Event.some((record) => record.expiresAt === null)).toBe(true);
    expect(first.data.Event.some((record) => record.expiresAt !== null)).toBe(true);
  });

  it("rejects impossible constraints without retrying", () => {
    const config = scenario([{
      id: "impossible",
      type: "after",
      model: "Event",
      targetField: "updatedAt",
      referenceField: "createdAt",
      minOffsetDays: 2,
    }], { scenarioStart: "2025-01-01", scenarioEnd: "2025-01-01" });
    expect(() => generateScenarioRecords(schema, config)).toThrow(GenerationError);
    expect(() => generateScenarioRecords(schema, config)).toThrow(/impossible/i);
  });

  it("rejects temporal dependency cycles clearly", () => {
    const config = scenario([
      { id: "one", type: "after", model: "Event", targetField: "updatedAt", referenceField: "createdAt" },
      { id: "two", type: "after", model: "Event", targetField: "createdAt", referenceField: "updatedAt" },
    ]);
    expect(() => generateScenarioRecords(schema, config)).toThrow(/temporal dependency cycle/i);
  });

  it("is reproducible after configuration serialization", () => {
    const config = scenario([{
      id: "reproducible-rule",
      type: "after",
      model: "Event",
      targetField: "updatedAt",
      referenceField: "createdAt",
      maxOffsetDays: 12,
    }]);
    const restored = deserializeScenarioConfig(serializeScenarioConfig(config));
    const restoredSchema = parsePrismaSchema(restored.schemaSource);
    expect(generateScenarioRecords(restoredSchema, restored)).toEqual(generateScenarioRecords(schema, config));
  });

  it("independently reports corrupted rule and range values with full context", () => {
    const rule: TemporalRule = {
      id: "validated-rule",
      type: "after",
      model: "Event",
      targetField: "updatedAt",
      referenceField: "createdAt",
      minOffsetDays: 2,
      maxOffsetDays: 5,
    };
    const config = scenario([rule]);
    const generated = generateScenarioRecords(schema, config).data;
    generated.Event[0].updatedAt = generated.Event[0].createdAt;
    generated.Event[1].expiresAt = "2030-01-01T00:00:00.000Z";

    const report = validateGeneratedData(schema, generated, config);
    expect(report.valid).toBe(false);
    const ruleIssue = report.issues.find((issue) => issue.code === "TEMPORAL_RULE_VIOLATION");
    expect(ruleIssue).toMatchObject({
      model: "Event",
      recordId: 1,
      targetField: "updatedAt",
      referenceField: "createdAt",
      violatedRule: rule,
      actualValues: {
        target: generated.Event[0].updatedAt,
        reference: generated.Event[0].createdAt,
      },
    });
    expect(report.issues.some((issue) => issue.code === "SCENARIO_RANGE_VIOLATION")).toBe(true);
  });
});
