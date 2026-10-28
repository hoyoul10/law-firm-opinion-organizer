"use client";

// 화면 전체 상태를 가진 부모. ① 입력 → ② 정리 결과 → ③ 초안을 이어 준다.
// Design Ref: §4.2 — 모든 값은 브라우저 메모리에만 둔다 (저장 안 함)
// PLAN 9 단계: 이메일 본문을 문단으로 나눠 서버에 보내고, 사건 표시·쟁점·법무법인 의견을 보여 준다.
// 파일 글자 읽기는 PLAN 11·12에서 붙인다.

import { useState } from "react";
import InputPanel, { EMPTY_INPUT, type InputState } from "./InputPanel";
import CaseHeader from "./CaseHeader";
import IssuesAndOpinion from "./IssuesAndOpinion";
import { API_ERROR_MESSAGES, type ApiErrorBody } from "@/lib/api-errors";
import { splitEmailBody } from "@/lib/extract/email";
import type { ReplyInput, ReplySummary } from "@/lib/reply-types";

export default function ReplyOrganizer() {
  const [input, setInput] = useState<InputState>(EMPTY_INPUT);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReplySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summarize = async () => {
    const email = splitEmailBody(input.emailBody);
    if (!email) {
      setError("파일 읽기는 아직 준비 중이에요. 지금은 이메일 본문을 붙여넣어 주세요.");
      return;
    }
    const body: ReplyInput = {
      lawsuitType: input.lawsuitType,
      sources: [email],
      cancellationKnownDate: input.cancellationKnownDate || null,
    };

    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data as ApiErrorBody).error?.message ?? API_ERROR_MESSAGES.AI_FAILED);
        return;
      }
      setSummary(data.summary);
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

      {summary && (
        <section className="space-y-5 rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">② 정리 결과</h2>
          <CaseHeader summary={summary} />
          {summary.typeMismatchWarning && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              ⚠ {summary.typeMismatchWarning}
            </p>
          )}
          <IssuesAndOpinion summary={summary} />
        </section>
      )}
    </div>
  );
}
