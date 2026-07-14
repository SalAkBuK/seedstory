"use client";

import {
  AlertCircle,
  ArrowRight,
  Braces,
  CalendarRange,
  Check,
  CheckCircle2,
  CircleDashed,
  Database,
  Download,
  FileCode2,
  GitBranch,
  LockKeyhole,
  Play,
  RotateCcw,
  Rows3,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
import { generateScenarioRecords, GenerationError } from "@/domain/generator";
import { parsePrismaSchema } from "@/domain/parser";
import {
  deserializeScenarioConfig,
  isDateTimeField,
  reconcileScenarioConfig,
  serializeScenarioConfig,
  type DateTimeFieldConfig,
  type ScenarioConfigV1,
} from "@/domain/scenario-config";
import type { GeneratedData, GenerationResult, ParsedSchema, ValidationReport } from "@/domain/schema";
import { validateGeneratedData } from "@/domain/validator";
import {
  PROPERTY_MANAGEMENT_SCENARIO,
  PROPERTY_MANAGEMENT_SCHEMA,
} from "@/examples/property-management";
import { RelationshipGraph } from "./relationship-graph";
import { TemporalRuleEditor } from "./temporal-rule-editor";
import { TimelinePreview } from "./timeline-preview";

const STEPS = [
  { name: "Schema", icon: FileCode2, state: "complete" },
  { name: "Relationships", icon: GitBranch, state: "complete" },
  { name: "Scenario", icon: Sparkles, state: "active" },
  { name: "Generate", icon: Play, state: "active" },
  { name: "Validate", icon: ShieldCheck, state: "active" },
  { name: "Export", icon: Braces, state: "active" },
] as const;

const INITIAL_SCHEMA = parsePrismaSchema(PROPERTY_MANAGEMENT_SCHEMA);
const INITIAL_GENERATION = generateScenarioRecords(INITIAL_SCHEMA, PROPERTY_MANAGEMENT_SCENARIO);
const INITIAL_REPORT = validateGeneratedData(INITIAL_SCHEMA, INITIAL_GENERATION.data, PROPERTY_MANAGEMENT_SCENARIO);

function cloneConfig(config: ScenarioConfigV1): ScenarioConfigV1 {
  return deserializeScenarioConfig(serializeScenarioConfig(config));
}

function totalRecords(data: GeneratedData): number {
  return Object.values(data).reduce((total, records) => total + records.length, 0);
}

function downloadJson(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
          {model}<span>{data[model]?.length ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function RecordsTable({ records }: { records: GeneratedData[string] }) {
  const columns = records.length > 0 ? Object.keys(records[0]) : [];
  if (records.length === 0) return <div className="empty-table">No records generated for this model.</div>;
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>#</th>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {records.map((record, index) => (
            <tr key={String(record.id ?? index)}>
              <td className="row-index">{String(index + 1).padStart(2, "0")}</td>
              {columns.map((column) => <td key={column} title={String(record[column])}><code>{record[column] === null ? "null" : String(record[column])}</code></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ report }: { report: ValidationReport | null }) {
  if (!report) {
    return <div className="validation-card validation-card--idle"><CircleDashed size={24} /><div><strong>Inputs changed</strong><p>Generate again to validate the current scenario.</p></div></div>;
  }
  return (
    <div className={report.valid ? "validation-card validation-card--valid" : "validation-card validation-card--invalid"}>
      {report.valid ? <CheckCircle2 size={25} /> : <AlertCircle size={25} />}
      <div className="validation-card__body">
        <strong>{report.valid ? "All generated invariants are valid" : `${report.issues.length} validation issues found`}</strong>
        <p>{report.checkedRecords} records · {report.checkedRelations} FKs · {report.checkedTemporalRules} temporal rules</p>
        {report.issues.slice(0, 4).map((issue, index) => <code key={`${issue.message}-${index}`}>{issue.message}</code>)}
      </div>
      <span className="validation-badge">{report.valid ? "PASS" : "FAIL"}</span>
    </div>
  );
}

function DateTimeFieldEditor({
  schema,
  config,
  onChange,
}: {
  schema: ParsedSchema;
  config: ScenarioConfigV1;
  onChange: (fields: DateTimeFieldConfig[]) => void;
}) {
  const optionalFields = new Set(
    schema.models.flatMap((model) => model.fields.filter((field) => isDateTimeField(field) && field.isOptional).map((field) => `${model.name}.${field.name}`)),
  );

  function update(index: number, patch: Partial<DateTimeFieldConfig>) {
    onChange(config.dateTimeFields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  }

  return (
    <div className="datetime-editor">
      <div className="subsection-heading">
        <div><CalendarRange size={15} /><span><strong>DateTime generators</strong><small>Range, fixed values and deterministic nulls</small></span></div>
        <span className="field-count">{config.dateTimeFields.length} FIELDS</span>
      </div>
      <div className="datetime-list">
        {config.dateTimeFields.map((field, index) => {
          const key = `${field.model}.${field.field}`;
          const optional = optionalFields.has(key);
          return (
            <div className="datetime-row" key={key}>
              <div className="datetime-name"><span>{field.model}</span><strong>{field.field}</strong>{optional && <i>OPTIONAL</i>}</div>
              <label>Generator
                <select value={field.generator} onChange={(event) => update(index, { generator: event.target.value as DateTimeFieldConfig["generator"], fixedDate: event.target.value === "fixed" ? config.scenarioStart : undefined })}>
                  <option value="range">Scenario range</option><option value="fixed">Fixed date</option>
                </select>
              </label>
              <label className={field.generator === "fixed" ? "" : "datetime-fixed--hidden"}>Fixed date
                <input type="date" min={config.scenarioStart} max={config.scenarioEnd} value={field.fixedDate ?? config.scenarioStart} onChange={(event) => update(index, { fixedDate: event.target.value })} />
              </label>
              <label>Null chance
                <span className="percentage-input"><input aria-label={`${key} null percentage`} type="number" min="0" max="100" step="1" disabled={!optional} value={field.nullPercentage} onChange={(event) => update(index, { nullPercentage: Number(event.target.value) })} /><i>%</i></span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Workspace() {
  const [source, setSource] = useState(PROPERTY_MANAGEMENT_SCHEMA);
  const [scenario, setScenario] = useState<ScenarioConfigV1>(() => cloneConfig(PROPERTY_MANAGEMENT_SCENARIO));
  const [generation, setGeneration] = useState<GenerationResult>(INITIAL_GENERATION);
  const [generatedConfig, setGeneratedConfig] = useState<ScenarioConfigV1>(() => cloneConfig(PROPERTY_MANAGEMENT_SCENARIO));
  const [generatedSchema, setGeneratedSchema] = useState<ParsedSchema>(INITIAL_SCHEMA);
  const [report, setReport] = useState<ValidationReport | null>(INITIAL_REPORT);
  const [activeModel, setActiveModel] = useState("Property");
  const [isDirty, setIsDirty] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const schema = useMemo(() => parsePrismaSchema(source), [source]);
  const relationCount = schema.models.reduce((total, model) => total + model.fields.filter((field) => field.kind === "relation" && field.relation?.fields.length).length, 0);

  function markDirty() {
    setIsDirty(true);
    setReport(null);
    setGenerationError(null);
  }

  function updateScenario(patch: Partial<ScenarioConfigV1>) {
    setScenario((current) => ({ ...current, ...patch }));
    markDirty();
  }

  function loadExample() {
    const config = cloneConfig(PROPERTY_MANAGEMENT_SCENARIO);
    setSource(PROPERTY_MANAGEMENT_SCHEMA);
    setScenario(config);
    setGeneration(INITIAL_GENERATION);
    setGeneratedConfig(cloneConfig(config));
    setGeneratedSchema(INITIAL_SCHEMA);
    setReport(INITIAL_REPORT);
    setActiveModel("Property");
    setGenerationError(null);
    setIsDirty(false);
  }

  function generate() {
    try {
      const effectiveConfig = reconcileScenarioConfig(schema, source, scenario);
      const result = generateScenarioRecords(schema, effectiveConfig);
      const validation = validateGeneratedData(schema, result.data, effectiveConfig);
      setScenario(effectiveConfig);
      setGeneration(result);
      setGeneratedConfig(cloneConfig(effectiveConfig));
      setGeneratedSchema(schema);
      setReport(validation);
      setActiveModel(result.order.find((model) => result.data[model]?.length) ?? result.order[0] ?? "");
      setGenerationError(null);
      setIsDirty(false);
    } catch (error) {
      setGenerationError(error instanceof GenerationError ? error.message : error instanceof Error ? error.message : "Generation failed unexpectedly.");
      setReport(null);
    }
  }

  function exportValidationReport() {
    if (!report || isDirty) return;
    downloadJson("validation-report.json", `${JSON.stringify({ version: 1, scenario: { name: generatedConfig.name, seed: generatedConfig.seed }, ...report }, null, 2)}\n`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a href="#workspace" className="brand" aria-label="SeedStory home"><span className="brand-mark"><GitBranch size={18} /></span><span>SeedStory</span><span className="alpha-badge">ALPHA</span></a>
        <div className="local-pill"><LockKeyhole size={13} /> Local only <span /> No data leaves this browser</div>
        <span className="repo-link"><TerminalSquare size={15} /> Open source · MIT</span>
      </header>

      <section className="hero">
        <div><p className="eyebrow"><span /> PRISMA DATA STUDIO</p><h1>Turn your schema into a <em>credible story.</em></h1><p className="hero-copy">Deterministic, relationship-aware and time-aware records—generated entirely in your browser.</p></div>
        <div className="hero-stat"><Database size={18} /><div><strong>{schema.models.length} models</strong><span>{relationCount} owning relationships · {scenario.temporalRules.length} temporal rules</span></div></div>
      </section>

      <nav className="workflow" aria-label="SeedStory workflow">
        {STEPS.map((step, index) => { const Icon = step.icon; return <div key={step.name} className={`workflow-step workflow-step--${step.state}`}><span><Icon size={15} /></span><div><small>0{index + 1}</small><strong>{step.name}</strong></div>{index < STEPS.length - 1 && <ArrowRight className="workflow-arrow" size={14} />}</div>; })}
      </nav>

      <section id="workspace" className="workspace-grid">
        <article className="panel schema-panel">
          <div className="panel-heading"><div><span className="step-number">01</span><div><h2>Schema</h2><p>Paste Prisma schema text or load the example.</p></div></div><button type="button" className="text-button" onClick={loadExample}><RotateCcw size={13} /> Load example</button></div>
          <div className="editor-toolbar"><span><FileCode2 size={13} /> schema.prisma</span><span className={schema.diagnostics.some((item) => item.severity === "error") ? "parse-state parse-state--error" : "parse-state"}>{schema.diagnostics.some((item) => item.severity === "error") ? <AlertCircle size={12} /> : <Check size={12} />}{schema.models.length} models parsed</span></div>
          <textarea className="schema-editor" aria-label="Prisma schema" spellCheck={false} value={source} onChange={(event) => {
            const nextSource = event.target.value;
            const nextSchema = parsePrismaSchema(nextSource);
            setSource(nextSource);
            setScenario((current) => reconcileScenarioConfig(nextSchema, nextSource, current));
            markDirty();
          }} />
          <div className="schema-summary"><span><strong>{schema.models.length}</strong> Models</span><span><strong>{schema.enums.length}</strong> Enums</span><span><strong>{schema.models.reduce((total, model) => total + model.fields.length, 0)}</strong> Fields</span><span><strong>{relationCount}</strong> Relations</span></div>
          {schema.diagnostics.length > 0 && <div className="diagnostics">{schema.diagnostics.map((diagnostic) => <p key={diagnostic.message} className={`diagnostic diagnostic--${diagnostic.severity}`}><AlertCircle size={12} /> {diagnostic.message}</p>)}</div>}
        </article>

        <article className="panel graph-panel">
          <div className="panel-heading"><div><span className="step-number">02</span><div><h2>Relationships</h2><p>Owning relations inferred from explicit @relation metadata.</p></div></div><span className="live-badge"><span /> LIVE</span></div>
          <RelationshipGraph schema={schema} />
          <div className="graph-legend"><span><i className="key-dot" /> Primary key</span><span><i className="relation-line" /> Foreign key relation</span></div>
        </article>

        <aside className="panel scenario-panel">
          <div className="panel-heading"><div><span className="step-number">03</span><div><h2>Scenario</h2><p>Name, range, seed and model volume.</p></div></div></div>
          <label className="field-label" htmlFor="scenario-name">Scenario name</label>
          <input id="scenario-name" className="scenario-text-input" value={scenario.name} onChange={(event) => updateScenario({ name: event.target.value })} />
          <div className="scenario-date-grid">
            <label>Starts<input type="date" value={scenario.scenarioStart} onChange={(event) => updateScenario({ scenarioStart: event.target.value })} /></label>
            <label>Ends<input type="date" value={scenario.scenarioEnd} onChange={(event) => updateScenario({ scenarioEnd: event.target.value })} /></label>
          </div>
          <label className="field-label" htmlFor="seed">Numeric seed <span>Same config, same records</span></label>
          <div className="seed-input"><Braces size={16} /><input id="seed" type="number" step="1" value={scenario.seed} onChange={(event) => updateScenario({ seed: Number(event.target.value) })} /></div>
          <div className="count-header"><span>Record counts</span><small>MAX 500 / MODEL</small></div>
          <div className="count-list">{schema.models.map((model) => <label key={model.name}><span><i>{model.name.slice(0, 2).toUpperCase()}</i>{model.name}</span><input aria-label={`${model.name} record count`} type="number" min="0" max="500" step="1" value={scenario.recordCounts[model.name] ?? 3} onChange={(event) => updateScenario({ recordCounts: { ...scenario.recordCounts, [model.name]: Number(event.target.value) } })} /></label>)}</div>
          {generationError && <div className="generation-error"><AlertCircle size={14} /> {generationError}</div>}
          <button type="button" className="generate-button" onClick={generate}><Play size={15} fill="currentColor" /> Generate scenario <ArrowRight size={15} /></button>
          <p className="local-note"><LockKeyhole size={12} /> Bounded, deterministic and browser-local</p>
        </aside>
      </section>

      <section className="temporal-grid">
        <article className="panel temporal-fields-panel">
          <div className="panel-heading"><div><span className="step-number">04</span><div><h2>Temporal configuration</h2><p>Every scalar DateTime field has an explicit generation strategy.</p></div></div></div>
          <DateTimeFieldEditor schema={schema} config={scenario} onChange={(dateTimeFields) => updateScenario({ dateTimeFields })} />
        </article>
        <article className="panel temporal-rules-panel">
          <div className="panel-heading"><div><span className="step-number">05</span><div><h2>Temporal rules</h2><p>Same-record after and before constraints only.</p></div></div><span className="rule-count-badge">{scenario.temporalRules.length} ACTIVE</span></div>
          <TemporalRuleEditor schema={schema} config={scenario} onChange={(temporalRules) => updateScenario({ temporalRules })} />
        </article>
      </section>

      <section className="results-grid">
        <article className="panel records-panel">
          <div className="panel-heading result-heading"><div><span className="step-number">06</span><div><h2>Generated records</h2><p>{totalRecords(generation.data)} rows produced in dependency order.</p></div></div><span className={isDirty ? "generated-pill generated-pill--stale" : "generated-pill"}><Rows3 size={13} /> {isDirty ? "stale preview" : `seed ${generatedConfig.seed}`}</span></div>
          <ModelTabs models={generation.order} active={activeModel} data={generation.data} onChange={setActiveModel} />
          <RecordsTable records={generation.data[activeModel] ?? []} />
        </article>
        <article className="panel validation-panel">
          <div className="panel-heading result-heading"><div><span className="step-number">07</span><div><h2>Independent validation</h2><p>Finished data is rechecked from scratch.</p></div></div></div>
          <ValidationPanel report={report} />
          <div className="check-list"><div><CheckCircle2 size={15} /><span>Primary and foreign keys</span></div><div><CheckCircle2 size={15} /><span>Scenario date boundaries</span></div><div><CheckCircle2 size={15} /><span>After / before offsets</span></div></div>
        </article>
      </section>

      <TimelinePreview schema={generatedSchema} data={generation.data} config={generatedConfig} />

      <section className="panel export-panel">
        <div><span className="step-number">09</span><div><h2>JSON exports</h2><p>Config embeds the schema and every input required to reproduce generation.</p></div></div>
        <div className="export-actions">
          <button type="button" onClick={() => downloadJson("seedstory.config.json", serializeScenarioConfig({ ...scenario, schemaSource: source }))}><Download size={14} /><span><strong>seedstory.config.json</strong><small>Current scenario configuration</small></span></button>
          <button type="button" disabled={!report || isDirty} onClick={exportValidationReport}><Download size={14} /><span><strong>validation-report.json</strong><small>{isDirty ? "Regenerate before export" : "Last independent validation"}</small></span></button>
        </div>
      </section>

      <section className="upcoming-banner"><div><span className="upcoming-icon"><Sparkles size={18} /></span><div><strong>Later slices: conditional and interval-aware rules</strong><p>requiredWhen, noOverlap, belongsToActivePeriod, cross-model rules and Prisma seed.ts are not implemented.</p></div></div><span>SCOPE LOCKED</span></section>
    </main>
  );
}
