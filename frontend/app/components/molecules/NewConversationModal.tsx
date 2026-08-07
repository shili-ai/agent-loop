import { Form, Input, Modal, Typography } from "antd";
import { useEffect } from "react";
import type { AgentProject, NewConversationInput } from "../../types/agent";

type NewConversationModalProps = {
  creating: boolean;
  open: boolean;
  project: AgentProject | null;
  onCancel: () => void;
  onCreate: (input: NewConversationInput) => void;
};

export default function NewConversationModal({
  creating,
  open,
  project,
  onCancel,
  onCreate,
}: NewConversationModalProps) {
  const [form] = Form.useForm<NewConversationInput>();

  useEffect(() => {
    if (!open) return;

    form.setFieldsValue({
      title: project?.customer_name ? `Chat với ${project.customer_name}` : "Chat mới",
      industry: project?.industry ?? "Phần mềm",
      customer_name: project?.customer_name ?? "",
    });
  }, [form, open, project]);

  return (
    <Modal
      title="Tạo chat trong project"
      open={open}
      okText="Tạo"
      confirmLoading={creating}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      {project ? (
        <Typography.Paragraph type="secondary">
          Chat mới sẽ dùng context chung từ <Typography.Text strong>{project.title}</Typography.Text>.
        </Typography.Paragraph>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        onFinish={onCreate}
      >
        <Form.Item
          label="Tên chat"
          name="title"
          rules={[{ required: true, message: "Nhập tên chat" }]}
        >
          <Input placeholder="VD: Proposal CRM cho ACME" />
        </Form.Item>
        <Form.Item
          label="Ngành"
          name="industry"
          rules={[{ required: true, message: "Nhập ngành" }]}
        >
          <Input placeholder="Phần mềm" />
        </Form.Item>
        <Form.Item label="Khách hàng" name="customer_name">
          <Input placeholder="VD: ACME" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
