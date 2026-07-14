# SeedStory

SeedStory turns a Prisma schema into deterministic, relationship-aware demo data. It is a local-first developer tool: schema text and generated records remain in browser memory, and the MVP has no authentication, database, telemetry, runtime AI call, or cloud persistence.

This repository currently contains the first end-to-end vertical slice built for OpenAI Build Week. It is intentionally narrower than the final product description.

## Working in this slice

- Paste a Prisma schema or restore the built-in property-management example.
- Parse models, enums, scalar fields, IDs, unique markers, optional markers, defaults, lists, and explicit owning relations.
- Inspect an interactive model relationship graph.
- Set a numeric seed and per-model record counts.
- Generate scalar records in dependency order with primary and foreign keys.
- Preview each model in a table.
- Validate primary-key presence/uniqueness and foreign-key integrity.

Scenario rules, temporal validation, a timeline, configurable field generators, ecommerce examples, and file exports are not implemented yet. They are marked as upcoming in the interface.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No environment variables, Prisma client generation, or database are required.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Supported Prisma subset

The parser is deliberately a small, transparent subset parser rather than a claim of full Prisma grammar compatibility.

Supported in this slice:

- `model` and `enum` blocks with one field or enum value per line
- scalar types `String`, `Boolean`, `Int`, `BigInt`, `Float`, `Decimal`, `DateTime`, `Json`, and `Bytes`
- model and enum field types
- list (`[]`) and optional (`?`) markers
- `@id`, `@unique`, `@default(...)`
- `@relation(fields: [...], references: [...])`, including named relations
- line and block comments

Ignored and not enforced during generation: compound model directives such as `@@unique`.

Not supported yet: composite IDs, native database types, multi-line field declarations, implicit many-to-many materialization, relation cycles, Prisma `Unsupported`, arbitrary functions in defaults, or complete Prisma semantic validation. Unsupported syntax may be ignored or diagnosed; never treat SeedStory as a Prisma schema validator.

## Architecture

The browser interface depends on pure TypeScript domain modules:

```text
schema text
  -> parser.ts -> ParsedSchema
  -> generator.ts + seed/counts -> GeneratedData
  -> validator.ts -> ValidationReport
```

- `src/domain/parser.ts` owns schema-to-intermediate-representation parsing.
- `src/domain/generator.ts` owns dependency ordering and deterministic record generation.
- `src/domain/validator.ts` owns data invariants.
- `src/components` owns presentation and browser interaction only.
- `src/examples` contains the exact built-in example.
- `examples/property-management` contains copyable schema and data artifacts.

The random source is a small seeded PRNG. Generation is reproducible for the same parsed schema, counts, and numeric seed; it does not rely on `Math.random()`.

## Example

The UI starts with the property-management schema loaded. The standalone version is at [`examples/property-management/schema.prisma`](examples/property-management/schema.prisma), with a small valid data snapshot at [`examples/property-management/generated-data.json`](examples/property-management/generated-data.json).

## Build Week

See [`BUILD_WITH_CODEX.md`](BUILD_WITH_CODEX.md) for the decision log and how Codex with GPT-5.6 was used. The project is licensed under the [MIT License](LICENSE).
