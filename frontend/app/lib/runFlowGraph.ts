import dagre from "@dagrejs/dagre";
import type { AgentStep } from "../types/agent";

// Dựng graph (nodes + edges có toạ độ) ngay từ các step đang stream về, để sơ đồ
// lớn dần LIVE trong lúc agent suy luận — không chờ step "flow" ở cuối run.
// Logic này mirror backend AgentLoop::RunFlowBuilder.

export type FlowNodeStatus = "done" | "active";

export type FlowNodeData = {
  kind: string;
  title: string;
  details: string[];
  summary: string;
  status: FlowNodeStatus;
  isStart: boolean;
  isEnd: boolean;
  stepIndex: number;
};

export type FlowNode = {
  id: string;
  position: { x: number; y: number };
  data: FlowNodeData;
};

export type FlowEdge = { id: string; source: string; target: string; animated: boolean; intoActive: boolean };

export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[] };

const COL_W = 320;
const ROW_H = 190;
const MAX_ITEMS = 4;

const LABELS: Record<string, string> = {
  context: "Đọc ngữ cảnh",
  reasoning: "Phân tích yêu cầu",
  plan: "Lập plan",
  decision: "Chọn action",
  retrieval: "Tìm nguồn",
  document_search: "Tìm tài liệu",
  web_search: "Tìm trên web",
  web_read: "Đọc trang web",
  artifact: "Soạn bản nháp",
  verification: "Kiểm tra bản nháp",
  clarification: "Hỏi làm rõ",
  evaluation: "Đánh giá",
  llm: "Gọi model",
  answer: "Trả lời cuối",
  error: "Lỗi",
};

const ACTION_LABELS: Record<string, string> = {
  search_documents: "Tìm tài liệu",
  web_search: "Tìm trên web",
  draft_artifact: "Soạn bản nháp",
  verify_artifact: "Kiểm tra bản nháp",
  revise_artifact: "Sửa bản nháp",
  ask_clarification: "Hỏi làm rõ",
  final_answer: "Trả lời cuối",
};

type LaneNode = { title: string; details: string[] };

export function buildRunFlowGraph(steps: AgentStep[], options: { running?: boolean } = {}): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let row = 0;
  let prevExits: string[] = [];

  const lastIndex = steps.length - 1;
  // Khi đang chạy: bước mới nhất là "frontier" đang xử lý -> đánh dấu active.
  const activeIndex = options.running ? lastIndex : -1;
  const activeIds = new Set<string>();

  steps.forEach((step, index) => {
    const base = `S${index + 1}`;
    const lanes = step.kind === "retrieval" ? retrievalLanes(step) : [];
    const status: FlowNodeStatus = index === activeIndex ? "active" : "done";
    const isStart = index === 0;
    const isEnd = !options.running && index === lastIndex;
    if (status === "active") activeIds.add(base);

    nodes.push(
      graphNode(base, step.kind, nodeTitle(step, index), detailLines(step), 0, row, {
        status,
        isStart,
        isEnd,
        stepIndex: index,
        summary: asText(step.summary),
      })
    );
    const headerRow = row;
    row += 1;

    let exits: string[];
    if (lanes.length < 2) {
      exits = [base];
    } else {
      exits = [];
      const offset = (lanes.length - 1) / 2;
      lanes.forEach((lane, laneIndex) => {
        const col = laneIndex - offset;
        let previous = base;
        lane.forEach((laneNode, nodeIndex) => {
          const nid = `${base}L${laneIndex}N${nodeIndex}`;
          if (status === "active") activeIds.add(nid);
          nodes.push(
            graphNode(nid, "lane", laneNode.title, laneNode.details, col, headerRow + 1 + nodeIndex, {
              status,
              isStart: false,
              isEnd: false,
              stepIndex: index,
              summary: "",
            })
          );
          edges.push(edge(previous, nid, activeIds));
          previous = nid;
        });
        exits.push(previous);
      });
      row = headerRow + 1 + Math.max(...lanes.map((lane) => lane.length));
    }

    prevExits.forEach((from) => edges.push(edge(from, base, activeIds)));
    prevExits = exits;
  });

  return { nodes, edges };
}

