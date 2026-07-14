import { describe, expect, it } from "vitest";
import { parsePrismaSchema } from "../src/domain/parser";
import { PROPERTY_MANAGEMENT_SCHEMA } from "../src/examples/property-management";

describe("parsePrismaSchema", () => {
  it("parses models, enums, field modifiers, defaults, and owning relations", () => {
    const result = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);

    expect(result.models).toHaveLength(5);
    expect(result.enums.map((item) => item.name)).toEqual(["LeaseStatus", "RequestStatus"]);
    expect(result.enums[0].values).toEqual(["DRAFT", "ACTIVE", "ENDED"]);

    const tenant = result.models.find((model) => model.name === "Tenant");
    expect(tenant?.fields.find((field) => field.name === "id")).toMatchObject({
      type: "String",
      isId: true,
      defaultValue: "cuid()",
    });
    expect(tenant?.fields.find((field) => field.name === "email")?.isUnique).toBe(true);

    const request = result.models.find((model) => model.name === "MaintenanceRequest");
    expect(request?.fields.find((field) => field.name === "tenantId")?.isOptional).toBe(true);
    expect(request?.fields.find((field) => field.name === "tenant")).toMatchObject({
      type: "Tenant",
      kind: "relation",
      isOptional: true,
      relation: { fields: ["tenantId"], references: ["id"] },
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("reports an empty schema instead of silently succeeding", () => {
    const result = parsePrismaSchema("generator client { provider = \"prisma-client-js\" }");
    expect(result.models).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      severity: "error",
      message: "No Prisma model blocks were found.",
    });
  });
});
