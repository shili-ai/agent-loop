"use client";

import {
  CheckCircleOutlined,
  CloudOutlined,
  DisconnectOutlined,
  LoginOutlined,
  ReloadOutlined,
  SaveOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Button, Spin, Switch, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  listConnectors,
  testConnector,
  updateConnector,
} from "../lib/agentApi";
import type { AgentConnector } from "../types/agent";
import ErrorNotice from "./atoms/ErrorNotice";
import { ProjectPageFrame } from "./ProjectDirectory";

export default function ConnectorManager() {
  const [connectors, setConnectors] = useState<AgentConnector[]>([]);
  const [selectedKey, setSelectedKey] = useState("google_drive");
  const [draft, setDraft] = useState({ enabled: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => connectors.find((connector) => connector.key === selectedKey) ?? connectors[0] ?? null,
    [connectors, selectedKey]
  );

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setNotice("Google Drive đã kết nối trên trình duyệt. Agent sẽ search trực tiếp qua Drive API khi cần.");
    if (params.get("error")) setError(params.get("error"));
  }, []);

  useEffect(() => {
    if (!selected) return;

    setDraft({
      enabled: selected.enabled,
    });
  }, [selected]);

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const items = await listConnectors();
      setConnectors(items);
      if (items[0] && !items.some((item) => item.key === selectedKey)) setSelectedKey(items[0].key);
    } catch {
      setError("Không tải được danh sách connector. Kiểm tra Rails API.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!selected) return;

    setSaving(true);
    setError(null);

    try {
      const updated = await updateConnector(selected.key, draft);
      replaceConnector(updated);
    } catch {
      setError("Không lưu được cấu hình connector.");
    } finally {
      setSaving(false);
    }
  }

  async function connectInBrowser() {
    setConnecting(true);
    setError(null);
    setNotice(null);

    try {
      const { auth_url } = await connectGoogleDrive();
      window.location.href = auth_url;
    } catch {
      setError("Không tạo được link kết nối Google Drive. Kiểm tra GOOGLE_DRIVE_CLIENT_ID và GOOGLE_DRIVE_CLIENT_SECRET.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectDrive() {
    setDisconnecting(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await disconnectGoogleDrive();
      replaceConnector(updated);
      setNotice("Đã ngắt kết nối Google Drive trên máy local.");
    } catch {
      setError("Không ngắt được Google Drive.");
    } finally {
      setDisconnecting(false);
    }
  }

  async function test() {
    if (!selected) return;

    setTesting(true);
    setError(null);

    try {
      const updated = await testConnector(selected.key);
      replaceConnector(updated);
    } catch {
      setError("Không test được connector.");
    } finally {
      setTesting(false);
    }
  }

  function replaceConnector(updated: AgentConnector) {
    setConnectors((items) => items.map((item) => (item.key === updated.key ? updated : item)));
  }

  return (
    <ProjectPageFrame>
      <div className="connector-page">
        <div className="connector-header">
          <div className="connector-title-row">
            <CloudOutlined className="connector-title-icon" />
            <Typography.Title level={2} className="project-page-title">
              Connectors
            </Typography.Title>
          </div>
          <Button icon={<ReloadOutlined />} onClick={load}>
            Làm mới
          </Button>
        </div>

        {error ? <ErrorNotice message={error} /> : null}
        {notice ? <div className="connector-success">{notice}</div> : null}

        {loading ? (
          <div className="project-page-loading">
            <Spin />
          </div>
        ) : selected ? (
          <div className="connector-shell">
            <aside className="connector-list" aria-label="Danh sách connector">
              {connectors.map((connector) => (
                <button
                  type="button"
                  className={connector.key === selected.key ? "connector-list-item active" : "connector-list-item"}
                  key={connector.key}
                  onClick={() => setSelectedKey(connector.key)}
                >
                  <span className="connector-list-icon">
                    <CloudOutlined />
                  </span>
                  <span className="connector-list-copy">
                    <span className="connector-list-title">{connector.name}</span>
                    <span className="connector-list-meta">{statusLabel(connector)}</span>
                  </span>
                </button>
              ))}
            </aside>

            <section className="connector-detail">
              <div className="connector-detail-head">
                <div>
                  <div className="connector-eyebrow">Drive connector</div>
                  <Typography.Title level={3} className="connector-detail-title">
                    {selected.name}
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" className="connector-description">
                    {selected.description}
                  </Typography.Paragraph>
                </div>
                <StatusPill connector={selected} />
              </div>

              <div className="connector-form">
                <div className="connector-oauth-panel">
                  <div>
                    <div className="connector-oauth-title">Kết nối trên trình duyệt</div>
                    <div className="connector-oauth-copy">
                      {selected.auth_url_available
                        ? "OAuth đã sẵn sàng. Bấm kết nối để cấp quyền Drive readonly. Agent sẽ search trực tiếp qua Drive API."
                        : "Cần cấu hình GOOGLE_DRIVE_CLIENT_ID và GOOGLE_DRIVE_CLIENT_SECRET ở Rails env trước."}
                    </div>
                  </div>
                  <div className="connector-oauth-actions">
                    <Button
                      type="primary"
                      icon={<LoginOutlined />}
                      loading={connecting}
                      disabled={!selected.auth_url_available}
                      onClick={connectInBrowser}
                    >
                      Kết nối Google Drive
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      loading={testing}
                      disabled={!selected.browser_connected}
                      onClick={test}
                    >
                      Test search
                    </Button>
                    <Button
                      icon={<DisconnectOutlined />}
                      loading={disconnecting}
                      disabled={!selected.browser_connected}
                      onClick={disconnectDrive}
                    >
                      Ngắt
                    </Button>
                  </div>
                </div>

                <label className="connector-field compact">
                  <span>Bật connector</span>
                  <Switch
                    checked={draft.enabled}
                    onChange={(checked) => setDraft((value) => ({ ...value, enabled: checked }))}
                  />
                </label>
              </div>

              <div className="connector-actions">
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                  Lưu cấu hình
                </Button>
              </div>

              <div className="connector-status-panel">
                <div className="connector-status-row">
                  <span>Tài liệu đọc được</span>
                  <strong>{selected.document_count ?? 0}</strong>
                </div>
                <div className="connector-status-row">
                  <span>Trình duyệt</span>
                  <strong>{selected.browser_connected ? "Đã cấp quyền" : "Chưa kết nối"}</strong>
                </div>
                <div className="connector-status-row">
                  <span>Lần kiểm tra gần nhất</span>
                  <strong>{formatDateTime(selected.last_checked_at)}</strong>
                </div>
                <div className="connector-message">{selected.message || "Chưa có thông tin kiểm tra."}</div>
              </div>

              <div className="connector-note">
                <strong>Cách dùng:</strong> bấm kết nối Google Drive trên trình duyệt và cấp quyền readonly.
                Khi chat, agent sẽ tìm song song tài liệu upload, project documents và Google Drive API live search.
              </div>
            </section>
          </div>
        ) : (
          <div className="connector-empty">Chưa có connector nào.</div>
        )}
      </div>
    </ProjectPageFrame>
  );
}

function StatusPill({ connector }: { connector: AgentConnector }) {
  const connected = connector.status === "connected";
  return (
    <span className={connected ? "connector-status-pill connected" : "connector-status-pill"}>
      {connected ? <CheckCircleOutlined /> : <WarningOutlined />}
      {statusLabel(connector)}
    </span>
  );
}

function statusLabel(connector: AgentConnector) {
  if (!connector.enabled || connector.status === "disabled") return "Đang tắt";
  if (connector.status === "connected") return "Đã kết nối";
  if (connector.status === "missing_auth") return "Chưa cấp quyền";
  if (connector.status === "connection_error") return "Lỗi kết nối";
  return "Chưa cấu hình";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa kiểm tra";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa kiểm tra";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
