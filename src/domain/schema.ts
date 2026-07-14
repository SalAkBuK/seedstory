export type FieldKind = "scalar" | "enum" | "relation";

export interface PrismaEnum {
  name: string;
  values: string[];
}

export interface RelationMetadata {
  name?: string;
  fields: string[];
  references: string[];
}

export interface PrismaField {
  name: string;
  type: string;
  kind: FieldKind;
  isList: boolean;
  isOptional: boolean;
  isId: boolean;
  isUnique: boolean;
  defaultValue?: string;
  relation?: RelationMetadata;
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
}

export interface SchemaDiagnostic {
  severity: "warning" | "error";
  message: string;
  line?: number;
}

export interface ParsedSchema {
  models: PrismaModel[];
  enums: PrismaEnum[];
  diagnostics: SchemaDiagnostic[];
}

export type ScalarValue = string | number | boolean | null;
export type GeneratedRecord = Record<string, ScalarValue>;
export type GeneratedData = Record<string, GeneratedRecord[]>;

export interface GenerationResult {
  data: GeneratedData;
  order: string[];
}

export interface ValidationIssue {
  code: "MISSING_PRIMARY_KEY" | "DUPLICATE_PRIMARY_KEY" | "BROKEN_REFERENCE";
  model: string;
  recordIndex: number;
  field: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  checkedRecords: number;
  checkedRelations: number;
  issues: ValidationIssue[];
}
