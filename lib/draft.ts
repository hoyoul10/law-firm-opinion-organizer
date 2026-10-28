// 초안 8항목을 화면·HTML에 같은 순서로 펼치는 도우미 (Design Ref: §3.1 ③ 초안)

import { DRAFT_SECTIONS, NEEDS_CHECK, type Disposal, type LawsuitDraft } from "./reply-types";

/** 초안의 글 칸 하나. path로 어느 칸인지 가리켜 고칠 수 있다 */
export interface DraftField {
  path: { key: Exclude<keyof LawsuitDraft, "perBeneficiary"> } | { index: number; key: "beneficiaryAndProperty" | "fraudulentAct" | "claimDraft" };
  label?: string;
  text: string;
}

export interface DraftSectionView {
  no: number;
  title: string;
  fields: DraftField[];
}

function beneficiaryLabel(disposals: Disposal[], disposalId: string, index: number): string {
  const d = disposals.find((x) => x.id === disposalId);
  return d ? `수익자 ${index + 1}: ${d.beneficiary}` : `수익자 ${index + 1}`;
}

/** 8항목 순서대로 펼친다. 1번 일부·3번·5번은 수익자마다 반복 */
export function draftSections(draft: LawsuitDraft, disposals: Disposal[]): DraftSectionView[] {
  const per = (key: "beneficiaryAndProperty" | "fraudulentAct" | "claimDraft"): DraftField[] =>
    draft.perBeneficiary.map((p, index) => ({
      path: { index, key },
      label: beneficiaryLabel(disposals, p.disposalId, index),
      text: p[key],
    }));
  const one = (key: Exclude<keyof LawsuitDraft, "perBeneficiary">, label?: string): DraftField => ({
    path: { key },
    label,
    text: draft[key],
  });

  const fieldsByNo: Record<number, DraftField[]> = {
    1: [one("debtor", "채무자"), ...per("beneficiaryAndProperty")],
    2: [one("securedClaim")],
    3: per("fraudulentAct"),
    4: [one("deadlineReview")],
    5: per("claimDraft"),
    6: [one("preservation")],
    7: [one("firmOpinionSummary")],
    8: [one("attachmentsAndChecks")],
  };
  return DRAFT_SECTIONS.map((s) => ({ no: s.no, title: s.title, fields: fieldsByNo[s.no] }));
}

/** 한 칸을 고친 새 초안 */
export function updateDraftField(draft: LawsuitDraft, path: DraftField["path"], text: string): LawsuitDraft {
  if ("index" in path) {
    return {
      ...draft,
      perBeneficiary: draft.perBeneficiary.map((p, i) => (i === path.index ? { ...p, [path.key]: text } : p)),
    };
  }
  return { ...draft, [path.key]: text };
}

/** 1~7번 칸에 남은 [확인 필요] 수. 8번은 [확인 필요] 사항을 모아 적는 목록이라 세지 않는다 */
export function countNeedsCheck(draft: LawsuitDraft, disposals: Disposal[]): number {
  return draftSections(draft, disposals)
    .filter((s) => s.no !== 8)
    .flatMap((s) => s.fields)
    .reduce((sum, f) => sum + f.text.split(NEEDS_CHECK).length - 1, 0);
}
