// 화면·초안·HTML에서 함께 쓰는 표시 글

import { NEEDS_CHECK, type CaseIdentity, type DeadlineResult, type SourceLocation } from "./reply-types";

/** 사건 표시: 직접 입력 → 사건번호 → 채무자명·수익자명 */
export function caseLabel(identity: CaseIdentity): string {
  if (identity.manualLabel) return identity.manualLabel;
  const items: string[] = [];
  if (identity.caseNumber) items.push(`사건 ${identity.caseNumber}`);
  if (identity.debtorName) items.push(`채무자 ${identity.debtorName}`);
  if (!identity.caseNumber && identity.beneficiaryNames.length > 0) {
    items.push(`수익자 ${identity.beneficiaryNames.join(", ")}`);
  }
  return items.join(" · ");
}

/** 원문 위치 (Design Ref: §4.1 — PDF는 "쪽 + 문단", 그 외는 "문단") */
export function formatLocation(loc: SourceLocation): string {
  const parts = [loc.fileName];
  if (loc.page) parts.push(`${loc.page}쪽`);
  if (loc.paragraph) parts.push(`${loc.paragraph}문단`);
  return parts.join(" ");
}

/** 제척기간 한 줄 안내 */
export function deadlineMessage(r: DeadlineResult): string {
  if (r.level === "needs-check" || r.daysLeft === null) {
    return `${NEEDS_CHECK} 취소원인을 안 날과 법률행위 일자가 모두 있어야 남은 일수를 계산할 수 있어요`;
  }
  if (r.level === "expired") {
    const note = r.fiveYearOnly
      ? " — 취소원인을 안 날을 입력하지 않았지만 법률행위일 5년 기한이 이미 지났어요"
      : r.oneYearOnly
        ? " — 법률행위 일자는 없지만 취소원인을 안 날 1년 기한이 이미 지났어요"
        : "";
    // 0일이면 기한 마지막 날이 오늘이다 (지난 것이 아니라 오늘 안에 해야 한다)
    const when = r.daysLeft === 0 ? "오늘이 마지막 날" : `${Math.abs(r.daysLeft)}일 지남`;
    return `제척기간 경과 가능성 (기한 ${r.deadline}, ${when})${note}`;
  }
  if (r.level === "warning") return `기한이 ${r.daysLeft}일 남았어요 (${r.deadline})`;
  return `기한 ${r.deadline}까지 ${r.daysLeft}일 남았어요`;
}
