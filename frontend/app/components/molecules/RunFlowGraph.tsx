"use client";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { layoutFlowGraph, type FlowEdge, type FlowNode, type FlowNodeData } from "../../lib/runFlowGraph";

type RunFlowGraphProps = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onSelectStep?: (stepIndex: number) => void;
  selectedStepIndex?: number | null;
};

function CardNode({ data }: NodeProps) {
  const node = data as FlowNodeData & { expanded?: boolean };
  const expanded = Boolean(node.expanded);
  const classes = [
    "flow-node",
    `flow-node-${node.kind}`,
    `flow-node-status-${node.status}`,
    node.isStart ? "flow-node-start" : "",
    node.isEnd ? "flow-node-end" : "",
    expanded ? "flow-node-expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shownDetails = expanded ? node.details : node.details.slice(0, 3);
  const hiddenCount = node.details.length - shownDetails.length;

  return (
    <div className={classes}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flow-node-head">
        {node.isStart ? <span className="flow-node-badge start">▶ Bắt đầu</span> : null}
        {node.isEnd ? <span className="flow-node-badge end">■ Kết thúc</span> : null}
        <span className={`flow-node-status-dot ${node.status}`} />
      </div>
      <div className="flow-node-title">{node.title}</div>
      {shownDetails.length ? (
        <ul className="flow-node-details">
          {shownDetails.map((detail, index) => (
            <li key={`${detail}-${index}`}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {expanded ? (
        node.summary ? (
          <div className="flow-node-body">
            <div className="flow-node-summary">{node.summary}</div>
          </div>
        ) : null
      ) : hiddenCount > 0 || node.summary ? (
        <div className="flow-node-more">Bấm để xem chi tiết{hiddenCount > 0 ? ` (+${hiddenCount})` : ""}</div>
      ) : null}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { card: CardNode };

// Khi sơ đồ mọc thêm node (đang chạy) thì fit lại TOÀN BỘ để luôn thấy hết,
// thay vì khoá camera vào một bước.
function FitOnGrow({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 60);
    return () => clearTimeout(timer);
  }, [count, fitView]);
  return null;
}

function RunFlowGraphInner({ edges, nodes, onSelectStep, selectedStepIndex }: RunFlowGraphProps) {
  const computedNodes = useMemo<Node[]>(
    () =>
      layoutFlowGraph(nodes, edges, selectedStepIndex ?? null).map((node) => ({
        id: node.id,
        position: node.position,
        data: { ...node.data, expanded: node.data.stepIndex === selectedStepIndex },
        type: "card",
        zIndex: node.data.stepIndex === selectedStepIndex ? 10 : 1,
      })),
    [nodes, edges, selectedStepIndex]
  );

  const computedEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: edge.animated,
        className: edge.intoActive ? "flow-edge-active" : undefined,
      })),
    [edges]
  );

  // React Flow tự quản trạng thái node (kéo thả mượt, không giật). Chỉ re-seed
  // khi data đổi, và GIỮ vị trí người dùng đã kéo.
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(computedNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(computedEdges);

  // Áp layout tự động mỗi khi cấu trúc/bung node đổi. Giữa các lần đó React Flow
  // vẫn cho kéo thả tự do (qua onNodesChange).
  useEffect(() => {
    setRfNodes(computedNodes);
  }, [computedNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(computedEdges);
  }, [computedEdges, setRfEdges]);

  if (!rfNodes.length) return null;

  return (
    <div className="run-flow-graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_event, node) => {
          const stepIndex = (node.data as FlowNodeData).stepIndex;
          if (typeof stepIndex === "number") onSelectStep?.(stepIndex);
        }}
      >
        <FitOnGrow count={nodes.length} />
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export default function RunFlowGraph(props: RunFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <RunFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
