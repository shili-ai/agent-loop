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
      title="New chat"
      open={open}
      okText="Create"
      confirmLoading={creating}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ title: "New presales chat", industry: "software" }}
        onFinish={onCreate}
      >
        <Form.Item
          label="Title"
          name="title"
          rules={[{ required: true, message: "Nhap ten chat" }]}
        >
          <Input placeholder="VD: ACME CRM proposal" />
        </Form.Item>
        <Form.Item
          label="Industry"
          name="industry"
          rules={[{ required: true, message: "Nhap nganh" }]}
        >
          <Input placeholder="software" />
        </Form.Item>
        <Form.Item label="Customer" name="customer_name">
          <Input placeholder="VD: ACME" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
