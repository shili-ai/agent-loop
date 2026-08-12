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
import { useEffect, useMemo, useRef, useState } from "react";
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

  const shownDetails = expanded ? node.details : node.details.slice(0, 4);
  const hiddenCount = node.details.length - shownDetails.length;

  return (
    <div className={classes}>
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="flow-node-head">
        {node.elapsedSeconds !== null ? <span className="flow-node-badge elapsed">{node.elapsedSeconds}s</span> : null}
        {node.isStart ? <span className="flow-node-badge start">▶ Bắt đầu</span> : null}
        {node.isEnd ? <span className="flow-node-badge end">■ Kết thúc</span> : null}
        <span className={`flow-node-status-dot ${node.status}`} />
        <span className={`flow-node-status-label ${node.status}`}>{statusLabel(node.status)}</span>
      </div>
      <div className="flow-node-title">{node.title}</div>
      {shownDetails.length ? (
        <div className="flow-node-details" role="list">
          {shownDetails.map((detail, index) => (
            <div className="flow-node-detail" role="listitem" key={`${detail}-${index}`}>
              {detail}
            </div>
          ))}
        </div>
      ) : null}
      {expanded ? (
        node.summary || node.debug ? (
          <div className="flow-node-body">
            {node.summary ? (
              <>
                <div className="flow-node-body-title">Tóm tắt</div>
                <div className="flow-node-summary">{node.summary}</div>
              </>
            ) : null}
            {node.debug ? (
              <>
                <div className="flow-node-body-title">Debug data</div>
                <pre className="flow-node-debug">{node.debug}</pre>
              </>
            ) : null}
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
const COLLAPSED_NODE_W = 240;
const COLLAPSED_NODE_H = 92;
const EXPANDED_NODE_W = 560;

function statusLabel(status: FlowNodeData["status"]) {
  return { done: "Xong", active: "Đang chạy", pending: "Chờ", blocked: "Bị chặn" }[status];
}

// Lần đầu fit toàn bộ; khi có bước mới thì đưa camera về node mới nhất.
// Khi bung chi tiết, fit lại để layout mở rộng không bị nằm ngoài khung nhìn.
function FocusOnGraphChange({
  count,
  focusNode,
  expandedNode,
  expandedNodeId,
}: {
  count: number;
  focusNode?: Node;
  expandedNode?: Node;
  expandedNodeId?: string | null;
}) {
  const { fitView, getZoom, setCenter } = useReactFlow();
  const previousCountRef = useRef<number | null>(null);
  const previousExpandedNodeRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const previousCount = previousCountRef.current;
    const countIncreased = previousCount !== null && count > previousCount;
    const initialRender = previousCount === null;
    const selectedChanged = previousExpandedNodeRef.current !== expandedNodeId;

    previousCountRef.current = count;
    previousExpandedNodeRef.current = expandedNodeId;

    const timer = setTimeout(() => {
      if (countIncreased && focusNode) {
        setCenter(focusNode.position.x + COLLAPSED_NODE_W / 2, focusNode.position.y + COLLAPSED_NODE_H / 2, {
          duration: 450,
          zoom: 0.95,
        });
        return;
      }

      if (initialRender) {
        fitView({ padding: 0.2, duration: 400 });
        return;
      }

      // Bung/thu chi tiết không được fit lại toàn bộ graph vì node rộng hơn sẽ
      // khiến React Flow hạ zoom mỗi lần click. Giữ nguyên zoom và chỉ đưa node
      // đang xem vào trung tâm.
      if (selectedChanged && expandedNode) {
        setCenter(expandedNode.position.x + EXPANDED_NODE_W / 2, expandedNode.position.y + COLLAPSED_NODE_H / 2, {
          duration: 300,
          zoom: getZoom(),
        });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [count, focusNode, expandedNode, expandedNodeId, fitView, getZoom, setCenter]);
  return null;
}

function RunFlowGraphInner({ edges, nodes, onSelectStep, selectedStepIndex }: RunFlowGraphProps) {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const activeExpandedNodeId = expandedNodeId ?? (selectedStepIndex === null || selectedStepIndex === undefined ? null : `S${selectedStepIndex + 1}`);

  const computedNodes = useMemo<Node[]>(
    () =>
      layoutFlowGraph(nodes, edges, activeExpandedNodeId).map((node) => ({
        id: node.id,
        position: node.position,
        data: { ...node.data, expanded: node.id === activeExpandedNodeId },
        type: "card",
        zIndex: node.id === activeExpandedNodeId ? 10 : 1,
      })),
    [nodes, edges, activeExpandedNodeId]
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

  const focusNode = useMemo(() => {
    const latestStepIndex = computedNodes.reduce((latest, node) => {
      const stepIndex = (node.data as FlowNodeData).stepIndex;
      return typeof stepIndex === "number" ? Math.max(latest, stepIndex) : latest;
    }, -1);
    if (latestStepIndex < 0) return undefined;

    return computedNodes.find((node) => node.id === `S${latestStepIndex + 1}`);
  }, [computedNodes]);

  const expandedNode = useMemo(() => computedNodes.find((node) => node.id === activeExpandedNodeId), [activeExpandedNodeId, computedNodes]);

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
          setExpandedNodeId(node.id);
          const stepIndex = (node.data as FlowNodeData).stepIndex;
          if (typeof stepIndex === "number") onSelectStep?.(stepIndex);
        }}
      >
        <FocusOnGraphChange count={computedNodes.length} focusNode={focusNode} expandedNode={expandedNode} expandedNodeId={activeExpandedNodeId} />
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
