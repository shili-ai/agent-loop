import dagre from "@dagrejs/dagre";
import type { AgentStep } from "../types/agent";

// Dựng graph (nodes + edges có toạ độ) ngay từ các step đang stream về, để sơ đồ
// lớn dần LIVE trong lúc agent suy luận — không chờ step "flow" ở cuối run.
// Logic này mirror backend AgentLoop::RunFlowBuilder.

export type FlowNodeStatus = "done" | "active" | "pending" | "blocked";

export type FlowNodeData = {
  kind: string;
  title: string;
  details: string[];
  summary: string;
  debug: string;
  status: FlowNodeStatus;
  isStart: boolean;
  isEnd: boolean;
  stepIndex: number | null;
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
const COLLAPSED_NODE_W = 240;
const EXPANDED_NODE_W = 560;

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

type LaneNode = { title: string; details: string[]; kind?: string };
type PlannedAction = { action: string; title: string; detail: string; expected: string };

export function buildRunFlowGraph(steps: AgentStep[], options: { running?: boolean; blocked?: boolean } = {}): FlowGraph {
  const plannedActions = plannedActionsFromRun(steps);
  if (plannedActions.length) return buildPlannedFlowGraph(steps, plannedActions, options);

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let row = 0;
  let prevExits: string[] = [];

  const lastIndex = steps.length - 1;
  // Ưu tiên trạng thái worker từ backend; fallback về step mới nhất khi polling
  // chưa kịp nhận status của step.
  const runningIndex = steps.findLastIndex((step) => asText(step.data?.status) === "running");
  const activeIndex = runningIndex >= 0 ? runningIndex : options.running ? lastIndex : -1;
  const activeIds = new Set<string>();

  steps.forEach((step, index) => {
    const base = `S${index + 1}`;
    const lanes = stepLanes(step);
    const status: FlowNodeStatus = stepStatus(step, index, activeIndex);
    const isStart = index === 0;
    const isEnd = !options.running && index === lastIndex;
    if (status === "active") activeIds.add(base);

    nodes.push(
      graphNode(base, step.kind, nodeTitle(step), detailLines(step), 0, row, {
        status,
        isStart,
        isEnd,
        stepIndex: index,
        summary: asText(step.summary),
        debug: stepDebug(step),
      })
    );
    const headerRow = row;
    row += 1;

    let exits: string[];
    if (!lanes.length) {
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
            graphNode(nid, laneNode.kind ?? "lane", laneNode.title, laneNode.details, col, headerRow + 1 + nodeIndex, {
              status,
              isStart: false,
              isEnd: false,
              stepIndex: index,
              summary: "",
              debug: JSON.stringify({ parent_step: step.kind, title: laneNode.title, details: laneNode.details }, null, 2),
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

  appendPlannedNodes(nodes, edges, steps, row, prevExits, options, activeIds);

  return { nodes, edges };
}

// Flow mode ưu tiên biểu diễn cấu trúc plan thay vì từng log nội bộ. Trace mode
// vẫn hiển thị đầy đủ decision/LLM/evaluation theo đúng thứ tự thực thi.
function buildPlannedFlowGraph(steps: AgentStep[], plan: PlannedAction[], options: { running?: boolean; blocked?: boolean }): FlowGraph {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const activeIds = new Set<string>();
  const planIndex = steps.findLastIndex((step) => step.kind === "plan");
  const prefix = steps.slice(0, planIndex + 1);
  let row = 0;
  let exits: string[] = [];

  prefix.forEach((step, index) => {
    const id = `S${index + 1}`;
    const status = stepStatus(step, index, -1);
    nodes.push(
      graphNode(id, step.kind, nodeTitle(step), detailLines(step), 0, row, {
        status,
        isStart: index === 0,
        isEnd: false,
        stepIndex: index,
        summary: asText(step.summary),
        debug: stepDebug(step),
      })
    );
    exits.forEach((from) => edges.push(edge(from, id, activeIds)));
    exits = [id];
    row += 1;
  });

  const executions = plannedExecutions(steps.slice(planIndex + 1), plan, planIndex + 1);
  let hasActiveNode = false;
  let actionIndex = 0;
  while (actionIndex < plan.length) {
    const group = parallelPlannedSteps(plan, actionIndex);
    const ids = group.map((planned, branchIndex) => {
      const execution = executions[actionIndex + branchIndex];
      const status = plannedActionStatus(execution, options, hasActiveNode);
      if (status === "active") hasActiveNode = true;
      const id = `P${actionIndex + branchIndex + 1}`;
      if (status === "active") activeIds.add(id);
      nodes.push(
        graphNode(id, `plan-${planned.action}`, planned.title || ACTION_LABELS[planned.action] || planned.action, plannedActionDetails(planned, status, group.length > 1), branchIndex - (group.length - 1) / 2, row, {
          status,
          isStart: false,
          isEnd: planned.action === "final_answer" && status === "done",
          stepIndex: execution?.index ?? null,
          summary: execution ? asText(execution.step.summary) : "",
          debug: JSON.stringify({ planned_action: planned.action, status, execution_step: execution?.step.kind }, null, 2),
        })
      );
      return id;
    });
    ids.forEach((id) => exits.forEach((from) => edges.push(edge(from, id, activeIds))));
    exits = ids;
    row += 1;
    actionIndex += group.length;
  }

  return { nodes, edges };
}

function plannedActionsFromRun(steps: AgentStep[]): PlannedAction[] {
  const planStep = steps.findLast((step) => step.kind === "plan");
  return asRecords(planStep?.data?.steps)
    .map((step) => ({
      action: asText(step.action),
      title: asText(step.title),
      detail: asText(step.detail),
      expected: asText(step.expected),
    }))
    .filter((step) => Boolean(ACTION_LABELS[step.action]));
}

function plannedExecutions(steps: AgentStep[], plan: PlannedAction[], offset: number) {
  let cursor = 0;
  return plan.map((planned) => {
    for (let index = cursor; index < steps.length; index += 1) {
      if (actionForStep(steps[index]) !== planned.action) continue;
      cursor = index + 1;
      return { step: steps[index], index: index + offset };
    }
    return undefined;
  });
}

function parallelPlannedSteps(plan: PlannedAction[], index: number) {
  const pair = plan.slice(index, index + 2);
  return pair.length === 2 && pair.some((step) => step.action === "search_documents") && pair.some((step) => step.action === "web_search") ? pair : [plan[index]];
}

function plannedActionStatus(
  execution: { step: AgentStep; index: number } | undefined,
  options: { running?: boolean; blocked?: boolean },
  hasActiveNode: boolean
): FlowNodeStatus {
  if (execution) return stepStatus(execution.step, execution.index, -1);
  if (options.blocked) return "blocked";
  if (options.running && !hasActiveNode) return "active";
  return "pending";
}

function plannedActionDetails(step: PlannedAction, status: FlowNodeStatus, parallel: boolean) {
  return compactLines([
    step.detail,
    step.expected ? `Mong đợi: ${step.expected}` : "",
    parallel ? "Nhánh thu thập nguồn · thực thi tuần tự theo plan" : "",
    status === "pending" ? "Đang chờ bước trước hoàn tất" : "",
    status === "blocked" ? "Bị chặn: lượt chạy chưa thể tiếp tục" : "",
  ]);
}

function graphNode(
  id: string,
  kind: string,
  title: string,
  details: string[],
  col: number,
  row: number,
  meta: { status: FlowNodeStatus; isStart: boolean; isEnd: boolean; stepIndex: number | null; summary: string; debug: string }
): FlowNode {
  return {
    id,
    position: { x: Math.round(col * COL_W), y: row * ROW_H },
    data: { kind, title, details: details.filter(Boolean), ...meta },
  };
}

function edge(source: string, target: string, activeIds: Set<string>): FlowEdge {
  // Chỉ edge đi vào node active mới chuyển động, để bước pending không tạo cảm
  // giác đang được xử lý.
  return { id: `${source}-${target}`, source, target, animated: activeIds.has(target), intoActive: activeIds.has(target) };
}

function stepStatus(step: AgentStep, index: number, activeIndex: number): FlowNodeStatus {
  const status = asText(step.data?.status);
  if (status === "failed" || step.kind === "error") return "blocked";
  if (status === "running" || index === activeIndex) return "active";
  return "done";
}

function appendPlannedNodes(
  nodes: FlowNode[],
  edges: FlowEdge[],
  steps: AgentStep[],
  startRow: number,
  previousExits: string[],
  options: { running?: boolean; blocked?: boolean },
  activeIds: Set<string>
) {
  const remainingActions = remainingPlanActions(steps);
  if (!remainingActions.length) return;

  const hasActiveNode = nodes.some((node) => node.data.status === "active");
  let row = startRow;
  let exits = previousExits;
  let actionIndex = 0;
  while (actionIndex < remainingActions.length) {
    const actions = parallelPlanActions(remainingActions, actionIndex);
    const ids = actions.map((action, branchIndex) => {
      const status: FlowNodeStatus = options.blocked ? "blocked" : options.running && !hasActiveNode && actionIndex === 0 && branchIndex === 0 ? "active" : "pending";
      const id = `P${actionIndex + branchIndex + 1}`;
      if (status === "active") activeIds.add(id);
      nodes.push(
        graphNode(id, `plan-${action}`, ACTION_LABELS[action] ?? action, [planStatusDetail(status, actions.length > 1)], branchIndex - (actions.length - 1) / 2, row, {
          status,
          isStart: false,
          isEnd: false,
          stepIndex: null,
          summary: "",
          debug: JSON.stringify({ planned_action: action, status, visual_group: actions.length > 1 ? "retrieval" : undefined }, null, 2),
        })
      );
      return id;
    });
    ids.forEach((id) => exits.forEach((from) => edges.push(edge(from, id, activeIds))));
    exits = ids;
    row += 1;
    actionIndex += actions.length;
  }
}

// Hai nguồn độc lập có thể vẽ thành nhánh song song để dễ đọc, nhưng Runner
// vẫn thực thi từng action theo plan; đây không phải lệnh chạy đồng thời.
function parallelPlanActions(actions: string[], index: number) {
  const pair = actions.slice(index, index + 2);
  return pair.length === 2 && pair.includes("search_documents") && pair.includes("web_search") ? pair : [actions[index]];
}

function remainingPlanActions(steps: AgentStep[]) {
  const planIndex = steps.findLastIndex((step) => step.kind === "plan");
  if (planIndex < 0) return [];

  const planned = asRecords(steps[planIndex].data?.steps)
    .map((step) => asText(step.action))
    .filter((action) => ACTION_LABELS[action]);
  const executed = steps.slice(planIndex + 1).map(actionForStep).filter(Boolean);
  let cursor = 0;
  executed.forEach((action) => {
    if (action === planned[cursor]) cursor += 1;
  });
  return planned.slice(cursor);
}

function actionForStep(step: AgentStep) {
  if (step.kind === "document_search") return "search_documents";
  if (step.kind === "web_search") return "web_search";
  if (step.kind === "verification") return "verify_artifact";
  if (step.kind === "clarification") return "ask_clarification";
  if (step.kind === "answer") return "final_answer";
  if (step.kind === "artifact") return step.title.toLowerCase().includes("sửa") ? "revise_artifact" : "draft_artifact";
  return "";
}

function planStatusDetail(status: FlowNodeStatus, parallel = false) {
  if (status === "active") return "Đang thực hiện theo plan";
  if (status === "blocked") return "Bị chặn: lượt chạy chưa thể tiếp tục";
  return parallel ? "Nhánh thu thập nguồn · thực thi tuần tự theo plan" : "Đang chờ bước trước hoàn tất";
}

function nodeTitle(step: AgentStep): string {
  return LABELS[step.kind] ?? step.title;
}

// ----- Lane cho bước retrieval -----

function stepLanes(step: AgentStep): LaneNode[][] {
  switch (step.kind) {
    case "retrieval":
      return retrievalLanes(step);
    case "document_search":
      return [documentSearchLane(step.data ?? {})];
    case "web_search":
      return [webSearchLane(step.data ?? {})];
    case "web_read":
      return [webReadLane(step.data ?? {})];
    case "evaluation":
      return evaluationLanes(step.data ?? {});
    default:
      return [];
  }
}

function retrievalLanes(step: AgentStep): LaneNode[][] {
  const data = step.data ?? {};
  const tools = asStringArray(data.tools);
  const documents = asRecords(data.documents);
  const webResults = asRecords(data.web_results);
  const pages = asRecords(data.pages);

  const lanes: LaneNode[][] = [];
  if (tools.includes("document_search")) {
    const internal = documents.filter((doc) => !isDriveDoc(doc));
    lanes.push(documentSearchLane(data, internal, "Tìm tài liệu nội bộ"));
  }
  if (tools.includes("drive_document_search")) {
    const drive = documents.filter(isDriveDoc);
    lanes.push(documentSearchLane(data, drive, "Tìm Google Drive"));
  }
  if (tools.includes("web_search")) {
    const webLane = webSearchLane(data, webResults);
    if (tools.includes("web_page_reader")) webLane.push(...webReadLane(data, pages));
    lanes.push(webLane);
  }
  return lanes;
}

function documentSearchLane(
  data: Record<string, unknown>,
  suppliedDocuments = asRecords(data.documents),
  label = "Tìm tài liệu"
): LaneNode[] {
  const documents = suppliedDocuments;
  const queryDetails = compactLines([
    labeled("query", asText(data.query)),
    labeled("từ khoá", asStringArray(data.keywords).join(", ")),
    labeled("trạng thái", asText(data.status)),
  ]);
  const resultNodes = documents.map((document) => ({
    kind: "result",
    title: `Tài liệu: ${asText(document.title) || asText(document.name) || "Không có tiêu đề"}`,
    details: searchResultDetails([document]),
  }));
  return [
    { title: label, details: queryDetails.length ? queryDetails : ["không có query"], kind: "operation" },
    ...(resultNodes.length ? resultNodes : [{ title: "Kết quả tài liệu", details: ["không tìm thấy tài liệu phù hợp"], kind: "result" }]),
  ];
}

function webSearchLane(data: Record<string, unknown>, suppliedResults = asRecords(data.web_results)): LaneNode[] {
  const raw = asRecords(data.web_raw_results);
  const candidates = asRecords(data.web_candidates);
  const results = suppliedResults;
  const queryDetails = compactLines([
    labeled("query", asText(data.query)),
    labeled("từ khoá", asStringArray(data.keywords).join(", ")),
    labeled("trạng thái", asText(data.status)),
  ]);
  const filterDetails = compactLines([
    `nhận về: ${raw.length || results.length} link`,
    `ứng viên: ${candidates.length || results.length}`,
    `đạt chuẩn: ${results.length}`,
    ...Array.from(new Set(candidates.map((item) => asText(item.reason)).filter(Boolean))).map((reason) => `loại: ${reason}`),
  ]);
  const resultNodes = results.map((result) => ({
    kind: "result",
    title: `Link đạt chuẩn: ${asText(result.title) || asText(result.url) || "Không có tiêu đề"}`,
    details: searchResultDetails([result]),
  }));

  return [
    { title: "Gửi truy vấn web", details: queryDetails.length ? queryDetails : ["không có query"], kind: "operation" },
    { title: "Lọc kết quả web", details: filterDetails, kind: "operation" },
    ...(resultNodes.length ? resultNodes : [{ title: "Kết quả web", details: webDetails(data, results), kind: "result" }]),
  ];
}

function webReadLane(data: Record<string, unknown>, suppliedPages = asRecords(data.pages)): LaneNode[] {
  const crawled = suppliedPages.length ? suppliedPages : asRecords(data.results);
  if (!crawled.length) return [{ title: "Crawler trang web", details: ["chưa có link để crawler"], kind: "operation" }];

  return crawled.map((page) => ({
    kind: "crawler",
    title: `Crawler: ${asText(page.title) || domainOf(asText(page.requested_url) || asText(page.url)) || "trang web"}`,
    details: webReadDetails({ results: [page] }, [page]),
  }));
}

function evaluationLanes(data: Record<string, unknown>): LaneNode[][] {
  const groups: Array<[string, Record<string, unknown>[]]> = [
    ["Đánh giá tài liệu", asRecords(data.document_evaluations)],
    ["Đánh giá kết quả web", asRecords(data.web_result_evaluations)],
    ["Đánh giá trang crawler", asRecords(data.web_page_evaluations)],
  ];

  return groups
    .filter(([, entries]) => entries.length)
    .map(([title, entries]) => [
      {
        title,
        kind: "evaluation-detail",
        details: entries.map((entry) => {
          const itemTitle = asText(entry.title) || asText(entry.name) || asText(entry.url) || "Nguồn";
          return compactLines([
            itemTitle,
            labeled("điểm", asText(entry.score)),
            labeled("kết quả", entry.accepted === true ? "giữ" : entry.accepted === false ? "loại" : asText(entry.decision) || asText(entry.status)),
            labeled("lý do", asText(entry.reason)),
          ]).join("; ");
        }),
      },
    ]);
}

function webReadDetails(data: Record<string, unknown>, pages: Record<string, unknown>[]): string[] {
  const crawled = pages.length ? pages : asRecords(data.results);
  if (!crawled.length) return ["chưa có link để crawler"];

  return crawled.map((page) => {
    const url = asText(page.requested_url) || asText(page.url);
    const finalUrl = asText(page.url);
    const fields = [
      labeled("link", url),
      finalUrl && finalUrl !== url ? labeled("sau redirect", finalUrl) : "",
      labeled("trạng thái", asText(page.status) || "đang chờ"),
      labeled("lỗi", asText(page.error)),
    ].filter(Boolean);
    return fields.join("; ");
  });
}

function webDetails(data: Record<string, unknown>, webResults: Record<string, unknown>[]): string[] {
  if (webResults.length) return searchResultDetails(webResults);

  const raw = asRecords(data.web_raw_results);
  const candidates = asRecords(data.web_candidates);
  if (!raw.length) return ["không có kết quả thô trả về"];

  const lines = [`0/${raw.length} đạt chuẩn`];
  const reasons = Array.from(new Set(candidates.map((candidate) => asText(candidate.reason)).filter(Boolean))).slice(0, 2);
  reasons.forEach((reason) => lines.push(`loại: ${reason}`));
  return lines;
}

function isDriveDoc(doc: Record<string, unknown>): boolean {
  const source = asText(doc.source);
  return source.startsWith("drive://") || asText(doc.type) === "google_drive" || asText(doc.search_provider) === "drive";
}

function searchResultDetails(items: Record<string, unknown>[]): string[] {
  if (!items.length) return ["(không có kết quả)"];
  return items.map((item) => {
    const title = asText(item.title) || asText(item.name) || asText(item.url) || "Không có tiêu đề";
    const fields = [
      labeled("nguồn", asText(item.source) || asText(item.search_provider)),
      labeled("loại", asText(item.type) || asText(item.mime_type)),
      labeled("lý do", asText(item.reason)),
      labeled("url", asText(item.url)),
    ].filter(Boolean);
    return fields.length ? `${title} — ${fields.join("; ")}` : title;
  });
}

// ----- Chi tiết cho từng loại bước -----

function detailLines(step: AgentStep): string[] {
  const data = step.data ?? {};
  switch (step.kind) {
    case "context":
      return contextLines(data);
    case "retrieval":
      return retrievalHeaderLines(data);
    case "web_search":
      return webDetails(data, asRecords(data.web_results));
    case "web_read":
      return webReadDetails(data, asRecords(data.pages));
    case "reasoning": {
      const intent = asText(data.intent);
      return compactLines([
        labeled("intent", intent),
        labeled("mục tiêu", asText(data.goal)),
        labeled("ngữ cảnh", asText(data.context)),
        labeled("rủi ro", asText(data.risk)),
      ]);
    }
    case "plan":
      return planLines(data);
    case "evaluation":
      return evaluationLines(data);
    case "decision": {
      const action = asText(data.action);
      return compactLines([
        labeled("action", action ? ACTION_LABELS[action] ?? action : ""),
        labeled("lý do", asText(data.reason)),
        labeled("confidence", asText(data.confidence)),
      ]);
    }
    case "llm": {
      return compactLines([
        labeled("model", asText(data.model)),
        labeled("input", summarizeValue(data.input ?? data.prompt)),
        labeled("output", summarizeValue(data.output ?? data.response)),
      ]);
    }
    case "answer": {
      const output = asText(data.output);
      return compactLines([labeled("độ dài", output ? `${output.length} ký tự` : ""), labeled("output", truncate(output, 220))]);
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
  const docs = asRecords(data.documents);
  if (docs.length) lines.push(`tài liệu trong ngữ cảnh: ${docs.length}`);
  return lines;
}

function retrievalHeaderLines(data: Record<string, unknown>): string[] {
  const keywords = asStringArray(data.keywords).filter(Boolean);
  const lines: string[] = [];
  if (keywords.length) lines.push(`từ khoá: ${keywords.join(", ")}`);
  const reformulated = asText(data.reformulated_query);
  if (reformulated) lines.push(`thử lại: ${reformulated}`);
  const tools = asStringArray(data.tools);
  if (tools.length) lines.push(`công cụ: ${tools.join(", ")}`);
  return lines;
}

function planLines(data: Record<string, unknown>): string[] {
  const steps = asRecords(data.steps);
  if (steps.length) {
    return steps.map((planStep) => {
      const title = asText(planStep.title) || ACTION_LABELS[asText(planStep.action)] || asText(planStep.action);
      return compactLines([
        title,
        labeled("action", ACTION_LABELS[asText(planStep.action)] ?? asText(planStep.action)),
        labeled("chi tiết", asText(planStep.detail) || asText(planStep.description)),
        labeled("mong đợi", asText(planStep.expected)),
      ]).join(" | ");
    });
  }
  const goal = asText(data.goal);
  return goal ? [goal] : [];
}

function evaluationLines(data: Record<string, unknown>): string[] {
  const after = (data.after_counts ?? {}) as Record<string, unknown>;
  const before = (data.before_counts ?? {}) as Record<string, unknown>;
  const docs = Number(after.documents) || 0;
  const web = Number(after.web_results) || 0;
  const pages = Number(after.web_pages) || 0;
  return compactLines([
    `giữ ${docs + web + pages} nguồn`,
    labeled("tài liệu", String(docs)),
    labeled("web", String(web)),
    labeled("trang đã đọc", String(pages)),
    labeled("trước đó", summarizeValue(before)),
    labeled("sau đó", summarizeValue(after)),
    labeled("lý do", asText(data.reason)),
    labeled("kết luận", asText(data.result) || asText(data.decision)),
  ]);
}

// Auto-layout bằng dagre: tính lại vị trí theo kích thước ước lượng của từng
// node (node đang bung sẽ to hơn) để không bao giờ đè nhau.
export function layoutFlowGraph(nodes: FlowNode[], edges: FlowEdge[], expandedNodeId: string | null): FlowNode[] {
  if (!nodes.length) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", nodesep: 96, ranksep: 110, marginx: 24, marginy: 24 });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const size = estimateNodeSize(node, node.id === expandedNodeId);
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
  const width = expanded ? EXPANDED_NODE_W : COLLAPSED_NODE_W;
  const charsPerLine = expanded ? 82 : 32;
  const shownDetails = expanded ? node.data.details : node.data.details.slice(0, 4);
  const hiddenCount = node.data.details.length - shownDetails.length;

  const titleHeight = wrappedLineCount(node.data.title, charsPerLine) * 18;
  const detailsHeight = shownDetails.reduce((sum, detail) => sum + wrappedLineCount(detail, charsPerLine) * 18, 0);
  const detailGaps = Math.max(0, shownDetails.length - 1) * 5;
  let height = 34 + titleHeight + detailsHeight + detailGaps;

  if (expanded && (node.data.summary || node.data.debug)) {
    const summaryHeight = node.data.summary ? wrappedLineCount(node.data.summary, charsPerLine) * 18 + 22 : 0;
    const debugHeight = node.data.debug ? wrappedLineCount(node.data.debug, charsPerLine + 26) * 15 + 32 : 0;
    height += Math.min(236, 16 + summaryHeight + debugHeight);
  } else if (!expanded && (hiddenCount > 0 || node.data.summary)) {
    height += 20;
  }

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

function domainOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function labeled(label: string, value: string): string {
  return value ? `${label}: ${value}` : "";
}

function compactLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return truncate(value, 220);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return truncate(JSON.stringify(value), 260);
  } catch {
    return "";
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function wrappedLineCount(value: string, charsPerLine: number): number {
  if (!value) return 1;
  return value
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
}

function stepDebug(step: AgentStep): string {
  return JSON.stringify(
    {
      id: step.id,
      position: step.position,
      kind: step.kind,
      title: step.title,
      summary: step.summary,
      data: step.data,
    },
    null,
    2
  );
}
