// ② 사건 표시 줄: 사건번호 → 없으면 채무자명·수익자명 (Design Ref: §3.1)
// 셋 다 없을 때 담당자 입력 칸은 PLAN 14에서 붙인다

import type { ReplySummary } from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

export default function CaseHeader({ summary }: { summary: ReplySummary }) {
  const { identity, firmName } = summary;
  const items: string[] = [];
  if (identity.caseNumber) items.push(`사건 ${identity.caseNumber}`);
  if (identity.debtorName) items.push(`채무자 ${identity.debtorName}`);
  if (!identity.caseNumber && identity.beneficiaryNames.length > 0) {
    items.push(`수익자 ${identity.beneficiaryNames.join(", ")}`);
  }
  if (firmName) items.push(firmName);

  return (
    <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800">
      {identity.needsUserInput ? (
        <span className="font-medium text-amber-700 dark:text-amber-400">
          ⚠ 회신에서 사건번호·채무자명·수익자명을 찾지 못했어요
        </span>
      ) : (
        <span className="font-semibold">{items.join(" · ")}</span>
      )}
      <SourceBadge sources={identity.sources} />
    </div>
  );
}
