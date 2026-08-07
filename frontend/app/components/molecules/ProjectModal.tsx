"use client";

import { Form, Input, Modal } from "antd";
import { useEffect } from "react";
import type { AgentProject, NewProjectInput } from "../../types/agent";

type ProjectModalMode = "create" | "edit";

type ProjectModalProps = {
  mode: ProjectModalMode;
  open: boolean;
  project: AgentProject | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: NewProjectInput) => void;
};

export default function ProjectModal({
  mode,
  open,
  project,
  saving,
  onCancel,
  onSubmit,
}: ProjectModalProps) {
  const [form] = Form.useForm<NewProjectInput>();

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      title: mode === "edit" ? project?.title ?? "" : "Project presales mới",
      industry: mode === "edit" ? project?.industry ?? "Phần mềm" : "Phần mềm",
      customer_name: mode === "edit" ? project?.customer_name ?? "" : "",
      description: mode === "edit" ? project?.description ?? "" : "",
      shared_context: mode === "edit" ? project?.shared_context ?? "" : "",
    });
  }, [form, mode, open, project]);

  return (
    <Modal
      title={mode === "edit" ? "Sửa project context" : "Tạo project mới"}
      open={open}
      okText={mode === "edit" ? "Lưu" : "Tạo"}
      confirmLoading={saving}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="title" label="Tên project" rules={[{ required: true, message: "Nhập tên project" }]}>
          <Input placeholder="VD: ACME CRM rollout" />
        </Form.Item>
        <Form.Item name="industry" label="Ngành" rules={[{ required: true, message: "Nhập ngành" }]}>
          <Input placeholder="Phần mềm" />
        </Form.Item>
        <Form.Item name="customer_name" label="Khách hàng">
          <Input placeholder="VD: ACME" />
        </Form.Item>
        <Form.Item name="description" label="Mô tả">
          <Input placeholder="Mục tiêu, phạm vi, team phụ trách..." />
        </Form.Item>
        <Form.Item name="shared_context" label="Context dùng chung">
          <Input.TextArea
            autoSize={{ minRows: 8, maxRows: 14 }}
            placeholder="Sản phẩm, ICP, pricing, positioning, tài liệu, nguyên tắc trả lời..."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
