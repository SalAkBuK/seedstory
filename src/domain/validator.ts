import { isDateTimeField, type ScenarioConfigV1, type TemporalRule } from "./scenario-config";
import type {
  GeneratedData,
  ParsedSchema,
  ScalarValue,
  TemporalValidationIssue,
  ValidationIssue,
  ValidationReport,
} from "./schema";
import { DAY_MS, effectiveMinimumOffset, parseDate } from "./temporal";

function emptyReport(): ValidationReport {
  return {
    valid: true,
    checkedRecords: 0,
    checkedRelations: 0,
    checkedDateTimeValues: 0,
    checkedTemporalRules: 0,
    issues: [],
  };
}

export function validateReferentialIntegrity(
  schema: ParsedSchema,
  data: GeneratedData,
): ValidationReport {
  const report = emptyReport();

  for (const model of schema.models) {
    const records = data[model.name] ?? [];
    report.checkedRecords += records.length;

    for (const idField of model.fields.filter((field) => field.isId)) {
      const seen = new Set<unknown>();
      records.forEach((record, recordIndex) => {
        const value = record[idField.name];
        if (value === null || value === undefined || value === "") {
          report.issues.push({
            code: "MISSING_PRIMARY_KEY",
            model: model.name,
            recordIndex,
            field: idField.name,
            message: `${model.name}[${recordIndex}].${idField.name} is missing.`,
          });
        } else if (seen.has(value)) {
          report.issues.push({
            code: "DUPLICATE_PRIMARY_KEY",
            model: model.name,
            recordIndex,
            field: idField.name,
            message: `${model.name}[${recordIndex}].${idField.name} duplicates ${String(value)}.`,
          });
        }
        seen.add(value);
      });
    }

    for (const relationField of model.fields.filter(
      (field) => field.kind === "relation" && field.relation?.fields.length,
    )) {
      const targetRecords = data[relationField.type] ?? [];
      relationField.relation?.fields.forEach((localField, relationIndex) => {
        const targetField = relationField.relation?.references[relationIndex];
        if (!targetField) return;
        const validValues = new Set(targetRecords.map((record) => record[targetField]));
        records.forEach((record, recordIndex) => {
          const value = record[localField];
          if (value === null || value === undefined) return;
          report.checkedRelations += 1;
          if (!validValues.has(value)) {
            report.issues.push({
              code: "BROKEN_REFERENCE",
              model: model.name,
              recordIndex,
              field: localField,
              message: `${model.name}[${recordIndex}].${localField} references missing ${relationField.type}.${targetField}=${String(value)}.`,
            });
          }
        });
      });
    }
  }

  report.valid = report.issues.length === 0;
  return report;
}

function recordIdentifier(schema: ParsedSchema, modelName: string, record: Record<string, ScalarValue>, index: number): ScalarValue {
  const model = schema.models.find((candidate) => candidate.name === modelName);
  const idField = model?.fields.find((field) => field.isId);
  return idField ? record[idField.name] ?? `#${index + 1}` : `#${index + 1}`;
}

function temporalIssue(
  schema: ParsedSchema,
  model: string,
  record: Record<string, ScalarValue>,
  recordIndex: number,
  rule: TemporalRule,
  target: ScalarValue,
  reference: ScalarValue,
  message: string,
): TemporalValidationIssue {
  return {
    code: "TEMPORAL_RULE_VIOLATION",
    model,
    recordIndex,
    recordId: recordIdentifier(schema, model, record, recordIndex),
    field: rule.targetField,
    targetField: rule.targetField,
    referenceField: rule.referenceField,
    violatedRule: rule,
    actualValues: { target, reference },
    message,
  };
}

function ruleIsSatisfied(rule: TemporalRule, target: number, reference: number): boolean {
  const offset = rule.type === "after" ? target - reference : reference - target;
  const minimum = effectiveMinimumOffset(rule) * DAY_MS;
  const maximum = rule.maxOffsetDays === undefined ? undefined : rule.maxOffsetDays * DAY_MS;
  return offset >= minimum && (maximum === undefined || offset <= maximum);
}

export function validateTemporalIntegrity(
  schema: ParsedSchema,
  data: GeneratedData,
  config: ScenarioConfigV1,
): ValidationReport {
  const report = emptyReport();
  const scenarioStart = parseDate(config.scenarioStart, "Scenario start");
  const scenarioEnd = parseDate(config.scenarioEnd, "Scenario end");

  for (const model of schema.models) {
    const records = data[model.name] ?? [];
    report.checkedRecords += records.length;
    const dateFields = model.fields.filter(isDateTimeField);
    for (const [recordIndex, record] of records.entries()) {
      for (const field of dateFields) {
        const actual = record[field.name];
        if (actual === null || actual === undefined) continue;
        report.checkedDateTimeValues += 1;
        const timestamp = typeof actual === "string" ? Date.parse(actual) : Number.NaN;
        if (!Number.isFinite(timestamp) || timestamp < scenarioStart || timestamp > scenarioEnd) {
          report.issues.push({
            code: "SCENARIO_RANGE_VIOLATION",
            model: model.name,
            recordIndex,
            recordId: recordIdentifier(schema, model.name, record, recordIndex),
            field: field.name,
            targetField: field.name,
            referenceField: "$scenario",
            violatedRule: "scenarioRange",
            actualValues: { target: actual, reference: `${config.scenarioStart}..${config.scenarioEnd}` },
            message: `${model.name}[${String(recordIdentifier(schema, model.name, record, recordIndex))}].${field.name} is outside the scenario range.`,
          });
        }
      }

      for (const rule of config.temporalRules.filter((candidate) => candidate.model === model.name)) {
        const target = record[rule.targetField];
        if (target === null || target === undefined) continue;
        const reference = record[rule.referenceField];
        report.checkedTemporalRules += 1;
        const targetDate = typeof target === "string" ? Date.parse(target) : Number.NaN;
        const referenceDate = typeof reference === "string" ? Date.parse(reference) : Number.NaN;
        if (
          !Number.isFinite(targetDate) ||
          !Number.isFinite(referenceDate) ||
          !ruleIsSatisfied(rule, targetDate, referenceDate)
        ) {
          report.issues.push(temporalIssue(
            schema,
            model.name,
            record,
            recordIndex,
            rule,
            target,
            reference,
            `${model.name}[${String(recordIdentifier(schema, model.name, record, recordIndex))}].${rule.targetField} must be ${rule.type} ${rule.referenceField}${rule.minOffsetDays ? ` by at least ${rule.minOffsetDays}d` : ""}${rule.maxOffsetDays ? ` and at most ${rule.maxOffsetDays}d` : ""}; got ${String(target)} and ${String(reference)}.`,
          ));
        }
      }
    }
  }

  report.valid = report.issues.length === 0;
  return report;
}

export function validateGeneratedData(
  schema: ParsedSchema,
  data: GeneratedData,
  config: ScenarioConfigV1,
): ValidationReport {
  const relational = validateReferentialIntegrity(schema, data);
  const temporal = validateTemporalIntegrity(schema, data, config);
  const issues: ValidationIssue[] = [...relational.issues, ...temporal.issues];
  return {
    valid: issues.length === 0,
    checkedRecords: relational.checkedRecords,
    checkedRelations: relational.checkedRelations,
    checkedDateTimeValues: temporal.checkedDateTimeValues,
    checkedTemporalRules: temporal.checkedTemporalRules,
    issues,
  };
}
