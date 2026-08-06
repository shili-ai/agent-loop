import { Form, Input, Modal } from "antd";
import type { NewConversationInput } from "../../types/agent";

type NewConversationModalProps = {
  creating: boolean;
  open: boolean;
  onCancel: () => void;
  onCreate: (input: NewConversationInput) => void;
};

export default function NewConversationModal({
  creating,
  open,
  onCancel,
  onCreate,
}: NewConversationModalProps) {
  const [form] = Form.useForm<NewConversationInput>();

  return (
    <Modal
      title="Tạo chat mới"
      open={open}
      okText="Tạo"
      confirmLoading={creating}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ title: "Chat presales mới", industry: "Phần mềm" }}
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
