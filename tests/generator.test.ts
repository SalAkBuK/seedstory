import { describe, expect, it } from "vitest";
import { generateRecords, GenerationError } from "../src/domain/generator";
import { parsePrismaSchema } from "../src/domain/parser";
import { PROPERTY_MANAGEMENT_SCHEMA } from "../src/examples/property-management";

const counts = { Property: 2, Unit: 4, Tenant: 3, Occupancy: 3, MaintenanceRequest: 5 };

describe("generateRecords", () => {
  const schema = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);

  it("is deterministic for the same schema, counts, and seed", () => {
    expect(generateRecords(schema, counts, 9182)).toEqual(generateRecords(schema, counts, 9182));
    expect(generateRecords(schema, counts, 9182).data).not.toEqual(generateRecords(schema, counts, 9183).data);
  });

  it("generates parents first and assigns valid foreign key values", () => {
    const result = generateRecords(schema, counts, 42);

    expect(result.order.indexOf("Property")).toBeLessThan(result.order.indexOf("Unit"));
    expect(result.order.indexOf("Unit")).toBeLessThan(result.order.indexOf("Occupancy"));
    expect(result.order.indexOf("Tenant")).toBeLessThan(result.order.indexOf("Occupancy"));

    const propertyIds = new Set(result.data.Property.map((record) => record.id));
    const unitIds = new Set(result.data.Unit.map((record) => record.id));
    const tenantIds = new Set(result.data.Tenant.map((record) => record.id));
    expect(result.data.Unit.every((record) => propertyIds.has(record.propertyId))).toBe(true);
    expect(result.data.Occupancy.every((record) => unitIds.has(record.unitId))).toBe(true);
    expect(result.data.Occupancy.every((record) => tenantIds.has(record.tenantId))).toBe(true);
  });

  it("fails clearly when a required parent count is zero", () => {
    expect(() => generateRecords(schema, { ...counts, Property: 0 }, 42)).toThrow(GenerationError);
    expect(() => generateRecords(schema, { ...counts, Property: 0 }, 42)).toThrow(
      "Unit.propertyId requires Property",
    );
  });
});
