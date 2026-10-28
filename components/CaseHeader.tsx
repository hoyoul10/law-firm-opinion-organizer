"use client";

// ② 사건 표시 줄: 사건번호 → 없으면 채무자명·수익자명 → 셋 다 없으면 담당자 입력 (Design Ref: §3.1)
// 입력한 값은 정리 결과의 identity.manualLabel에 들어가 초안·HTML에도 그대로 쓴다

import { useState } from "react";
import { caseLabel } from "@/lib/labels";
import type { ReplySummary } from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

interface Props {
  summary: ReplySummary;
  onManualLabel: (label: string | null) => void;
}

export default function CaseHeader({ summary, onManualLabel }: Props) {
  const { identity, firmName } = summary;
  const [draft, setDraft] = useState("");

  if (identity.needsUserInput && !identity.manualLabel) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        <p className="mb-2 font-medium text-amber-800 dark:text-amber-200">
          ⚠ 회신에서 사건번호·채무자명·수익자명을 찾지 못했어요. 이 회신이 어느 사건인지 직접 적어 주세요.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onManualLabel(draft.trim());
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="예: 2026-사해-0140 또는 채무자 홍길동"
            aria-label="사건 표시 직접 입력"
            className="min-w-60 flex-1 rounded border border-black/15 bg-white px-3 py-1.5 dark:border-white/20 dark:bg-zinc-900"
          />
          <button type="submit" className="rounded bg-amber-700 px-3 py-1.5 font-medium text-white">
            사건 표시 정하기
          </button>
        </form>
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">사건 표시를 정해야 초안을 만들 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
      <span className="font-semibold">{[caseLabel(identity), firmName].filter(Boolean).join(" · ")}</span>
      {identity.manualLabel ? (
        <>
          <span className="text-xs text-zinc-500">(담당자 직접 입력)</span>
          <button type="button" className="text-xs text-zinc-500 underline" onClick={() => onManualLabel(null)}>
            다시 입력
          </button>
        </>
      ) : (
        <SourceBadge sources={identity.sources} />
      )}
    </div>
  );
}
