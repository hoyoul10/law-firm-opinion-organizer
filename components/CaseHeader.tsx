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
      <div className="notice notice-warn">
        <p className="mb-3 font-bold">
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
            className="input min-w-60 flex-1"
          />
          <button type="submit" className="btn btn-primary">
            사건 표시 정하기
          </button>
        </form>
        <p className="mt-2 text-sm">사건 표시를 정해야 초안을 만들 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand)] bg-[var(--brand-tint)] px-5 py-4 text-lg">
      <span className="font-bold text-[var(--brand-strong)]">{[caseLabel(identity), firmName].filter(Boolean).join(" · ")}</span>
      {identity.manualLabel ? (
        <>
          <span className="text-sm muted">(담당자 직접 입력)</span>
          <button type="button" className="btn-link" onClick={() => onManualLabel(null)}>
            다시 입력
          </button>
        </>
      ) : (
        <SourceBadge sources={identity.sources} />
      )}
    </div>
  );
}
