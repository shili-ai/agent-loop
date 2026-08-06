"use client";

import { Button, Input, Radio, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import type { ClarificationQuestion } from "../../lib/clarification";

const OTHER = "__other__";

type ClarificationFormProps = {
  questions: ClarificationQuestion[];
  disabled?: boolean;
  onSubmit: (text: string) => void;
};

export default function ClarificationForm({ questions, disabled, onSubmit }: ClarificationFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [others, setOthers] = useState<Record<string, string>>({});

  const keyOf = (question: ClarificationQuestion, index: number) => question.id ?? String(index);

  const resolve = (question: ClarificationQuestion, key: string) => {
    const raw = answers[key];
    if (question.type === "choice" && raw === OTHER) return (others[key] ?? "").trim();
    return (raw ?? "").trim();
  };

  const canSubmit = useMemo(
    () => questions.some((question, index) => resolve(question, keyOf(question, index)).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, answers, others]
  );

  const submit = () => {
    const lines = questions
      .map((question, index) => {
        const value = resolve(question, keyOf(question, index));
        return value ? `- ${question.question} ${value}` : null;
      })
      .filter((line): line is string => Boolean(line));

    if (!lines.length) return;
    onSubmit(`Bổ sung ngữ cảnh:\n${lines.join("\n")}`);
  };

  return (
    <div className="clarification-form">
      <Space direction="vertical" size={16} className="full-width">
        <Typography.Text strong>Trả lời nhanh để agent tiếp tục</Typography.Text>

        {questions.map((question, index) => {
          const key = keyOf(question, index);
          const isChoice = question.type === "choice" && (question.options?.length ?? 0) > 0;

          return (
            <div key={key} className="clarification-question">
              <Typography.Text>{question.question}</Typography.Text>

              {isChoice ? (
                <Space direction="vertical" size={6} className="full-width">
                  <Radio.Group
                    value={answers[key]}
                    onChange={(event) => setAnswers((prev) => ({ ...prev, [key]: event.target.value }))}
                  >
                    <Space direction="vertical" size={4}>
                      {question.options?.map((option) => (
                        <Radio key={option} value={option}>
                          {option}
                        </Radio>
                      ))}
                      <Radio value={OTHER}>Khác…</Radio>
                    </Space>
                  </Radio.Group>

                  {answers[key] === OTHER ? (
                    <Input
                      placeholder="Nhập câu trả lời khác"
                      value={others[key] ?? ""}
                      onChange={(event) => setOthers((prev) => ({ ...prev, [key]: event.target.value }))}
                    />
                  ) : null}
                </Space>
              ) : (
                <Input.TextArea
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="Nhập câu trả lời"
                  value={answers[key] ?? ""}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              )}
            </div>
          );
        })}

        <Button type="primary" disabled={disabled || !canSubmit} onClick={submit}>
          Gửi câu trả lời
        </Button>
      </Space>
    </div>
  );
}
