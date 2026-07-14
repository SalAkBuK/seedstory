import { CalendarDays, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { isDateTimeField, type ScenarioConfigV1 } from "@/domain/scenario-config";
import type { GeneratedData, ParsedSchema, ScalarValue } from "@/domain/schema";

interface TimelineEvent {
  timestamp: number;
  value: string;
  model: string;
  recordId: ScalarValue;
  field: string;
}

function timelineEvents(schema: ParsedSchema, data: GeneratedData) {
  const events: TimelineEvent[] = [];
  let nullValues = 0;
  for (const model of schema.models) {
    const dateFields = model.fields.filter(isDateTimeField);
    const idField = model.fields.find((field) => field.isId)?.name;
    for (const [recordIndex, record] of (data[model.name] ?? []).entries()) {
      for (const field of dateFields) {
        const value = record[field.name];
        if (value === null || value === undefined) {
          nullValues += 1;
          continue;
        }
        const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
        if (!Number.isFinite(timestamp)) continue;
        events.push({
          timestamp,
          value: String(value),
          model: model.name,
          recordId: idField ? record[idField] : recordIndex + 1,
          field: field.name,
        });
      }
    }
  }
  events.sort((left, right) => left.timestamp - right.timestamp || left.model.localeCompare(right.model));
  return { events, nullValues };
}

export function TimelinePreview({
  schema,
  data,
  config,
}: {
  schema: ParsedSchema;
  data: GeneratedData;
  config: ScenarioConfigV1;
}) {
  const [modelFilter, setModelFilter] = useState("all");
  const timeline = useMemo(() => timelineEvents(schema, data), [schema, data]);
  const models = [...new Set(timeline.events.map((event) => event.model))];
  const visibleEvents = modelFilter === "all"
    ? timeline.events
    : timeline.events.filter((event) => event.model === modelFilter);

  return (
    <article className="panel timeline-panel">
      <div className="panel-heading result-heading">
        <div><span className="step-number">08</span><div><h2>Timeline</h2><p>{config.scenarioStart} to {config.scenarioEnd} · {timeline.events.length} events</p></div></div>
        <label className="timeline-filter">Model
          <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="all">All models</option>
            {models.map((model) => <option key={model}>{model}</option>)}
          </select>
        </label>
      </div>
      <div className="timeline-body">
        {visibleEvents.length === 0 ? (
          <div className="timeline-empty"><CalendarDays size={24} /><strong>No dated events</strong><span>This filter contains only empty or null DateTime values.</span></div>
        ) : (
          <div className="timeline-list">
            {visibleEvents.map((event, index) => {
              const date = new Date(event.timestamp);
              return (
                <div className="timeline-event" key={`${event.model}-${String(event.recordId)}-${event.field}-${index}`}>
                  <div className="timeline-date"><strong>{date.toLocaleDateString("en", { month: "short", day: "2-digit", timeZone: "UTC" })}</strong><span>{date.getUTCFullYear()}</span></div>
                  <span className="timeline-dot" />
                  <div className="timeline-event__content">
                    <span className="timeline-model">{event.model}</span>
                    <strong>{String(event.recordId)}</strong>
                    <code>{event.field}</code>
                  </div>
                  <span className="timeline-time"><Clock3 size={11} /> {date.toISOString().slice(11, 16)} UTC</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="timeline-footer">{timeline.nullValues} null DateTime values omitted · events sorted chronologically</div>
    </article>
  );
}
