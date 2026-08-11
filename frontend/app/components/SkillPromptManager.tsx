"use client";

import { PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Empty, Input, Segmented, Space, Switch, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSkill, listSkills, listSystemPrompts, updateSkill } from "../lib/agentApi";
import type { AgentSkill, AgentSkillInput, AgentSystemPrompt } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import { ProjectPageFrame } from "./ProjectDirectory";

type PromptKey = "analysis" | "decider" | "answer" | "clarification";

type SkillFormState = {
  key: string;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  analysis_prompt: string;
  decider_prompt: string;
  answer_prompt: string;
  clarification_prompt: string;
  tool_policy: string;
};

const EMPTY_FORM: SkillFormState = {
  key: "",
  name: "",
  description: "",
  priority: 50,
  enabled: true,
  analysis_prompt: "",
  decider_prompt: "",
  answer_prompt: "",
  clarification_prompt: "",
  tool_policy: "{\n  \"preferred_tools\": [],\n  \"constraints\": []\n}",
};

const PROMPT_TABS: Array<{ label: string; value: PromptKey }> = [
  { label: "Phân tích", value: "analysis" },
  { label: "Chọn action", value: "decider" },
  { label: "Trả lời", value: "answer" },
  { label: "Hỏi làm rõ", value: "clarification" },
];

