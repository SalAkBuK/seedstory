export const PROPERTY_MANAGEMENT_SCHEMA = `// SeedStory built-in: property management
enum LeaseStatus {
  DRAFT
  ACTIVE
  ENDED
}

enum RequestStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
}

model Property {
  id        String   @id @default(cuid())
  name      String
  address   String
  createdAt DateTime @default(now())
  units     Unit[]
}

model Unit {
  id           String               @id @default(cuid())
  number       String
  bedrooms     Int
  isActive     Boolean              @default(true)
  propertyId   String
  property     Property             @relation(fields: [propertyId], references: [id])
  leases       Lease[]
  requests     MaintenanceRequest[]

  @@unique([propertyId, number])
}

model Tenant {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  leases    Lease[]
  requests  MaintenanceRequest[]
}

model Lease {
  id        String      @id @default(cuid())
  status    LeaseStatus @default(DRAFT)
  startsAt  DateTime
  endsAt    DateTime
  unitId    String
  tenantId  String
  unit      Unit        @relation(fields: [unitId], references: [id])
  tenant    Tenant      @relation(fields: [tenantId], references: [id])
}

model MaintenanceRequest {
  id          String        @id @default(cuid())
  title       String
  status      RequestStatus @default(OPEN)
  openedAt    DateTime
  unitId      String
  tenantId    String?
  unit        Unit          @relation(fields: [unitId], references: [id])
  tenant      Tenant?       @relation(fields: [tenantId], references: [id])
}`;
