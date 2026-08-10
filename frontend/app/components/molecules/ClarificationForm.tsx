"use client";

import { CloseOutlined, EditOutlined, EnterOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { ClarificationQuestion } from "../../lib/clarification";

type ClarificationFormProps = {
  questions: ClarificationQuestion[];
  disabled?: boolean;
  onSubmit: (text: string) => void;
};

type Collected = { question: string; answer: string };

export default function ClarificationForm({ questions, disabled, onSubmit }: ClarificationFormProps) {
  const [index, setIndex] = useState(0);
  const [collected, setCollected] = useState<Collected[]>([]);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");
  const submittedRef = useRef(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  const current = questions[index];
  const options = current?.type === "choice" ? current.options ?? [] : [];
  const total = questions.length;

  useEffect(() => {
    if (customMode) customInputRef.current?.focus();
  }, [customMode]);

  if (!current) return null;

  function finish(all: Collected[]) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const lines = all.filter((item) => item.answer.trim()).map((item) => `- ${item.question} ${item.answer.trim()}`);
    onSubmit(lines.length ? `Bổ sung ngữ cảnh:\n${lines.join("\n")}` : "Cứ tiếp tục với thông tin hiện có.");
  }

  function answer(value: string) {
    const next = [...collected, { question: current.question, answer: value }];
    if (index + 1 < total) {
      setCollected(next);
      setIndex((value2) => value2 + 1);
      setCustomMode(false);
      setCustomText("");
    } else {
      finish(next);
    }
  }

  function submitCustom() {
    const value = customText.trim();
    if (!value) return;
    answer(value);
  }

  return (
    <div className="clarify-card" onKeyDown={(event) => {
      if (customMode) return;
      const digit = Number(event.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= options.length) {
        event.preventDefault();
        answer(options[digit - 1]);
      }
    }} tabIndex={-1}>
      <div className="clarify-head">
        <span className="clarify-question">{current.question}</span>
        <div className="clarify-head-meta">
          {total > 1 ? <span className="clarify-progress">{index + 1}/{total}</span> : null}
          <button type="button" className="clarify-close" onClick={() => finish(collected)} aria-label="Bỏ qua">
            <CloseOutlined />
          </button>
        </div>
      </div>

      <div className="clarify-options">
        {options.map((option, optionIndex) => (
          <button
            type="button"
            key={option}
            className="clarify-option"
            disabled={disabled}
            onClick={() => answer(option)}
          >
            <span className="clarify-num">{optionIndex + 1}</span>
            <span className="clarify-option-label">{option}</span>
            <EnterOutlined className="clarify-enter" />
          </button>
        ))}

        <div className={customMode ? "clarify-option clarify-other editing" : "clarify-option clarify-other"}>
          <span className="clarify-num">
            <EditOutlined />
          </span>
          {customMode ? (
            <input
              ref={customInputRef}
              className="clarify-custom-input"
              placeholder="Nhập câu trả lời của bạn…"
              value={customText}
              disabled={disabled}
              onChange={(event) => setCustomText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitCustom();
                }
              }}
            />
          ) : (
            <button type="button" className="clarify-other-label" onClick={() => setCustomMode(true)}>
              Câu trả lời khác
            </button>
          )}
          <button type="button" className="clarify-skip" onClick={() => answer("")}>
            Bỏ qua
          </button>
        </div>
      </div>
    </div>
  );
}
