// AI 답 내용 검사. 통과한 답만 ReplySummary로 바꿔 화면에 보낸다.
// Design Ref: §5.1-4 — 개수·원문 위치·"회신에 없음" 규칙 검사
// Plan SC: 점검 10항목 100% 표시, 용어 최대 10개·2문장, 정리 결과의 모든 항목에 원문 위치

import "server-only";
import { isIsoDate } from "../dates";
import {
  CHECKLIST_ITEMS,
  MAX_GLOSSARY_SENTENCES,
  MAX_GLOSSARY_TERMS,
  NOT_IN_REPLY,
  type ChecklistItemId,
  type CitedText,
  type ReplyInput,
  type ReplySummary,
  type SourceLocation,
} from "../reply-types";
import type { CitedTextOutput, LocationOutput, SummaryOutput } from "./schemas";

export type ValidationResult =
  | { ok: true; summary: ReplySummary }
  | { ok: false; problems: string[] };

/** 보낸 원문에 실제로 있는 위치 목록. PDF는 "파일|쪽|문단", 그 외는 "파일||문단" */
function buildLocationKeys(input: ReplyInput): Set<string> {
  const keys = new Set<string>();
  for (const source of input.sources) {
    for (const seg of source.segments) {
      keys.add(`${source.fileName}|${source.kind === "pdf" ? seg.page : ""}|${seg.paragraph}`);
    }
  }
  return keys;
}

function locationKey(loc: LocationOutput): string {
  return `${loc.fileName}|${loc.page ?? ""}|${loc.paragraph ?? ""}`;
}

function toSourceLocation(loc: LocationOutput): SourceLocation {
  return {
    fileName: loc.fileName,
    ...(loc.page !== null && { page: loc.page }),
    ...(loc.paragraph !== null && { paragraph: loc.paragraph }),
  };
}