function graphNode(
  id: string,
  kind: string,
  title: string,
  details: string[],
  col: number,
  row: number,
  meta: { status: FlowNodeStatus; isStart: boolean; isEnd: boolean; stepIndex: number; summary: string }
): FlowNode {
  return {
    id,
    position: { x: Math.round(col * COL_W), y: row * ROW_H },
    data: { kind, title, details: details.filter(Boolean), ...meta },
  };
}

function edge(source: string, target: string, activeIds: Set<string>): FlowEdge {
  // Animate MỌI edge để cả luồng nhìn như đang chảy; edge dẫn vào node đang chạy
  // sẽ nổi bật hơn nhờ class riêng ở tầng render.
  return { id: `${source}-${target}`, source, target, animated: true, intoActive: activeIds.has(target) };
}

function nodeTitle(step: AgentStep, index: number): string {
  return `${index + 1}. ${LABELS[step.kind] ?? step.title}`;
}

// ----- Lane cho bước retrieval -----

function retrievalLanes(step: AgentStep): LaneNode[][] {
  const data = step.data ?? {};
  const tools = asStringArray(data.tools);
  const documents = asRecords(data.documents);
  const webResults = asRecords(data.web_results);
  const pages = asRecords(data.pages);

  const lanes: LaneNode[][] = [];
  if (tools.includes("document_search")) {
    const internal = documents.filter((doc) => !isDriveDoc(doc));
    lanes.push([{ title: "Tìm tài liệu nội bộ", details: bulletDetails(titlesOf(internal)) }]);
  }
  if (tools.includes("drive_document_search")) {
    const drive = documents.filter(isDriveDoc);
    lanes.push([{ title: "Google Drive", details: bulletDetails(titlesOf(drive)) }]);
  }
  const webLane: LaneNode[] = [];
  if (tools.includes("web_search")) {
    webLane.push({ title: "Tìm trên web", details: webDetails(data, webResults) });
  }
  if (tools.includes("web_page_reader")) {
    const read = pages.filter((page) => asText(page.status) === "read");
    webLane.push({ title: "Đọc trang web", details: [`${read.length} trang đọc được`] });
  }
  if (webLane.length) lanes.push(webLane);
  return lanes;
}

function webDetails(data: Record<string, unknown>, webResults: Record<string, unknown>[]): string[] {
  if (webResults.length) return bulletDetails(titlesOf(webResults));

  const raw = asRecords(data.web_raw_results);
  const candidates = asRecords(data.web_candidates);
  if (!raw.length) return ["không có kết quả thô trả về"];

  const lines = [`0/${raw.length} đạt chuẩn`];
  const reasons = Array.from(new Set(candidates.map((candidate) => asText(candidate.reason)).filter(Boolean))).slice(0, 2);
  reasons.forEach((reason) => lines.push(`loại: ${reason}`));
  return lines;
}

function bulletDetails(titles: string[]): string[] {
  if (!titles.length) return ["(không có kết quả)"];
  return titles.map((title) => `• ${title}`);
}

function isDriveDoc(doc: Record<string, unknown>): boolean {
  const source = asText(doc.source);
  return source.startsWith("drive://") || asText(doc.type) === "google_drive" || asText(doc.search_provider) === "drive";
}

function titlesOf(items: Record<string, unknown>[]): string[] {
  const names = items.map((item) => asText(item.title)).filter(Boolean);
  if (names.length <= MAX_ITEMS) return names;
  return [...names.slice(0, MAX_ITEMS), `+${names.length - MAX_ITEMS} nữa`];
}

// ----- Chi tiết cho từng loại bước -----

