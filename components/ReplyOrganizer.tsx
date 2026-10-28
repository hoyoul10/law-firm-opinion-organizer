"use client";

// 화면 전체 상태를 가진 부모. ① 입력 → ② 정리 결과 → ③ 초안을 이어 준다.
// Design Ref: §4.2 — 모든 값은 브라우저 메모리에만 둔다 (저장 안 함)

import { useMemo, useState, useSyncExternalStore } from "react";
import InputPanel, { EMPTY_INPUT, type InputState } from "./InputPanel";
import CaseHeader from "./CaseHeader";
import ChecklistTable from "./ChecklistTable";
import DeadlineTable from "./DeadlineTable";
import Glossary from "./Glossary";
import IssuesAndOpinion from "./IssuesAndOpinion";
import { computeDeadlines } from "@/lib/deadline";
import { API_ERROR_MESSAGES, type ApiErrorBody } from "@/lib/api-errors";
import { splitEmailBody } from "@/lib/extract/email";
import { getToday } from "@/lib/today";
import type { ExtractedSource, ReplyInput, ReplySummary } from "@/lib/reply-types";

const noSubscribe = () => () => {};

/** 화면 입력을 서버로 보낼 원문 목록으로 바꾼다 (파일 순서 → 이메일 본문) */
function collectSources(input: InputState): ExtractedSource[] {
  const sources = input.files.flatMap((f) => (f.result?.ok ? [f.result.source] : []));
  const email = splitEmailBody(input.emailBody, input.emailRound);
  return email ? [...sources, email] : sources;
}

export default function ReplyOrganizer() {
  const [input, setInput] = useState<InputState>(EMPTY_INPUT);
  // 서버에서 미리 그릴 때는 비워 두고, 브라우저에서 한국 시간 오늘을 읽는다
  const today = useSyncExternalStore(noSubscribe, getToday, () => "");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReplySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 제척기간은 AI가 아니라 코드로, 안 날을 바꾸면 바로 다시 계산한다. "기타" 유형은 계산하지 않는다
  const deadlines = useMemo(
    () =>
      summary && summary.lawsuitType === "fraudulent-transfer" && today
        ? computeDeadlines(summary.disposals, input.cancellationKnownDate || null, today)
        : null,
    [summary, input.cancellationKnownDate, today],
  );

  const summarize = async () => {
    const body: ReplyInput = {
      lawsuitType: input.lawsuitType,
      sources: collectSources(input),
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
      <InputPanel value={input} setValue={setInput} onSubmit={summarize} busy={busy} today={today} />

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={summarize} disabled={busy} className="shrink-0 rounded-md border border-red-400 px-3 py-1 font-medium">
            다시 시도
          </button>
        </div>
      )}

      {summary && (
        <section className="space-y-6 rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold">② 정리 결과</h2>
          <CaseHeader
            summary={summary}
            onManualLabel={(manualLabel) =>
              setSummary((prev) => (prev ? { ...prev, identity: { ...prev.identity, manualLabel } } : prev))
            }
          />
          {summary.typeMismatchWarning && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              ⚠ {summary.typeMismatchWarning} (고른 소송 유형은 바꾸지 않았어요)
            </p>
          )}
          {deadlines && <DeadlineTable deadlines={deadlines} disposals={summary.disposals} />}
          {summary.checklist && <ChecklistTable checklist={summary.checklist} />}
          <IssuesAndOpinion summary={summary} />
          <Glossary glossary={summary.glossary} />
        </section>
      )}
    </div>
  );
}
