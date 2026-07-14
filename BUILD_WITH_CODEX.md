# Building SeedStory with Codex

## Context

SeedStory was developed for OpenAI Build Week as a solo, one-week project. Codex with GPT-5.6 was used as an implementation partner for repository scaffolding, domain design, UI implementation, tests, documentation, and verification. It is not part of the shipped application: SeedStory makes no OpenAI API calls at runtime.

## Decisions made with Codex

### 1. Build vertical slices, not the full rule engine

The first implementation stopped at schema parsing, relationship visualization, deterministic basic generation, table preview and referential validation. The second adds configurable DateTime generation, two same-record rule types, independent temporal validation, a timeline and JSON exports. Interval and conditional rules remain out of scope.

### 2. Keep domain logic outside React

Codex helped establish a small intermediate representation in `src/domain/schema.ts`. The parser, generator, and validator consume plain TypeScript values and do not import React, browser APIs, Next.js, or React Flow. This makes the logic directly testable and leaves room for future export adapters.

### 3. Declare the parser boundary honestly

A full Prisma parser is not realistic for a one-week solo build. This slice uses a line-oriented subset parser and documents exactly what it supports. It recognizes explicit owning-side `@relation(fields:, references:)` metadata; it does not claim full Prisma grammar or semantic validation.

### 4. Make determinism structural

Generation receives the numeric seed as an explicit input and uses a seeded PRNG. Parent models are generated before dependent models, then foreign keys are selected only from generated parent records. There is no `Math.random()` fallback.

### 5. Keep the product local-first

All state is held in React memory. There is no API route, server action, database, auth layer, analytics SDK, or runtime model integration. The only server work is Next.js rendering and static asset delivery during development or hosting.

### 6. Make configuration the reproducibility boundary

The second slice introduced `ScenarioConfigV1`. It embeds the schema source alongside the seed, date range, model counts, DateTime strategies and rules. Serialization is tested by restoring the JSON, reparsing its schema and reproducing byte-equivalent generated values.

### 7. Compile temporal constraints instead of retrying

Codex helped model each same-record temporal rule as a dependency edge. DateTime fields are topologically ordered, downstream feasibility is propagated backward, and each value is selected once from a bounded interval. Cycles and empty intervals fail explicitly; there is no retry-until-valid loop.

### 8. Keep validation independent from generation

The validator reads the finished dataset and checks scenario boundaries plus each configured rule. Temporal issues carry model, record ID, target field, reference field, rule metadata and actual values. It does not accept a generator success flag as evidence.

## How Codex was used

- Inspected the empty repository and established the Next.js/TypeScript toolchain.
- Translated the MVP boundary into domain contracts and failure modes.
- Implemented the Prisma subset parser and seeded generator.
- Added React Flow relationship visualization and the developer-tool workspace.
- Wrote focused Vitest tests around parser, generator, and validator behavior.
- Added tests for deterministic DateTimes, range bounds, both rule directions, offsets, null probabilities, cycles, impossible windows and configuration restoration.
- Ran lint, TypeScript, tests, and the production build, then fixed issues found by those checks.
- Drafted repository documentation that distinguishes working behavior from roadmap items.

Human judgment remained responsible for product scope and accepting tradeoffs. Generated code was treated as code to inspect and verify, not as automatically correct output.

## Verification philosophy

The core claims map to executable tests:

- parser tests assert exact schema metadata;
- generator tests assert repeatability, dependency order, and valid foreign keys;
- validator tests prove both the valid path and deliberately corrupted data;
- temporal tests corrupt finished values to prove the independent validator catches generator-external failures;
- lint, strict TypeScript checking, and a production build cover integration quality.

## Next decisions

The third slice should implement `requiredWhen` first, then `noOverlap` as a separate interval allocator with property-based tests. `belongsToActivePeriod` should wait until cross-record and cross-model reference semantics are designed explicitly. Prisma `seed.ts` export should be added only after generator mappings are configurable enough to emit credible Prisma input values.
