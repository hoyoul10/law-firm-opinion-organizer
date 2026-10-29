// AI 답 내용 검사. 통과한 답만 ReplySummary로 바꿔 화면에 보낸다.
// Design Ref: §5.1-4 — 개수·원문 위치·"회신에 없음" 규칙 검사
// Plan SC: 점검 10항목 100% 표시, 용어 최대 10개·2문장, 정리 결과의 모든 항목에 원문 위치

import "server-only";
import { isIsoDate } from "../dates";
import {
  CHECKLIST_ITEMS,
  MAX_GLOSSARY_SENTENCES,
  MAX_GLOSSARY_TERMS,
  COMPARE_TOPICS,
  NEEDS_CHECK,
  NOT_IN_COURT,
  NOT_IN_REPLY,
  type ChecklistItemId,
  type CaseCompare,
  type CitedText,
  type CompareItem,
  type DeadlineSummary,
  type ExtractedSource,
  type LawsuitDraft,
  type OcrPageText,
  type ReplyInput,
  type ReplySummary,
  type SourceLocation,
} from "../reply-types";
import { PAGE_NUMBER } from "../extract/shared";
import { NO_DISPOSAL_ID } from "./prompts";
import type { CitedTextOutput, CompareOutput, DraftOutput, LocationOutput, OcrOutput, SummaryOutput } from "./schemas";

export type ValidationResult =
  | { ok: true; summary: ReplySummary }
  | { ok: false; problems: string[] };

