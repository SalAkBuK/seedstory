"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { KeyRound, Link2 } from "lucide-react";
import { useMemo } from "react";
import type { ParsedSchema, PrismaModel } from "@/domain/schema";

type ModelNode = Node<{ model: PrismaModel }, "model">;

function ModelCard({ data }: NodeProps<ModelNode>) {
  return (
    <div className="graph-node">
      <Handle type="target" position={Position.Left} className="graph-handle" />
      <div className="graph-node__header">
        <span className="graph-node__eyebrow">MODEL</span>
        <strong>{data.model.name}</strong>
        <span>{data.model.fields.length}</span>
      </div>
      <div className="graph-node__fields">
        {data.model.fields
          .filter((field) => field.kind !== "relation")
          .slice(0, 6)
          .map((field) => (
            <div key={field.name} className="graph-field">
              <span className="graph-field__name">
                {field.isId ? <KeyRound size={10} /> : field.name.endsWith("Id") ? <Link2 size={10} /> : null}
                {field.name}
              </span>
              <span>{field.type}{field.isOptional ? "?" : ""}</span>
            </div>
          ))}
      </div>
      <Handle type="source" position={Position.Right} className="graph-handle" />
    </div>
  );
}

const nodeTypes = { model: ModelCard };

function graphElements(schema: ParsedSchema): { nodes: ModelNode[]; edges: Edge[] } {
  const levels = new Map(schema.models.map((model) => [model.name, 0]));
  for (let pass = 0; pass < schema.models.length; pass += 1) {
    for (const model of schema.models) {
      for (const relation of model.fields.filter(
        (field) => field.kind === "relation" && field.relation?.fields.length,
      )) {
        const parentLevel = levels.get(relation.type) ?? 0;
        levels.set(model.name, Math.max(levels.get(model.name) ?? 0, parentLevel + 1));
      }
    }
  }

  const byLevel = new Map<number, PrismaModel[]>();
  for (const model of schema.models) {
    const level = Math.min(levels.get(model.name) ?? 0, schema.models.length - 1);
    byLevel.set(level, [...(byLevel.get(level) ?? []), model]);
  }

  const nodes: ModelNode[] = [];
  for (const [level, models] of [...byLevel.entries()].sort(([a], [b]) => a - b)) {
    models.forEach((model, index) => {
      nodes.push({
        id: model.name,
        type: "model",
        position: { x: level * 300, y: index * 220 - ((models.length - 1) * 110) },
        data: { model },
      });
    });
  }

  const edges: Edge[] = schema.models.flatMap((model) =>
    model.fields
      .filter((field) => field.kind === "relation" && field.relation?.fields.length)
      .map((field) => ({
        id: `${field.type}-${model.name}-${field.name}`,
        source: field.type,
        target: model.name,
        label: field.relation?.fields.join(", "),
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8056f2" },
        style: { stroke: "#8056f2", strokeWidth: 1.5 },
        labelStyle: { fill: "#675d7c", fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#f7f5fb", fillOpacity: 0.95 },
      })),
  );

  return { nodes, edges };
}

export function RelationshipGraph({ schema }: { schema: ParsedSchema }) {
  const { nodes, edges } = useMemo(() => graphElements(schema), [schema]);

  return (
    <div className="relationship-graph" aria-label="Model relationship graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.35}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#ddd8e8" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
