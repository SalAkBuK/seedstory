# Building SeedStory with Codex

## Context

SeedStory was developed for OpenAI Build Week as a solo, one-week project. Codex with GPT-5.6 was used as an implementation partner for repository scaffolding, domain design, UI implementation, tests, documentation, and verification. It is not part of the shipped application: SeedStory makes no OpenAI API calls at runtime.

## Decisions made with Codex

### 1. Build a vertical slice, not the full rule engine

The first implementation stops at schema parsing, relationship visualization, deterministic basic generation, table preview, and referential validation. Temporal rules and exports remain visible roadmap stages, not non-working controls.

### 2. Keep domain logic outside React

Codex helped establish a small intermediate representation in `src/domain/schema.ts`. The parser, generator, and validator consume plain TypeScript values and do not import React, browser APIs, Next.js, or React Flow. This makes the logic directly testable and leaves room for future export adapters.

### 3. Declare the parser boundary honestly

A full Prisma parser is not realistic for a one-week solo build. This slice uses a line-oriented subset parser and documents exactly what it supports. It recognizes explicit owning-side `@relation(fields:, references:)` metadata; it does not claim full Prisma grammar or semantic validation.

### 4. Make determinism structural

Generation receives the numeric seed as an explicit input and uses a seeded PRNG. Parent models are generated before dependent models, then foreign keys are selected only from generated parent records. There is no `Math.random()` fallback.

### 5. Keep the product local-first

All state is held in React memory. There is no API route, server action, database, auth layer, analytics SDK, or runtime model integration. The only server work is Next.js rendering and static asset delivery during development or hosting.

## How Codex was used

- Inspected the empty repository and established the Next.js/TypeScript toolchain.
- Translated the MVP boundary into domain contracts and failure modes.
- Implemented the Prisma subset parser and seeded generator.
- Added React Flow relationship visualization and the developer-tool workspace.
- Wrote focused Vitest tests around parser, generator, and validator behavior.
- Ran lint, TypeScript, tests, and the production build, then fixed issues found by those checks.
- Drafted repository documentation that distinguishes working behavior from roadmap items.

Human judgment remained responsible for product scope and accepting tradeoffs. Generated code was treated as code to inspect and verify, not as automatically correct output.

## Verification philosophy

The core claims map to executable tests:

- parser tests assert exact schema metadata;
- generator tests assert repeatability, dependency order, and valid foreign keys;
- validator tests prove both the valid path and deliberately corrupted data;
- lint, strict TypeScript checking, and a production build cover integration quality.

## Next decisions

The next slice should add a typed scenario configuration and only two temporal rules end-to-end (`after` and `before`) before attempting the more complex interval rules. That work should preserve the same domain boundary and add property-based tests for generated temporal invariants.
