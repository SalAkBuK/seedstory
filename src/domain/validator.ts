import type { GeneratedData, ParsedSchema, ValidationIssue, ValidationReport } from "./schema";

export function validateReferentialIntegrity(
  schema: ParsedSchema,
  data: GeneratedData,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  let checkedRecords = 0;
  let checkedRelations = 0;

  for (const model of schema.models) {
    const records = data[model.name] ?? [];
    checkedRecords += records.length;

    for (const idField of model.fields.filter((field) => field.isId)) {
      const seen = new Set<unknown>();
      records.forEach((record, recordIndex) => {
        const value = record[idField.name];
        if (value === null || value === undefined || value === "") {
          issues.push({
            code: "MISSING_PRIMARY_KEY",
            model: model.name,
            recordIndex,
            field: idField.name,
            message: `${model.name}[${recordIndex}].${idField.name} is missing.`,
          });
        } else if (seen.has(value)) {
          issues.push({
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
          checkedRelations += 1;
          if (!validValues.has(value)) {
            issues.push({
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

  return { valid: issues.length === 0, checkedRecords, checkedRelations, issues };
}
