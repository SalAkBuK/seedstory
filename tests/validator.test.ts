import { describe, expect, it } from "vitest";
import { generateRecords } from "../src/domain/generator";
import { parsePrismaSchema } from "../src/domain/parser";
import { validateReferentialIntegrity } from "../src/domain/validator";
import { PROPERTY_MANAGEMENT_SCHEMA } from "../src/examples/property-management";

describe("validateReferentialIntegrity", () => {
  const schema = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);
  const generated = generateRecords(
    schema,
    { Property: 2, Unit: 4, Tenant: 3, Lease: 3, MaintenanceRequest: 4 },
    77,
  ).data;

  it("accepts generated records with valid primary and foreign keys", () => {
    const report = validateReferentialIntegrity(schema, generated);
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checkedRecords).toBe(16);
    expect(report.checkedRelations).toBeGreaterThan(0);
  });

  it("reports a broken foreign key and a duplicate primary key", () => {
    const broken = structuredClone(generated);
    broken.Unit[0].propertyId = "missing_property";
    broken.Tenant[1].id = broken.Tenant[0].id;

    const report = validateReferentialIntegrity(schema, broken);
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("BROKEN_REFERENCE");
    expect(report.issues.map((issue) => issue.code)).toContain("DUPLICATE_PRIMARY_KEY");
  });
});
