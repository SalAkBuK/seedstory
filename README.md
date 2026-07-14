# SeedStory

SeedStory turns a Prisma schema into deterministic, relationship-aware and time-aware demo data. It is a local-first developer tool: schema text, configuration and generated records remain in browser memory. There is no authentication, database, telemetry, cloud persistence or runtime AI call.

This repository contains the first two vertical slices built for OpenAI Build Week. It is intentionally narrower than the locked final MVP.

## What works

- Paste a Prisma schema or restore the built-in property-management example.
- Parse models, enums, scalar fields, IDs, unique markers, optional markers, defaults, lists and explicit owning relations.
- Inspect an interactive model relationship graph.
- Configure a versioned scenario name, numeric seed, inclusive UTC date range and per-model counts.
- Configure each scalar DateTime field to use the scenario range or a fixed date.
- Configure deterministic null percentages for optional DateTime fields.
- Add same-record `after` and `before` rules with optional minimum and maximum day offsets.
- Generate bounded temporal values without retry loops, in model and DateTime dependency order.
- Preview records in tables and DateTime events on a filterable chronological timeline.
- Independently validate primary keys, foreign keys, scenario boundaries and temporal rules from the finished dataset.
- Download `seedstory.config.json` and `validation-report.json` in the browser.

`requiredWhen`, `noOverlap`, `belongsToActivePeriod`, cross-model temporal rules, Prisma `seed.ts`, ecommerce examples and configurable non-DateTime generators are not implemented.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables, Prisma client generation or database are required.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Scenario configuration v1

`ScenarioConfigV1` is the complete reproducibility boundary. The downloaded config contains:

- `version: 1`
- scenario name and embedded Prisma schema source
- numeric seed
- scenario start and end dates
- every model count
- every scalar DateTime field strategy, fixed value and null percentage
- every temporal rule and offset

Parsing the embedded schema and passing the restored configuration to `generateScenarioRecords` reproduces the same records. The generated JSON data itself is not embedded in the config.

### DateTime semantics

- Scenario date inputs are interpreted as UTC midnight and are inclusive.
- `range` selects a whole UTC day inside the scenario window.
- `fixed` must be inside the scenario window and satisfy every rule targeting that field.
- Null percentages apply only to optional DateTime fields. They are deterministic per-record probabilities, not promises of an exact aggregate percentage.
- The defaults use `range` for `createdAt`, `updatedAt`, `startDate`, `endDate` and `resolvedAt`; optional `endDate` and `resolvedAt` receive non-zero null defaults.

### Rule semantics

A rule has one model, target field, reference field and type:

```text
Occupancy.endDate after Occupancy.startDate
MaintenanceRequest.resolvedAt after MaintenanceRequest.createdAt
```

- Both fields must be scalar DateTime fields on the same record and model.
- `after` means `target >= reference + minimum`.
- `before` means `target <= reference - minimum`.
- An omitted minimum is one day, so both operations are strict.
- Minimum and maximum offsets are positive integer UTC days and are inclusive.
- If the optional target is null, the rule does not apply to that record.
- If the target is non-null, its reference must contain a valid date.
- Multiple rules targeting a field are intersected. Empty windows and temporal dependency cycles fail before any unbounded search can occur.

Cross-model rules are not accepted by the configuration or offered by the UI.

## Supported Prisma subset

The parser remains a small, transparent subset parser rather than a full Prisma grammar implementation.

Supported:

- `model` and `enum` blocks with one field or enum value per line
- scalar types `String`, `Boolean`, `Int`, `BigInt`, `Float`, `Decimal`, `DateTime`, `Json` and `Bytes`
- model and enum field types
- list (`[]`) and optional (`?`) markers
- `@id`, `@unique`, `@default(...)`
- `@relation(fields: [...], references: [...])`, including named relations
- line and block comments

Compound directives such as `@@unique` are ignored and not enforced. Composite IDs, native database types, multi-line field declarations, implicit many-to-many materialization, relation cycles, Prisma `Unsupported`, arbitrary default functions and complete Prisma semantic validation are unsupported.

## Architecture

The UI depends on pure TypeScript domain modules:

```text
schema text -> parser.ts -> ParsedSchema
                         + ScenarioConfigV1
                         -> temporal.ts -> bounded field plans
                         -> generator.ts -> GeneratedData
                         -> validator.ts -> ValidationReport
```

- `src/domain/scenario-config.ts` owns configuration types, defaults, reconciliation and serialization.
- `src/domain/temporal.ts` validates temporal configuration and compiles per-model DateTime dependency plans.
- `src/domain/generator.ts` owns seeded, dependency-ordered generation.
- `src/domain/validator.ts` independently reads finished records and re-evaluates invariants.
- `src/components` owns React state, visualization and browser downloads only.

The random source is a seeded PRNG. There is no `Math.random()` or retry-until-valid fallback.

## Property-management example

The built-in example contains optional active occupancies (`endDate = null`) and unresolved maintenance requests (`resolvedAt = null`), plus bounded after rules for completed records. The standalone schema and sample data are in [`examples/property-management`](examples/property-management).

## Build Week

See [`BUILD_WITH_CODEX.md`](BUILD_WITH_CODEX.md) for the implementation decision log. SeedStory is licensed under the [MIT License](LICENSE).
