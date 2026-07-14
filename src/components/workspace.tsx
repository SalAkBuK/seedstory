"use client";

import {
  AlertCircle,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Database,
  FileCode2,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  Play,
  RotateCcw,
  Rows3,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
import { generateRecords, GenerationError } from "@/domain/generator";
import { parsePrismaSchema } from "@/domain/parser";
import type { GeneratedData, GenerationResult, ValidationReport } from "@/domain/schema";
import { validateReferentialIntegrity } from "@/domain/validator";
import { PROPERTY_MANAGEMENT_SCHEMA } from "@/examples/property-management";
import { RelationshipGraph } from "./relationship-graph";

const DEFAULT_COUNTS: Record<string, number> = {
  Property: 2,
  Unit: 6,
  Tenant: 5,
  Lease: 5,
  MaintenanceRequest: 8,
};

const STEPS = [
  { name: "Schema", icon: FileCode2, state: "complete" },
  { name: "Relationships", icon: GitBranch, state: "complete" },
  { name: "Scenario", icon: Sparkles, state: "active" },
  { name: "Generate", icon: Play, state: "active" },
  { name: "Validate", icon: ShieldCheck, state: "active" },
  { name: "Export", icon: Braces, state: "upcoming" },
] as const;

function initialGeneration(): GenerationResult {
  const schema = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);
  return generateRecords(schema, DEFAULT_COUNTS, 42);
}

function totalRecords(data: GeneratedData | null): number {
  return data ? Object.values(data).reduce((total, records) => total + records.length, 0) : 0;
}