/** 빈 문자열은 null로 */
function clean(value: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** 원문에서 글자가 처음 나오는 위치. 없으면 null */
function findFirst(input: ReplyInput, term: string): { order: number; location: SourceLocation } | null {
  if (!term) return null;
  for (const [fileIndex, source] of input.sources.entries()) {
    for (const [segIndex, seg] of source.segments.entries()) {
      const at = seg.text.indexOf(term);
      if (at >= 0) {
        return {
          // 파일 순서 → 문단 순서 → 문단 안 글자 위치
          order: (fileIndex * 100_000 + segIndex) * 100_000 + at,
          location: {
            fileName: source.fileName,
            ...(source.kind === "pdf" && seg.page && { page: seg.page }),
            paragraph: seg.paragraph,
          },
        };
      }
    }
  }
  return null;
}

/** 문장 수 (마침표·물음표·느낌표로 끝나는 덩어리) */
export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function validateSummaryOutput(output: SummaryOutput, input: ReplyInput): ValidationResult {
  const problems: string[] = [];
  const keys = buildLocationKeys(input);

  const checkLocations = (where: string, locs: LocationOutput[]) => {
    for (const loc of locs) {
      if (loc.paragraph === null || !keys.has(locationKey(loc))) {
        problems.push(`${where}: 보낸 원문에 없는 위치 (${loc.fileName} ${loc.page ?? "-"}쪽 ${loc.paragraph ?? "-"}문단)`);
      }
    }
  };

  /** "회신에 없음"이면 원문 위치가 없어야 하고, 그 밖의 글은 원문 위치가 있어야 한다 */
  const checkCited = (where: string, cited: CitedTextOutput): CitedText => {
    let text = cited.text.trim();
    // "회신에 없음." 처럼 끝에 문장부호만 붙은 경우는 정확한 표시로 맞춘다
    if (cited.sources.length === 0 && /^회신에 없음[.。]?$/.test(text)) text = NOT_IN_REPLY;
    const isMissing = text === NOT_IN_REPLY;
    if (!text) problems.push(`${where}: 내용이 비어 있음`);
    if (isMissing && cited.sources.length > 0) problems.push(`${where}: "${NOT_IN_REPLY}"인데 원문 위치가 있음`);
    if (!isMissing && text && cited.sources.length === 0) problems.push(`${where}: 원문 위치가 없음`);
    checkLocations(where, cited.sources);
    return { text, sources: cited.sources.map(toSourceLocation) };
  };

  // 사건 표시
  const caseNumber = clean(output.identity.caseNumber);
  const debtorName = clean(output.identity.debtorName);
  const beneficiaryNames = output.identity.beneficiaryNames.map((n) => n.trim()).filter(Boolean);
  const hasIdentity = Boolean(caseNumber || debtorName || beneficiaryNames.length);
  if (hasIdentity && output.identity.sources.length === 0) problems.push("사건 표시: 원문 위치가 없음");
  checkLocations("사건 표시", output.identity.sources);

  // 쟁점·법무법인 의견
  const issues = output.issues.map((issue, i) => ({
    title: issue.title.trim(),
    detail: checkCited(`쟁점 ${i + 1}`, issue.detail),
  }));
  const firmOpinion = checkCited("법무법인 의견", output.firmOpinion);

  // 처분행위
  const seenIds = new Set<string>();
  const disposals = output.disposals.map((d, i) => {
    const where = `처분행위 ${i + 1}`;
    if (!d.id.trim() || seenIds.has(d.id)) problems.push(`${where}: id가 비었거나 겹침`);
    seenIds.add(d.id);
    const legalActDate = clean(d.legalActDate);
    if (legalActDate && !isIsoDate(legalActDate)) problems.push(`${where}: 법률행위 일자가 YYYY-MM-DD 형식이 아님 (${legalActDate})`);
    if (d.sources.length === 0) problems.push(`${where}: 원문 위치가 없음`);
    checkLocations(where, d.sources);
    return {
      id: d.id,
      kind: d.kind.trim(),
      beneficiary: d.beneficiary.trim(),
      subsequentAcquirer: clean(d.subsequentAcquirer),
      property: d.property.trim(),
      legalActDate,
      sources: d.sources.map(toSourceLocation),
    };
  });

  // 점검 10항목 (사해행위취소만, 기타는 건너뜀)
  let checklist: ReplySummary["checklist"] = null;
  if (input.lawsuitType === "fraudulent-transfer") {
    const expected = CHECKLIST_ITEMS.map((item) => item.id);
    const ids = output.checklist.map((c) => c.id);
    if (ids.length !== 10 || expected.some((id, i) => ids[i] !== id)) {
      problems.push(`점검 항목: 1~10번이 순서대로 정확히 10개여야 함 (받은 번호: ${ids.join(",") || "없음"})`);
    }
    checklist = output.checklist.map((c) => {
      const where = `점검 ${c.id}번`;
      const summary = checkCited(where, c.summary);
      const isMissing = summary.text === NOT_IN_REPLY;
      if ((c.status === "not-in-reply") !== isMissing) {
        problems.push(`${where}: 상태(${c.status})와 요약("${NOT_IN_REPLY}" 여부)이 맞지 않음`);
      }
      return { id: c.id as ChecklistItemId, status: c.status, summary };
    });
  }

  // 용어 풀이: 원문에 글자 그대로 나온 용어만, 처음 나온 순서대로, 최대 10개, 2문장 이내.
  // 순서와 처음 나온 위치는 AI 답을 믿지 않고 서버가 원문에서 직접 찾아 정한다 (PRD: 회신에 나온 순서)
  const seenTerms = new Set<string>();
  const glossary = output.glossary
    .map((g) => ({ ...g, term: g.term.trim(), explanation: g.explanation.trim(), at: findFirst(input, g.term.trim()) }))
    .filter((g) => g.term && g.at !== null && !seenTerms.has(g.term) && seenTerms.add(g.term))
    .sort((a, b) => a.at!.order - b.at!.order)
    .slice(0, MAX_GLOSSARY_TERMS)
    .map((g) => {
      if (countSentences(g.explanation) > MAX_GLOSSARY_SENTENCES) problems.push(`용어 "${g.term}": 풀이가 ${MAX_GLOSSARY_SENTENCES}문장을 넘음`);
      return { term: g.term, explanation: g.explanation, firstSeen: g.at!.location };
    });

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    summary: {
      lawsuitType: input.lawsuitType,
      identity: {
        caseNumber,
        debtorName,
        beneficiaryNames,
        needsUserInput: !hasIdentity,
        manualLabel: null,
        sources: output.identity.sources.map(toSourceLocation),
      },
      firmName: clean(output.firmName),
      issues,
      firmOpinion,
      disposals,
      checklist,
      glossary,
      typeMismatchWarning: clean(output.typeMismatchWarning),
    },
  };
}
