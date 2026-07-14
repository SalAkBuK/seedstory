import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { isDateTimeField, type ScenarioConfigV1, type TemporalRule } from "@/domain/scenario-config";
import type { ParsedSchema } from "@/domain/schema";

interface TemporalRuleEditorProps {
  schema: ParsedSchema;
  config: ScenarioConfigV1;
  onChange: (rules: TemporalRule[]) => void;
}

export function TemporalRuleEditor({ schema, config, onChange }: TemporalRuleEditorProps) {
  const eligibleModels = schema.models
    .map((model) => ({ ...model, dateFields: model.fields.filter(isDateTimeField) }))
    .filter((model) => model.dateFields.length >= 2);

  function addRule() {
    const model = eligibleModels[0];
    if (!model) return;
    let suffix = config.temporalRules.length + 1;
    while (config.temporalRules.some((rule) => rule.id === `rule-${suffix}`)) suffix += 1;
    onChange([
      ...config.temporalRules,
      {
        id: `rule-${suffix}`,
        type: "after",
        model: model.name,
        targetField: model.dateFields[1].name,
        referenceField: model.dateFields[0].name,
        minOffsetDays: 1,
      },
    ]);
  }

  function updateRule(index: number, patch: Partial<TemporalRule>) {
    onChange(config.temporalRules.map((rule, ruleIndex) =>
      ruleIndex === index ? { ...rule, ...patch } : rule,
    ));
  }

  function changeModel(index: number, modelName: string) {
    const model = eligibleModels.find((candidate) => candidate.name === modelName);
    if (!model) return;
    updateRule(index, {
      model: modelName,
      referenceField: model.dateFields[0].name,
      targetField: model.dateFields[1].name,
    });
  }

  return (
    <div className="rule-editor">
      <div className="subsection-heading">
        <div><CalendarClock size={15} /><span><strong>Same-record rules</strong><small>Strict calendar-day offsets</small></span></div>
        <button type="button" onClick={addRule} disabled={eligibleModels.length === 0}>
          <Plus size={13} /> Add rule
        </button>
      </div>
      {config.temporalRules.length === 0 ? (
        <div className="rule-empty">Add an after or before rule between two DateTime fields on the same model.</div>
      ) : (
        <div className="rule-list">
          {config.temporalRules.map((rule, index) => {
            const model = eligibleModels.find((candidate) => candidate.name === rule.model);
            const fields = model?.dateFields ?? [];
            return (
              <div className="rule-card" key={rule.id}>
                <div className="rule-card__top">
                  <span>RULE {String(index + 1).padStart(2, "0")}</span>
                  <code>{rule.id}</code>
                  <button type="button" aria-label={`Remove ${rule.id}`} onClick={() =>
                    onChange(config.temporalRules.filter((_, ruleIndex) => ruleIndex !== index))
                  }><Trash2 size={13} /></button>
                </div>
                <div className="rule-sentence">
                  <select aria-label={`Rule ${index + 1} model`} value={rule.model} onChange={(event) => changeModel(index, event.target.value)}>
                    {eligibleModels.map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}
                  </select>
                  <select aria-label={`Rule ${index + 1} target field`} value={rule.targetField} onChange={(event) => updateRule(index, { targetField: event.target.value })}>
                    {fields.filter((field) => field.name !== rule.referenceField).map((field) => <option key={field.name}>{field.name}</option>)}
                  </select>
                  <select aria-label={`Rule ${index + 1} type`} value={rule.type} onChange={(event) => updateRule(index, { type: event.target.value as TemporalRule["type"] })}>
                    <option value="after">after</option>
                    <option value="before">before</option>
                  </select>
                  <select aria-label={`Rule ${index + 1} reference field`} value={rule.referenceField} onChange={(event) => updateRule(index, { referenceField: event.target.value })}>
                    {fields.filter((field) => field.name !== rule.targetField).map((field) => <option key={field.name}>{field.name}</option>)}
                  </select>
                </div>
                <div className="rule-offsets">
                  <label>Minimum offset <span><input type="number" min="1" step="1" value={rule.minOffsetDays ?? ""} placeholder="1" onChange={(event) => updateRule(index, { minOffsetDays: event.target.value === "" ? undefined : Number(event.target.value) })} /> days</span></label>
                  <label>Maximum offset <span><input type="number" min="1" step="1" value={rule.maxOffsetDays ?? ""} placeholder="none" onChange={(event) => updateRule(index, { maxOffsetDays: event.target.value === "" ? undefined : Number(event.target.value) })} /> days</span></label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="rule-semantics">Rules apply when the target is non-null. “After” and “before” are strict; omitted minimum means 1 day. Cross-model fields are intentionally unavailable.</p>
    </div>
  );
}