function detailLines(step: AgentStep): string[] {
  const data = step.data ?? {};
  switch (step.kind) {
    case "context":
      return contextLines(data);
    case "retrieval":
      return retrievalHeaderLines(data);
    case "reasoning": {
      const intent = asText(data.intent);
      return intent ? [`intent: ${intent}`] : [];
    }
    case "plan":
      return planLines(data);
    case "evaluation":
      return evaluationLines(data);
    case "decision": {
      const action = asText(data.action);
      return action ? [`→ ${ACTION_LABELS[action] ?? action}`] : [];
    }
    case "llm": {
      const model = asText(data.model);
      return model ? [model] : [];
    }
    case "answer": {
      const output = asText(data.output);
      return output ? [`${output.length} ký tự`] : [];
    }
    default:
      return [];
  }
}

function contextLines(data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const project = data.project;
  if (project && typeof project === "object") {
    const title = asText((project as Record<string, unknown>).title);
    if (title) lines.push(`project: ${title}`);
  }
  const conversation = data.conversation;
  if (conversation && typeof conversation === "object") {
    const customer = asText((conversation as Record<string, unknown>).customer_name);
    if (customer) lines.push(`khách hàng: ${customer}`);
  }
  const messages = asRecords(data.recent_messages);
  if (messages.length) lines.push(`${messages.length} tin nhắn gần đây`);
  return lines;
}

function retrievalHeaderLines(data: Record<string, unknown>): string[] {
  const keywords = asStringArray(data.keywords).filter(Boolean);
  const lines: string[] = [];
  if (keywords.length) lines.push(`từ khoá: ${keywords.slice(0, 6).join(", ")}`);
  const reformulated = asText(data.reformulated_query);
  if (reformulated) lines.push(`thử lại: ${reformulated}`);
  return lines;
}

function planLines(data: Record<string, unknown>): string[] {
  const steps = asRecords(data.steps);
  if (steps.length) {
    return steps.slice(0, 6).map((planStep) => {
      const title = asText(planStep.title) || ACTION_LABELS[asText(planStep.action)] || asText(planStep.action);
      return `• ${title}`;
    });
  }
  const goal = asText(data.goal);
  return goal ? [goal.length > 80 ? `${goal.slice(0, 80)}…` : goal] : [];
}

function evaluationLines(data: Record<string, unknown>): string[] {
  const after = (data.after_counts ?? {}) as Record<string, unknown>;
  const docs = Number(after.documents) || 0;
  const web = Number(after.web_results) || 0;
  const pages = Number(after.web_pages) || 0;
  return [`giữ ${docs + web + pages} nguồn (tài liệu ${docs}, web ${web})`];
}

// Auto-layout bằng dagre: tính lại vị trí theo kích thước ước lượng của từng
// node (node đang bung sẽ to hơn) để không bao giờ đè nhau.
export function layoutFlowGraph(nodes: FlowNode[], edges: FlowEdge[], expandedStepIndex: number | null): FlowNode[] {
  if (!nodes.length) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 70, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const size = estimateNodeSize(node, node.data.stepIndex === expandedStepIndex);
    graph.setNode(node.id, { width: size.width, height: size.height });
  });
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));

  dagre.layout(graph);

  return nodes.map((node) => {
    const laid = graph.node(node.id);
    return { ...node, position: { x: Math.round(laid.x - laid.width / 2), y: Math.round(laid.y - laid.height / 2) } };
  });
}

function estimateNodeSize(node: FlowNode, expanded: boolean): { width: number; height: number } {
  const width = expanded ? 300 : 240;
  const shown = expanded ? node.data.details.length : Math.min(3, node.data.details.length);
  let height = 56 + shown * 18;
  if (expanded && node.data.summary) height += Math.min(180, 48 + node.data.summary.length / 3);
  else if (!expanded && node.data.details.length > 3) height += 18;
  return { width, height: Math.max(70, height) };
}

// ----- helpers -----

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}