/** 보낸 원문에 실제로 있는 위치 목록. PDF는 "파일|쪽|문단", 그 외는 "파일||문단" */
function buildLocationKeys(input: { sources: ExtractedSource[] }): Set<string> {
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

function formatKey(loc: SourceLocation): string {
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

/** 근거 문단 앞뒤로 몇 문단까지 같은 근거로 보는지. 표가 있는 .hwpx는 칸마다 문단이 나뉘고, 쪽 경계에서도 이어지기 때문이다 */
const CITED_NEIGHBORHOOD = 3;

/**
 * 법률행위 일자(YYYY-MM-DD)가 근거 문단(과 문서 순서상 앞뒤 3문단)에 적혀 있는지.
 * 날짜는 여러 표기("2025. 8. 30.", "2025년 8월 30일", "2025/8/30")를 같은 날짜로 본다.
 */
export function dateInCitedParagraphs(isoDate: string, sources: ExtractedSource[], cited: SourceLocation[]): boolean {
  const [y, mo, da] = isoDate.split("-");
  const want = normalizeDate(y, mo, da);
  for (const source of sources) {
    for (const loc of cited) {
      if (loc.fileName !== source.fileName || loc.paragraph === undefined) continue;
      const at = source.segments.findIndex((seg) => seg.paragraph === loc.paragraph && (source.kind !== "pdf" || seg.page === loc.page));
      if (at < 0) continue;
      const from = Math.max(0, at - CITED_NEIGHBORHOOD);
      const to = Math.min(source.segments.length - 1, at + CITED_NEIGHBORHOOD);
      for (let i = from; i <= to; i++) if (datesIn(source.segments[i].text).has(want)) return true;
    }
  }
  return false;
}

/** 초안 요청의 정리 결과도 화면이 보낸 것이라, 법률행위 일자를 같은 기준으로 다시 대조해 근거 없는 날짜는 비운다 */
export function recheckLegalActDates(summary: ReplySummary, sources: ExtractedSource[]): ReplySummary {
  return {
    ...summary,
    disposals: summary.disposals.map((d) =>
      // 담당자가 화면에서 직접 넣은 날짜는 담당자가 원문을 보고 정한 값이므로 그대로 둔다
      d.legalActDate && !d.legalActDateManual && !dateInCitedParagraphs(d.legalActDate, sources, d.sources)
        ? { ...d, legalActDate: null, legalActDateUnverified: d.legalActDate }
        : d,
    ),
  };
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

  /** 보낸 원문에 실제로 있는 위치만 남긴다. 없는 위치는 버리고, 그 결과 비면 각 항목 규칙에서 걸린다 */
  const validLocations = (locs: LocationOutput[]) =>
    locs.filter((loc) => loc.paragraph !== null && keys.has(locationKey(loc)));

  /** "회신에 없음"이면 원문 위치가 없어야 하고, 그 밖의 글은 원문에 실제로 있는 위치가 하나 이상 있어야 한다 */
  const checkCited = (where: string, cited: CitedTextOutput): CitedText => {
    let text = cited.text.trim();
    // "회신에 없음." 처럼 끝에 문장부호만 붙은 경우는 정확한 표시로 맞춘다
    if (cited.sources.length === 0 && /^회신에 없음[.。]?$/.test(text)) text = NOT_IN_REPLY;
    const isMissing = text === NOT_IN_REPLY;
    const valid = validLocations(cited.sources);
    if (!text) problems.push(`${where}: 내용이 비어 있음`);
    if (isMissing && cited.sources.length > 0) problems.push(`${where}: "${NOT_IN_REPLY}"인데 원문 위치가 있음`);
    if (!isMissing && text && valid.length === 0) {
      problems.push(`${where}: 원문 위치가 없음${cited.sources.length ? " (보낸 원문에 없는 위치만 있음)" : ""}`);
    }
    return { text, sources: valid.map(toSourceLocation) };
  };

  // 사건 표시: 원문 위치는 AI 답 대신 서버가 원문에서 이름·번호를 직접 찾아 붙인다
  // 원문에 글자 그대로 있는 값만 쓴다. "채무자 가명인", "가명인 씨"처럼 AI가 말을 덧붙였으면 덧붙인 말을 떼고 찾고,
  // 끝내 못 찾으면 추측하지 않고 비운다 → 셋 다 비면 담당자에게 사건 표시를 입력해 달라고 요청한다 (PRD)
  const identitySources: SourceLocation[] = [];
  const locateInSource = (raw: string | null): string | null => {
    const value = clean(raw);
    if (!value) return null;
    const stripped = value.replace(/^(채무자|수익자|전득자|피고|원고|사건번호)\s*[:：]?\s*/, "").replace(/\s*(씨|님)$/, "").trim();
    // 덧붙인 말을 뗀 이름을 먼저 쓴다 ("채무자 서채무"가 원문에 문장으로 있어도 이름은 "서채무")
    for (const candidate of [stripped, value]) {
      const at = candidate ? findFirst(input, candidate) : null;
      if (at) {
        if (!identitySources.some((s) => formatKey(s) === formatKey(at.location))) identitySources.push(at.location);
        return candidate;
      }
    }
    return null;
  };
  const caseNumber = locateInSource(output.identity.caseNumber);
  const debtorName = locateInSource(output.identity.debtorName);
  const beneficiaryNames = output.identity.beneficiaryNames.map(locateInSource).filter((n): n is string => n !== null);
  const hasIdentity = Boolean(caseNumber || debtorName || beneficiaryNames.length);

  // 쟁점·법무법인 의견
  const issues = output.issues.map((issue, i) => ({
    title: issue.title.trim(),
    detail: checkCited(`쟁점 ${i + 1}`, issue.detail),
  }));
  // 근거 문단을 하나도 대지 못한 의견은 AI가 지어낸 것이므로 버리고 "회신에 없음"으로 둔다 (회신에 의견이 아예 없는 경우)
  const opinionHasEvidence = validLocations(output.firmOpinion.sources).length > 0;
  const opinionSaysMissing = /^회신에 없음[.。]?$/.test(output.firmOpinion.text.trim());
  const firmOpinion =
    opinionHasEvidence || opinionSaysMissing
      ? checkCited("법무법인 의견", output.firmOpinion)
      : { text: NOT_IN_REPLY, sources: [] as SourceLocation[] };

  // 처분행위
  const seenIds = new Set<string>();
  const disposals = output.disposals.map((d, i) => {
    const where = `처분행위 ${i + 1}`;
    if (!d.id.trim() || seenIds.has(d.id)) problems.push(`${where}: id가 비었거나 겹침`);
    seenIds.add(d.id);
    let legalActDate = clean(d.legalActDate);
    let legalActDateUnverified: string | null = null;
    if (legalActDate && !isIsoDate(legalActDate)) problems.push(`${where}: 법률행위 일자가 YYYY-MM-DD 형식이 아님 (${legalActDate})`);
    const valid = validLocations(d.sources);
    // 제척기간은 이 날짜로 계산하므로, 이 처분행위가 근거로 든 문단(과 바로 앞뒤 문단)에 그 날짜가 실제로 있어야 한다.
    // 원문 다른 곳의 날짜를 고르거나 AI가 잘못 바꾼 날짜는 비우고 [확인 필요]로 둔다 (원문 속 지시 문구로 경고를 지우는 것도 막는다)
    if (legalActDate && isIsoDate(legalActDate) && !dateInCitedParagraphs(legalActDate, input.sources, valid.map(toSourceLocation))) {
      legalActDateUnverified = legalActDate;
      legalActDate = null;
    }
    if (valid.length === 0) problems.push(`${where}: 원문 위치가 없음`);
    // 수익자 이름도 원문에 글자 그대로 있어야 한다. 덧붙인 말은 떼고, 그래도 없으면 [확인 필요]를 붙인다
    const rawBeneficiary = d.beneficiary.trim();
    const bareBeneficiary = rawBeneficiary.replace(/^(수익자|피고)\s*[:：]?\s*/, "").replace(/\s*(씨|님)$/, "").trim();
    const beneficiary = !bareBeneficiary
      ? rawBeneficiary
      : findFirst(input, bareBeneficiary)
        ? bareBeneficiary
        : `${NEEDS_CHECK} ${bareBeneficiary}`;
    return {
      id: d.id,
      kind: d.kind.trim(),
      beneficiary,
      subsequentAcquirer: clean(d.subsequentAcquirer),
      property: d.property.trim(),
      legalActDate,
      ...(legalActDateUnverified && { legalActDateUnverified }),
      sources: valid.map(toSourceLocation),
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
        sources: identitySources,
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

/* ───────── 초안 검사 ───────── */

const DATE_PATTERN = /(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일|\.)?/g;
// 단위는 한 글자씩만 반복하고 숫자·단위·공백이 겹치지 않게 해, 긴 입력에서 검사 시간이 폭증하지 않게 한다 (보안 점검 SEC-002)
const AMOUNT_PATTERN = /\d[\d,]*(?:\s*[억천백만](?:\s*\d[\d,]*)?)*\s*원/g;
/** 초안 한 칸의 최대 글자 수. 넘으면 검사하지 않고 막는다 */
const MAX_DRAFT_FIELD_CHARS = 4_000;

function normalizeDate(y: string, m: string, d: string): string {
  return `${Number(y)}-${Number(m)}-${Number(d)}`;
}

/** 사건번호 모양: 연도 + 한글 사건부호 + 번호 (2026가합12345, 2026카처5678, 2026-사해-0101). 2026년·2026. 같은 날짜 표기와 겹치지 않게 연도 뒤에 "년·월·일"은 제외 */
const CASE_NUMBER_PATTERN = /\d{4}-?(?![년월일])[가-힣]{1,4}-?\d{1,8}/g;

function squeeze(text: string): string {
  return text.replace(/\s+/g, "");
}

export type DraftValidationResult = { ok: true; draft: LawsuitDraft } | { ok: false; problems: string[] };

/**
 * 초안 검사. 칸 개수·순서를 확인하고, 원문에 없는 날짜·금액에는 [확인 필요]를 붙인다.
 * Design Ref: §5.1-4 초안 대조 / PRD: 날짜·금액·당사자 이름은 원문 그대로
 */
export function validateDraftOutput(
  output: DraftOutput,
  summary: ReplySummary,
  deadlines: DeadlineSummary | null,
  sources: ExtractedSource[],
): DraftValidationResult {
  const problems: string[] = [];
  const corpus = sources.flatMap((s) => s.segments.map((seg) => seg.text)).join("\n");
  const squeezedCorpus = squeeze(corpus);

  // 원문과 코드 계산에 실제로 있는 날짜
  const knownDates = new Set<string>();
  for (const m of corpus.matchAll(DATE_PATTERN)) knownDates.add(normalizeDate(m[1], m[2], m[3]));
  for (const d of [...summary.disposals.map((x) => x.legalActDate), ...(deadlines?.perDisposal ?? []).flatMap((x) => [x.oneYearEnd, x.fiveYearEnd, x.deadline])]) {
    if (d) {
      const [y, mo, da] = d.split("-");
      knownDates.add(normalizeDate(y, mo, da));
    }
  }

  const markUnknownFacts = (text: string): string =>
    text
      .replace(DATE_PATTERN, (match, y, m, d) =>
        knownDates.has(normalizeDate(y, m, d)) ? match : `${match} ${NEEDS_CHECK}(원문에 없는 날짜)`,
      )
      .replace(AMOUNT_PATTERN, (match) =>
        squeezedCorpus.includes(squeeze(match)) ? match : `${match} ${NEEDS_CHECK}(원문에 없는 금액)`,
      );

  const field = (where: string, value: string): string => {
    const text = value.trim();
    if (!text) problems.push(`${where}: 비어 있음`);
    if (text.length > MAX_DRAFT_FIELD_CHARS) {
      problems.push(`${where}: 너무 김`);
      return text.slice(0, MAX_DRAFT_FIELD_CHARS);
    }
    return markUnknownFacts(text);
  };

  const expectedIds = summary.disposals.length > 0 ? summary.disposals.map((d) => d.id) : [NO_DISPOSAL_ID];
  const byId = new Map(output.perBeneficiary.map((p) => [p.disposalId, p]));
  if (output.perBeneficiary.length !== expectedIds.length || expectedIds.some((id) => !byId.has(id))) {
    problems.push(`수익자별 칸: 처분행위(${expectedIds.join(",")})마다 하나씩이어야 함 (받은 것: ${output.perBeneficiary.map((p) => p.disposalId).join(",") || "없음"})`);
  }

  // 당사자 이름은 정리 결과(원문에서 서버가 확인한 이름)와 같아야 한다. 다르면 [확인 필요]를 붙인다
  const plainName = (name: string | null | undefined) =>
    (name ?? "").replace(NEEDS_CHECK, "").replace(/\s*씨$/, "").trim();
  const expectName = (text: string, name: string | null | undefined, note: string) => {
    const n = plainName(name);
    return n && !text.includes(n) ? `${text} ${NEEDS_CHECK}(${note})` : text;
  };

  // 담당자가 직접 정한 사건 표시는 초안 1번 맨 앞에 그대로 나와야 한다 (Design §3.1 ②)
  const manualLabel = summary.identity.manualLabel?.trim();
  let debtor = expectName(field("1. 채무자", output.debtor), summary.identity.debtorName, "채무자 이름이 정리 결과와 다름");
  if (manualLabel && !debtor.includes(manualLabel)) debtor = `${manualLabel}\n${debtor}`;

  const draft: LawsuitDraft = {
    debtor,
    perBeneficiary: expectedIds.map((id, i) => {
      const p = byId.get(id);
      const disposal = summary.disposals.find((d) => d.id === id);
      // 처분행위가 하나도 없으면 수익자 칸 1개는 AI가 무엇을 쓰든 "회신에 없음"으로 고정한다 (Design §3.1 ③)
      if (!disposal) {
        return { disposalId: id, beneficiaryAndProperty: NOT_IN_REPLY, fraudulentAct: NOT_IN_REPLY, claimDraft: NOT_IN_REPLY };
      }
      return {
        disposalId: id,
        beneficiaryAndProperty: expectName(
          field(`1. 수익자 ${i + 1}`, p?.beneficiaryAndProperty ?? ""),
          disposal.beneficiary,
          "수익자 이름이 정리 결과와 다름",
        ),
        fraudulentAct: field(`3. 수익자 ${i + 1}`, p?.fraudulentAct ?? ""),
        claimDraft: field(`5. 수익자 ${i + 1}`, p?.claimDraft ?? ""),
      };
    }),
    securedClaim: field("2", output.securedClaim),
    deadlineReview: field("4", output.deadlineReview),
    preservation: field("6", output.preservation),
    firmOpinionSummary: field("7", output.firmOpinionSummary),
    attachmentsAndChecks: field("8", output.attachmentsAndChecks),
  };

  return problems.length > 0 ? { ok: false, problems } : { ok: true, draft };
}

/* ───────── 사건정보 대조 검사 ───────── */

export type CompareValidationResult = { ok: true; compare: CaseCompare } | { ok: false; problems: string[] };

function datesIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const m of text.matchAll(DATE_PATTERN)) found.add(normalizeDate(m[1], m[2], m[3]));
  return found;
}

/**
 * 대조 결과 검사. 주제 6개가 순서대로 있는지, 양쪽 근거 위치가 실제 원문에 있는지,
 * 한쪽에 내용이 없으면 "비교 불가"인지, 날짜가 서로 다르면 "일치"로 두지 않는지 본다.
 * 사건정보와 회신이 다른 항목을 놓치지 않는 쪽(다름으로 표시)으로 기운다. Plan SC: 29
 */
export function validateCompareOutput(
  output: CompareOutput,
  replySources: ExtractedSource[],
  caseInfo: ExtractedSource,
): CompareValidationResult {
  const problems: string[] = [];
  const replyKeys = buildLocationKeys({ sources: replySources });
  const courtKeys = buildLocationKeys({ sources: [caseInfo] });
  const replyCorpus = replySources.flatMap((s) => s.segments.map((seg) => seg.text)).join("\n");
  const courtCorpus = caseInfo.segments.map((seg) => seg.text).join("\n");

  if (output.items.length !== COMPARE_TOPICS.length || COMPARE_TOPICS.some((t, i) => output.items[i]?.id !== t.id)) {
    problems.push(`대조 주제: 1~6번이 순서대로 정확히 6개여야 함 (받은 번호: ${output.items.map((i) => i.id).join(",") || "없음"})`);
  }

  const side = (where: string, raw: { text: string; sources: LocationOutput[] }, missingText: string, keys: Set<string>, corpus: string) => {
    let text = raw.text.trim();
    if (raw.sources.length === 0 && new RegExp(`^${missingText}[.。]?$`).test(text)) text = missingText;
    const missing = text === missingText;
    const valid = raw.sources.filter((l) => l.paragraph !== null && keys.has(locationKey(l)));
    if (!text) problems.push(`${where}: 내용이 비어 있음`);
    if (missing && raw.sources.length > 0) problems.push(`${where}: "${missingText}"인데 원문 위치가 있음`);
    if (!missing && text && valid.length === 0) problems.push(`${where}: 원문 위치가 없음`);
    // 원문에 없는 날짜는 [확인 필요]를 붙인다
    const known = datesIn(corpus);
    const squeezedCorpus = squeeze(corpus);
    const marked = missing
      ? text
      : text
          .replace(DATE_PATTERN, (match, y, m, d) =>
            known.has(normalizeDate(y, m, d)) ? match : `${match} ${NEEDS_CHECK}(원문에 없는 날짜)`,
          )
          // 사건번호(예: 2026가합12345, 2026-사해-0101)도 원문에 그대로 있어야 한다
          .replace(CASE_NUMBER_PATTERN, (match) =>
            squeezedCorpus.includes(squeeze(match)) ? match : `${match} ${NEEDS_CHECK}(원문에 없는 사건번호)`,
          );
    return { text: marked, sources: valid.map(toSourceLocation), missing };
  };

  const items: CompareItem[] = COMPARE_TOPICS.map((topic, i) => {
    const raw = output.items[i];
    const where = `대조 ${topic.id}번`;
    const reply = side(`${where} 회신`, raw?.replySays ?? { text: "", sources: [] }, NOT_IN_REPLY, replyKeys, replyCorpus);
    const court = side(`${where} 사건정보`, raw?.courtSays ?? { text: "", sources: [] }, NOT_IN_COURT, courtKeys, courtCorpus);

    let result = raw?.result ?? "not-comparable";
    if (reply.missing || court.missing) {
      result = "not-comparable";
    } else {
      if (result === "not-comparable") problems.push(`${where}: 양쪽에 내용이 있는데 비교 불가로 표시됨`);
      // 날짜가 서로 다르면 일치로 두지 않는다 (놓치는 것보다 한 번 더 보는 쪽이 안전)
      const a = datesIn(reply.text);
      const b = datesIn(court.text);
      const differs = [...a].some((d) => !b.has(d)) || [...b].some((d) => !a.has(d));
      if (result === "same" && a.size > 0 && b.size > 0 && differs) {
        result = "different";
        court.text += " (날짜가 서로 달라 다름으로 표시)";
      }
    }
    return {
      id: topic.id,
      topic: topic.title,
      result,
      replySays: { text: reply.text, sources: reply.sources },
      courtSays: { text: court.text, sources: court.sources },
    };
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, compare: { caseInfoFileName: caseInfo.fileName, items } };
}

/* ───────── OCR 결과 검사 ───────── */

export type OcrValidationResult = { ok: true; pages: OcrPageText[] } | { ok: false; problems: string[] };

/**
 * OCR 결과 검사. 요청한 쪽이 빠짐없이 그대로 돌아왔는지 보고, 쪽 번호만 있는 줄을 걸러낸다.
 * 이 요청은 4쪽 묶음이라 빈 쪽(양면 스캔의 뒷면 등)이 이어질 수 있으므로 "글자가 하나도 없음"은 여기서 실패로 보지 않는다.
 * 문서 전체에서 글자를 거의 못 읽은 경우는 브라우저가 전체 합계로 판단한다 (lib/extract/ocr.ts).
 */
export function validateOcrOutput(output: OcrOutput, requestedPages: number[]): OcrValidationResult {
  const problems: string[] = [];
  const got = output.pages.map((p) => p.page);
  const sameSet = got.length === requestedPages.length && requestedPages.every((p) => got.includes(p)) && new Set(got).size === got.length;
  if (!sameSet) problems.push(`쪽 번호가 요청과 다름 (요청: ${requestedPages.join(",")}, 받은 것: ${got.join(",") || "없음"})`);

  const pages: OcrPageText[] = output.pages
    .map((p) => ({
      page: p.page,
      paragraphs: p.paragraphs.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t && !PAGE_NUMBER.test(t)),
    }))
    .sort((a, b) => a.page - b.page);

  const tooLong = pages.flatMap((p) => p.paragraphs).find((t) => t.length > 20_000);
  if (tooLong) problems.push("한 문단이 2만 자를 넘음");

  return problems.length > 0 ? { ok: false, problems } : { ok: true, pages };
}