export default function SkillPromptManager() {
  const [activePrompt, setActivePrompt] = useState<PromptKey>("analysis");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState<SkillFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [managerView, setManagerView] = useState<"skills" | "system">("skills");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [systemPromptQuery, setSystemPromptQuery] = useState("");
  const [systemPromptMode, setSystemPromptMode] = useState<"composed" | "base">("composed");
  const [systemPrompts, setSystemPrompts] = useState<AgentSystemPrompt[]>([]);
  const [systemPromptKey, setSystemPromptKey] = useState<PromptKey>("analysis");

  const selectSkill = useCallback((skill: AgentSkill) => {
    setSelectedId(skill.id);
    setForm(formFromSkill(skill));
    setActivePrompt("analysis");
    setError(null);
  }, []);

  const reloadCatalog = useCallback(async (selectId?: number) => {
    setLoading(true);
    setError(null);

    try {
      const [loadedSkills, loadedSystemPrompts] = await Promise.all([listSkills(), listSystemPrompts()]);
      setSkills(loadedSkills);
      setSystemPrompts(loadedSystemPrompts);
      const next = selectId ? loadedSkills.find((skill) => skill.id === selectId) : loadedSkills[0];
      if (next) selectSkill(next);
      if (loadedSystemPrompts[0] && !loadedSystemPrompts.some((prompt) => prompt.key === systemPromptKey)) {
        setSystemPromptKey(loadedSystemPrompts[0].key);
      }
    } catch {
      setError("Không tải được danh sách skill/prompt. Kiểm tra Rails API.");
    } finally {
      setLoading(false);
    }
  }, [selectSkill, systemPromptKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSkills() {
      try {
        const [loadedSkills, loadedSystemPrompts] = await Promise.all([listSkills(), listSystemPrompts()]);
        if (cancelled) return;
        setSkills(loadedSkills);
        setSystemPrompts(loadedSystemPrompts);
        if (loadedSystemPrompts[0]) setSystemPromptKey(loadedSystemPrompts[0].key);
        if (loadedSkills[0]) selectSkill(loadedSkills[0]);
      } catch {
        if (!cancelled) setError("Không tải được danh sách skill. Kiểm tra Rails API.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialSkills();
    return () => {
      cancelled = true;
    };
  }, [selectSkill]);

  function startNewSkill() {
    setSelectedId("new");
    setForm({ ...EMPTY_FORM });
    setActivePrompt("analysis");
    setError(null);
  }

  const filteredSkills = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return skills.filter((skill) => {
      const matchesText = [skill.name, skill.key, skill.description].some((value) =>
        value?.toLowerCase().includes(keyword)
      );
      const matchesFilter =
        filter === "all" ||
        (filter === "enabled" && skill.enabled) ||
        (filter === "disabled" && !skill.enabled) ||
        skill.scope === filter;
      return matchesText && matchesFilter;
    });
  }, [filter, query, skills]);

  async function handleSave() {
    const payload = buildPayload(form);
    if (!payload) return;

    setSaving(true);
    setError(null);

    try {
      const saved = selectedId === "new" || selectedId === null ? await createSkill(payload) : await updateSkill(selectedId, payload);
      await reloadCatalog(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Không lưu được skill.");
    } finally {
      setSaving(false);
    }
  }

  function buildPayload(state: SkillFormState): AgentSkillInput | null {
    let toolPolicy: Record<string, unknown>;
    try {
      toolPolicy = JSON.parse(state.tool_policy || "{}") as Record<string, unknown>;
    } catch {
      setError("Tool policy phải là JSON hợp lệ.");
      return null;
    }

    if (!state.key.trim() || !state.name.trim()) {
      setError("Key và tên skill là bắt buộc.");
      return null;
    }

    return {
      key: state.key.trim(),
      name: state.name.trim(),
      description: state.description.trim(),
      priority: Number.isFinite(state.priority) ? state.priority : 50,
      enabled: state.enabled,
      analysis_prompt: state.analysis_prompt,
      decider_prompt: state.decider_prompt,
      answer_prompt: state.answer_prompt,
      clarification_prompt: state.clarification_prompt,
      tool_policy: toolPolicy,
    };
  }

  const selectedSkill = selectedId === "new" ? null : skills.find((skill) => skill.id === selectedId) ?? null;
  const promptField = `${activePrompt}_prompt` as const;

  return (
    <ProjectPageFrame>
      <div className="skill-page">
        <div className="skill-page-header">
          <div className="skill-page-heading">
            <Typography.Title level={2} className="skill-page-title">
              Skills & Prompts
            </Typography.Title>
            <div className="skill-view-switch" role="tablist" aria-label="Chế độ quản lý prompt">
              <button
                className={managerView === "skills" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={managerView === "skills"}
                onClick={() => setManagerView("skills")}
              >
                Skills
              </button>
              <button
                className={managerView === "system" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={managerView === "system"}
                onClick={() => setManagerView("system")}
              >
                System Prompt
              </button>
            </div>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => reloadCatalog(selectedId === "new" ? undefined : selectedId ?? undefined)}>
              Làm mới
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={startNewSkill}>
              Skill mới
            </Button>
          </Space>
        </div>

        {error ? <ErrorNotice message={error} /> : null}

        {managerView === "system" ? (
          <SystemPromptViewer
            mode={systemPromptMode}
            prompts={systemPrompts}
            query={systemPromptQuery}
            selectedKey={systemPromptKey}
            onChangeMode={setSystemPromptMode}
            onChangeQuery={setSystemPromptQuery}
            onSelect={setSystemPromptKey}
          />
        ) : (
          <div className="skill-manager">
            <aside className="skill-manager-list">
              <div className="skill-manager-toolbar">
                <Input.Search
                  allowClear
                  placeholder="Tìm skill hoặc prompt"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Segmented
                  block
                  size="small"
                  value={filter}
                  options={[
                    { label: "Tất cả", value: "all" },
                    { label: "Bật", value: "enabled" },
                    { label: "Tắt", value: "disabled" },
                    { label: "System", value: "system" },
                  ]}
                  onChange={(value) => setFilter(String(value))}
                />
              </div>

            <div className="skill-manager-items">
              {loading ? (
                <div className="skill-manager-empty">Đang tải skill...</div>
              ) : filteredSkills.length ? (
                filteredSkills.map((skill) => (
                  <button
                    className={`skill-manager-item ${skill.id === selectedId ? "active" : ""}`}
                    key={skill.id}
                    type="button"
                    onClick={() => selectSkill(skill)}
                  >
                    <span className="skill-manager-item-title">{skill.name}</span>
                    <span className="skill-manager-item-meta">
                      {skill.key} · {skill.scope || "system"} · priority {skill.priority}
                    </span>
                  </button>
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có skill phù hợp" />
              )}
            </div>
          </aside>

          <section className="skill-manager-editor">
            {selectedId ? (
              <>
                <div className="skill-editor-head">
                  <div>
                    <Typography.Text className="project-page-eyebrow">
                      {selectedSkill ? `${selectedSkill.scope || "system"} skill` : "custom skill"}
                    </Typography.Text>
                    <Typography.Title level={3} className="skill-editor-title">
                      {selectedId === "new" ? "Tạo skill mới" : form.name || "Skill"}
                    </Typography.Title>
                  </div>
                  <Space>
                    <span className="skill-enabled-label">Bật</span>
                    <Switch checked={form.enabled} onChange={(checked) => setFormValue("enabled", checked)} />
                    <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
                      Lưu
                    </Button>
                  </Space>
                </div>

                <div className="skill-editor-grid">
                  <label className="skill-field">
                    <span>Key</span>
                    <Input value={form.key} onChange={(event) => setFormValue("key", event.target.value)} />
                  </label>
                  <label className="skill-field">
                    <span>Tên skill</span>
                    <Input value={form.name} onChange={(event) => setFormValue("name", event.target.value)} />
                  </label>
                  <label className="skill-field">
                    <span>Priority</span>
                    <Input
                      type="number"
                      value={form.priority}
                      onChange={(event) => setFormValue("priority", Number(event.target.value))}
                    />
                  </label>
                </div>

                <label className="skill-field">
                  <span>Mô tả</span>
                  <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    value={form.description}
                    onChange={(event) => setFormValue("description", event.target.value)}
                  />
                </label>

                <div className="skill-prompt-row">
                  <Segmented
                    value={activePrompt}
                    options={PROMPT_TABS}
                    onChange={(value) => setActivePrompt(value as PromptKey)}
                  />
                </div>
                <label className="skill-field">
                  <span>{PROMPT_TABS.find((tab) => tab.value === activePrompt)?.label}</span>
                  <Input.TextArea
                    className="skill-prompt-textarea"
                    value={form[promptField]}
                    onChange={(event) => setFormValue(promptField, event.target.value)}
                  />
                </label>

                <label className="skill-field">
                  <span>Tool policy JSON</span>
                  <Input.TextArea
                    className="skill-policy-textarea"
                    value={form.tool_policy}
                    onChange={(event) => setFormValue("tool_policy", event.target.value)}
                  />
                </label>
              </>
            ) : (
              <Empty description="Chọn một skill để xem prompt" />
            )}
            </section>
          </div>
        )}
      </div>
    </ProjectPageFrame>
  );

  function setFormValue<Key extends keyof SkillFormState>(key: Key, value: SkillFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function SystemPromptViewer({
  mode,
  prompts,
  query,
  selectedKey,
  onChangeMode,
  onChangeQuery,
  onSelect,
}: {
  mode: "composed" | "base";
  prompts: AgentSystemPrompt[];
  query: string;
  selectedKey: PromptKey;
  onChangeMode: (mode: "composed" | "base") => void;
  onChangeQuery: (query: string) => void;
  onSelect: (key: PromptKey) => void;
}) {
  const keyword = query.trim().toLowerCase();
  const filteredPrompts = prompts.filter((prompt) =>
    [prompt.key, prompt.label, prompt.base_system, prompt.composed_system].some((value) =>
      value.toLowerCase().includes(keyword)
    )
  );
  const selected = filteredPrompts.find((prompt) => prompt.key === selectedKey) ?? filteredPrompts[0] ?? prompts[0];
  const activeSkills = selected?.layers.active_skills ?? [];

  return (
    <div className="system-prompt-manager">
      <aside className="system-prompt-list">
        <div className="system-prompt-toolbar">
          <Input.Search
            allowClear
            placeholder="Tìm system prompt"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
          />
        </div>
        {filteredPrompts.length ? (
          filteredPrompts.map((prompt) => (
            <button
              className={`system-prompt-item ${prompt.key === selected?.key ? "active" : ""}`}
              key={prompt.key}
              type="button"
              onClick={() => onSelect(prompt.key)}
            >
              <span className="system-prompt-item-title">{prompt.label}</span>
              <span className="system-prompt-item-meta">{prompt.key}</span>
            </button>
          ))
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có prompt phù hợp" />
        )}
      </aside>

      <section className="system-prompt-preview">
        {selected ? (
          <>
            <div className="skill-editor-head">
              <div>
                <Typography.Text className="project-page-eyebrow">System prompt</Typography.Text>
                <Typography.Title level={3} className="skill-editor-title">
                  {selected.label}
                </Typography.Title>
              </div>
              <Segmented
                value={mode}
                options={[
                  { label: "Đã compose", value: "composed" },
                  { label: "Base", value: "base" },
                ]}
                onChange={(value) => onChangeMode(value as "composed" | "base")}
              />
            </div>

            <div className="system-prompt-layer-row">
              <span>Skills: {activeSkills.length ? activeSkills.map((skill) => `${skill.name} (${skill.scope || "system"})`).join(", ") : "không có"}</span>
              <span>Project prompt: {selected.layers.has_project_prompt ? "có" : "không"}</span>
              <span>Chat prompt: {selected.layers.has_chat_prompt ? "có" : "không"}</span>
            </div>

            <pre className="system-prompt-code">{mode === "composed" ? selected.composed_system : selected.base_system}</pre>
          </>
        ) : (
          <Empty description="Không tải được system prompt" />
        )}
      </section>
    </div>
  );
}

function formFromSkill(skill: AgentSkill): SkillFormState {
  return {
    key: skill.key,
    name: skill.name,
    description: skill.description ?? "",
    priority: skill.priority,
    enabled: skill.enabled,
    analysis_prompt: skill.prompts?.analysis ?? "",
    decider_prompt: skill.prompts?.decider ?? "",
    answer_prompt: skill.prompts?.answer ?? "",
    clarification_prompt: skill.prompts?.clarification ?? "",
    tool_policy: JSON.stringify(skill.tool_policy ?? {}, null, 2),
  };
}
