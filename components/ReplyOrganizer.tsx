"use client";

// 화면 전체 상태를 가진 부모. ① 입력 → ② 정리 결과 → ③ 초안을 이어 준다.
// Design Ref: §4.2 — 모든 값은 브라우저 메모리에만 둔다 (저장 안 함)
// 모듈 1 단계: 이메일 본문을 서버로 보내 AI 한 문장 답을 받아 보여 준다.

import { useState } from "react";
import InputPanel, { EMPTY_INPUT, type InputState } from "./InputPanel";
import { API_ERROR_MESSAGES, type ApiErrorBody } from "@/lib/api-errors";

export default function ReplyOrganizer() {
  const [input, setInput] = useState<InputState>(EMPTY_INPUT);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summarize = async () => {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailBody: input.emailBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as ApiErrorBody).error?.message ?? API_ERROR_MESSAGES.AI_FAILED);
        return;
      }
      setAnswer(data.answer);
    } catch {
      setError(API_ERROR_MESSAGES.NETWORK);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <InputPanel value={input} onChange={setInput} onSubmit={summarize} busy={busy} />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={summarize} disabled={busy} className="shrink-0 rounded-md border border-red-400 px-3 py-1 font-medium">
            다시 시도
          </button>
        </div>
      )}

      {answer && (
        <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-3 text-lg font-semibold">② 정리 결과 (연결 확인용)</h2>
          <p className="text-sm leading-relaxed">{answer}</p>
        </section>
      )}
    </div>
  );
}
