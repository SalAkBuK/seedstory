import type { ScenarioConfigV1 } from "@/domain/scenario-config";

export const PROPERTY_MANAGEMENT_SCHEMA = `// SeedStory built-in: property management
enum RequestPriority {
  LOW
  NORMAL
  URGENT
}

model Property {
  id          String   @id @default(cuid())
  name        String
  address     String
  createdAt   DateTime @default(now())
  units       Unit[]
}

model Unit {
  id          String               @id @default(cuid())
  number      String
  bedrooms    Int
  isActive    Boolean              @default(true)
  propertyId  String
  property    Property             @relation(fields: [propertyId], references: [id])
  occupancies Occupancy[]
  requests    MaintenanceRequest[]

  @@unique([propertyId, number])
}

model Tenant {
  id          String               @id @default(cuid())
  name        String
  email       String               @unique
  createdAt   DateTime             @default(now())
  occupancies Occupancy[]
  requests    MaintenanceRequest[]
}

model Occupancy {
  id        String    @id @default(cuid())
  startDate DateTime
  endDate   DateTime?
  unitId    String
  tenantId  String
  unit      Unit      @relation(fields: [unitId], references: [id])
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
}

model MaintenanceRequest {
  id         String    @id @default(cuid())
  title      String
  priority   RequestPriority @default(NORMAL)
  createdAt  DateTime  @default(now())
  resolvedAt DateTime?
  unitId     String
  tenantId   String?
  unit       Unit      @relation(fields: [unitId], references: [id])
  tenant     Tenant?   @relation(fields: [tenantId], references: [id])
}`;

export const PROPERTY_MANAGEMENT_SCENARIO: ScenarioConfigV1 = {
  version: 1,
  name: "Property operations — 2025",
  schemaSource: PROPERTY_MANAGEMENT_SCHEMA,
  seed: 42,
  scenarioStart: "2025-01-01",
  scenarioEnd: "2025-12-31",
  recordCounts: {
    Property: 2,
    Unit: 6,
    Tenant: 5,
    Occupancy: 7,
    MaintenanceRequest: 8,
  },
  dateTimeFields: [
    { model: "Property", field: "createdAt", generator: "range", nullPercentage: 0 },
    { model: "Tenant", field: "createdAt", generator: "range", nullPercentage: 0 },
    { model: "Occupancy", field: "startDate", generator: "range", nullPercentage: 0 },
    { model: "Occupancy", field: "endDate", generator: "range", nullPercentage: 35 },
    { model: "MaintenanceRequest", field: "createdAt", generator: "range", nullPercentage: 0 },
    { model: "MaintenanceRequest", field: "resolvedAt", generator: "range", nullPercentage: 45 },
  ],
  temporalRules: [
    {
      id: "occupancy-end-after-start",
      type: "after",
      model: "Occupancy",
      targetField: "endDate",
      referenceField: "startDate",
      minOffsetDays: 30,
      maxOffsetDays: 240,
    },
    {
      id: "request-resolution-after-creation",
      type: "after",
      model: "MaintenanceRequest",
      targetField: "resolvedAt",
      referenceField: "createdAt",
      minOffsetDays: 1,
      maxOffsetDays: 21,
    },
  ],
};