function ModelTabs({
  models,
  active,
  data,
  onChange,
}: {
  models: string[];
  active: string;
  data: GeneratedData;
  onChange: (model: string) => void;
}) {
  return (
    <div className="model-tabs" role="tablist" aria-label="Generated models">
      {models.map((model) => (
        <button
          type="button"
          role="tab"
          aria-selected={active === model}
          className={active === model ? "model-tab model-tab--active" : "model-tab"}
          key={model}
          onClick={() => onChange(model)}
        >
          {model}
          <span>{data[model]?.length ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function RecordsTable({ records }: { records: GeneratedData[string] }) {
  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  if (records.length === 0) {
    return <div className="empty-table">No records generated for this model.</div>;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={String(record.id ?? index)}>
              <td className="row-index">{String(index + 1).padStart(2, "0")}</td>
              {columns.map((column) => (
                <td key={column} title={String(record[column])}>
                  <code>{record[column] === null ? "null" : String(record[column])}</code>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ report }: { report: ValidationReport | null }) {
  if (!report) {
    return (
      <div className="validation-card validation-card--idle">
        <CircleDashed size={24} />
        <div><strong>Waiting for generation</strong><p>Generate records to run integrity checks.</p></div>
      </div>
    );
  }

  return (
    <div className={report.valid ? "validation-card validation-card--valid" : "validation-card validation-card--invalid"}>
      {report.valid ? <CheckCircle2 size={25} /> : <AlertCircle size={25} />}
      <div className="validation-card__body">
        <strong>{report.valid ? "All references are valid" : `${report.issues.length} integrity issues found`}</strong>
        <p>{report.checkedRecords} records · {report.checkedRelations} foreign keys checked</p>
        {report.issues.slice(0, 3).map((issue) => <code key={issue.message}>{issue.message}</code>)}
      </div>
      <span className="validation-badge">{report.valid ? "PASS" : "FAIL"}</span>
    </div>
  );
}

export function Workspace() {
  const [source, setSource] = useState(PROPERTY_MANAGEMENT_SCHEMA);
  const [counts, setCounts] = useState<Record<string, number>>(DEFAULT_COUNTS);
  const [seed, setSeed] = useState(42);
  const [generatedSeed, setGeneratedSeed] = useState(42);
  const [isDirty, setIsDirty] = useState(false);
  const [generation, setGeneration] = useState<GenerationResult>(initialGeneration);
  const [report, setReport] = useState<ValidationReport | null>(() =>
    validateReferentialIntegrity(parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA), initialGeneration().data),
  );
  const [activeModel, setActiveModel] = useState("Property");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const schema = useMemo(() => parsePrismaSchema(source), [source]);
  const relationCount = schema.models.reduce(
    (total, model) => total + model.fields.filter((field) => field.kind === "relation" && field.relation?.fields.length).length,
    0,
  );

  function loadExample() {
    setSource(PROPERTY_MANAGEMENT_SCHEMA);
    setCounts(DEFAULT_COUNTS);
    setGenerationError(null);
    setReport(null);
    setIsDirty(true);
  }

  function generate() {
    try {
      const effectiveCounts = Object.fromEntries(
        schema.models.map((model) => [model.name, counts[model.name] ?? 3]),
      );
      const result = generateRecords(schema, effectiveCounts, seed);
      setGeneration(result);
      setReport(validateReferentialIntegrity(schema, result.data));
      setActiveModel(result.order.find((model) => result.data[model]?.length) ?? result.order[0] ?? "");
      setGenerationError(null);
      setGeneratedSeed(seed);
      setIsDirty(false);
    } catch (error) {
      setGenerationError(error instanceof GenerationError ? error.message : "Generation failed unexpectedly.");
      setReport(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#workspace" className="brand" aria-label="SeedStory home">
          <span className="brand-mark"><GitBranch size={18} /></span>
          <span>SeedStory</span>
          <span className="alpha-badge">ALPHA</span>
        </a>
        <div className="local-pill"><LockKeyhole size={13} /> Local only <span /> No data leaves this browser</div>
        <span className="repo-link"><TerminalSquare size={15} /> Open source · MIT</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow"><span /> PRISMA DATA STUDIO</p>
          <h1>Turn your schema into a <em>credible story.</em></h1>
          <p className="hero-copy">Deterministic, relationship-aware records for demos and tests—generated entirely in your browser.</p>
        </div>
        <div className="hero-stat">
          <Database size={18} />
          <div><strong>{schema.models.length} models</strong><span>{relationCount} owning relationships detected</span></div>
        </div>
      </section>

      <nav className="workflow" aria-label="SeedStory workflow">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.name} className={`workflow-step workflow-step--${step.state}`}>
              <span><Icon size={15} /></span>
              <div><small>0{index + 1}</small><strong>{step.name}</strong></div>
              {step.state === "upcoming" && <i>SOON</i>}
              {index < STEPS.length - 1 && <ArrowRight className="workflow-arrow" size={14} />}
            </div>
          );
        })}
      </nav>

      <section id="workspace" className="workspace-grid">
        <article className="panel schema-panel">
          <div className="panel-heading">
            <div><span className="step-number">01</span><div><h2>Schema</h2><p>Paste Prisma schema text or load the example.</p></div></div>
            <button type="button" className="text-button" onClick={loadExample}><RotateCcw size={13} /> Load example</button>
          </div>
          <div className="editor-toolbar">
            <span><FileCode2 size={13} /> schema.prisma</span>
            <span className={schema.diagnostics.some((item) => item.severity === "error") ? "parse-state parse-state--error" : "parse-state"}>
              {schema.diagnostics.some((item) => item.severity === "error") ? <AlertCircle size={12} /> : <Check size={12} />}
              {schema.models.length} models parsed
            </span>
          </div>
          <textarea
            className="schema-editor"
            aria-label="Prisma schema"
            spellCheck={false}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setReport(null);
              setIsDirty(true);
            }}
          />
          <div className="schema-summary">
            <span><strong>{schema.models.length}</strong> Models</span>
            <span><strong>{schema.enums.length}</strong> Enums</span>
            <span><strong>{schema.models.reduce((total, model) => total + model.fields.length, 0)}</strong> Fields</span>
            <span><strong>{relationCount}</strong> Relations</span>
          </div>
          {schema.diagnostics.length > 0 && (
            <div className="diagnostics">
              {schema.diagnostics.map((diagnostic) => (
                <p key={diagnostic.message} className={`diagnostic diagnostic--${diagnostic.severity}`}>
                  <AlertCircle size={12} /> {diagnostic.message}
                </p>
              ))}
            </div>
          )}
        </article>

        <article className="panel graph-panel">
          <div className="panel-heading">
            <div><span className="step-number">02</span><div><h2>Relationships</h2><p>Owning relations inferred from explicit @relation metadata.</p></div></div>
            <span className="live-badge"><span /> LIVE</span>
          </div>
          <RelationshipGraph schema={schema} />
          <div className="graph-legend"><span><i className="key-dot" /> Primary key</span><span><i className="relation-line" /> Foreign key relation</span></div>
        </article>

        <aside className="panel scenario-panel">
          <div className="panel-heading">
            <div><span className="step-number">03</span><div><h2>Scenario</h2><p>Set a repeatable seed and model volume.</p></div></div>
          </div>
          <label className="field-label" htmlFor="seed">Numeric seed <span>Same input, same records</span></label>
          <div className="seed-input">
            <Braces size={16} />
            <input
              id="seed"
              type="number"
              step="1"
              value={seed}
              onChange={(event) => {
                setSeed(Number(event.target.value));
                setReport(null);
                setIsDirty(true);
              }}
            />
          </div>
          <div className="count-header"><span>Record counts</span><small>MAX 500 / MODEL</small></div>
          <div className="count-list">
            {schema.models.map((model) => (
              <label key={model.name}>
                <span><i>{model.name.slice(0, 2).toUpperCase()}</i>{model.name}</span>
                <input
                  aria-label={`${model.name} record count`}
                  type="number"
                  min="0"
                  max="500"
                  step="1"
                  value={counts[model.name] ?? 3}
                  onChange={(event) => {
                    setCounts((current) => ({ ...current, [model.name]: Number(event.target.value) }));
                    setReport(null);
                    setIsDirty(true);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="generation-order">
            <span>Dependency order</span>
            <code>{isDirty ? "Generate to resolve the current schema" : generation.order.join(" → ")}</code>
          </div>
          {generationError && <div className="generation-error"><AlertCircle size={14} /> {generationError}</div>}
          <button type="button" className="generate-button" onClick={generate}>
            <Play size={15} fill="currentColor" /> Generate records <ArrowRight size={15} />
          </button>
          <p className="local-note"><LockKeyhole size={12} /> Deterministic and browser-local</p>
        </aside>
      </section>

      <section className="results-grid">
        <article className="panel records-panel">
          <div className="panel-heading result-heading">
            <div><span className="step-number">04</span><div><h2>Generated records</h2><p>{totalRecords(generation.data)} rows produced in dependency order.</p></div></div>
            <span className={isDirty ? "generated-pill generated-pill--stale" : "generated-pill"}>
              <Rows3 size={13} /> {isDirty ? "stale preview" : `seed ${generatedSeed}`}
            </span>
          </div>
          <ModelTabs models={generation.order} active={activeModel} data={generation.data} onChange={setActiveModel} />
          <RecordsTable records={generation.data[activeModel] ?? []} />
        </article>

        <article className="panel validation-panel">
          <div className="panel-heading result-heading">
            <div><span className="step-number">05</span><div><h2>Validation</h2><p>Primary key and foreign key invariants.</p></div></div>
          </div>
          <ValidationPanel report={report} />
          <div className="check-list">
            <div><CheckCircle2 size={15} /><span>Primary keys present and unique</span></div>
            <div><CheckCircle2 size={15} /><span>Foreign keys resolve to parents</span></div>
            <div className="check-list--future"><LoaderCircle size={15} /><span>Temporal business rules</span><small>NEXT SLICE</small></div>
          </div>
        </article>
      </section>

      <section className="upcoming-banner">
        <div><span className="upcoming-icon"><ChevronDown size={18} /></span><div><strong>Next: time-aware scenarios and export</strong><p>The UI marks these stages honestly; no runtime OpenAI call or hidden backend is involved.</p></div></div>
        <span>LOCAL-FIRST BY DESIGN</span>
      </section>
    </main>
  );
}
