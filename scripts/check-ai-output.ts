// AI 답 모양 검사·내용 검사(PLAN 8~19)와 초안 검사·HTML 안전 처리(PLAN 20~23)가 맞게 동작하는지 본다.
// 실행: npm run check:ai-output  (OpenAI를 부르지 않으므로 비용이 들지 않는다)

import { zodTextFormat } from "openai/helpers/zod";
import { NOT_IN_REPLY, type ExtractedSource, type ReplyInput } from "../lib/reply-types";
import { OcrRequestSchema, ReplyInputSchema, SummaryOutputSchema, type CompareOutput, type SummaryOutput } from "../lib/server/schemas";
import { validateCompareOutput, validateDraftOutput, validateOcrOutput, validateSummaryOutput } from "../lib/server/validate";
import { errorFromParse } from "../lib/server/respond";
import { countNeedsCheck } from "../lib/draft";
import { draftInput, summarizeInstructions, tagSources } from "../lib/server/prompts";
import { computeDeadline, computeDeadlines } from "../lib/deadline";
import { deadlineMessage } from "../lib/labels";
import JSZip from "jszip";
import { buildHwpx, hwpxFileName, hwpxParagraphs } from "../lib/export-hwpx";
import { buildDownloadHtml, escapeHtml } from "../lib/export-html";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "통과" : "실패"}  ${name}${detail ? "  — " + detail : ""}`);
}

// 가명 샘플 4를 줄인 입력: 1차 PDF 2쪽 + 2차 이메일
const input: ReplyInput = {
  lawsuitType: "fraudulent-transfer",
  cancellationKnownDate: "2026-10-01",
  sources: [
    {
      fileName: "라온_1차회신.pdf",
      kind: "pdf",
      round: 1,
      segments: [
        { page: 1, paragraph: 1, text: "사건번호: 2026-사해-0125 채무자: 서채무" },
        { page: 1, paragraph: 2, text: "채무자 서채무가 2025. 8. 30. 수익자 남수익에게 아파트를 매도한 행위" },
        { page: 2, paragraph: 1, text: "근저당권이 말소되었으므로 가액배상을 청구해야 할 가능성이 있습니다." },
      ],
    },
    {
      fileName: "이메일 본문",
      kind: "email",
      round: 2,
      segments: [
        { paragraph: 1, text: "무자력: 채무초과 상태가 확인됩니다." },
        { paragraph: 2, text: "보전처분: 수익자 남수익의 재산에 대한 가압류를 검토하시기 바랍니다." },
      ],
    },
  ],
};

const pdf = (page: number, paragraph: number) => ({ fileName: "라온_1차회신.pdf", page, paragraph });
const mail = (paragraph: number) => ({ fileName: "이메일 본문", page: null, paragraph });
const missing = { text: NOT_IN_REPLY, sources: [] };

function goodOutput(): SummaryOutput {
  return {
    identity: { caseNumber: "2026-사해-0125", debtorName: "서채무", beneficiaryNames: ["남수익"], sources: [pdf(1, 1)] },
    firmName: "법무법인 라온",
    issues: [{ title: "원상회복 방법", detail: { text: "근저당권 말소로 가액배상 가능성", sources: [pdf(2, 1)] } }],
    firmOpinion: { text: "채무초과가 확인되어 소 제기를 검토할 만함", sources: [mail(1)] },
    disposals: [
      { id: "d1", kind: "매매", beneficiary: "남수익", subsequentAcquirer: null, property: "아파트", legalActDate: "2025-08-30", sources: [pdf(1, 2)] },
    ],
    checklist: Array.from({ length: 10 }, (_, i) => {
      const id = i + 1;
      if (id === 3) return { id, status: "present" as const, summary: { text: "채무초과 확인", sources: [mail(1)] } };
      if (id === 8) return { id, status: "present" as const, summary: { text: "가압류 검토", sources: [mail(2)] } };
      return { id, status: "not-in-reply" as const, summary: missing };
    }),
    glossary: [
      { term: "수익자", explanation: "채무자에게서 재산을 넘겨받은 사람이에요.", firstSeen: pdf(1, 2) },
      { term: "가액배상", explanation: "재산 대신 그 값을 돈으로 돌려받는 방법이에요.", firstSeen: pdf(2, 1) },
      { term: "가압류", explanation: "재산을 마음대로 처분하지 못하게 미리 묶어 두는 절차예요. 소송 전에 신청해요.", firstSeen: mail(2) },
    ],
    typeMismatchWarning: null,
  };
}

function expectProblem(name: string, mutate: (o: SummaryOutput) => void, keyword: string, inputOverride: Partial<ReplyInput> = {}) {
  const o = goodOutput();
  mutate(o);
  const r = validateSummaryOutput(o, { ...input, ...inputOverride });
  const hit = !r.ok && r.problems.some((p) => p.includes(keyword));
  check(name, hit, r.ok ? "막지 못함" : r.problems.join(" / "));
}

console.log("■ AI 답 모양을 OpenAI 구조화 출력 형식으로 바꿀 수 있는지");
try {
  const format = zodTextFormat(SummaryOutputSchema, "reply_summary");
  check("구조화 출력 형식 만들기", format.type === "json_schema" && format.strict === true);
} catch (e) {
  check("구조화 출력 형식 만들기", false, (e as Error).message);
}

console.log("\n■ 맞는 답은 통과");
const good = validateSummaryOutput(goodOutput(), input);
check("샘플 4 정리 답 통과", good.ok, good.ok ? "" : good.problems.join(" / "));
if (good.ok) {
  check("점검 10항목 유지", good.summary.checklist?.length === 10);
  check("사건 표시 입력 요청 안 함", good.summary.identity.needsUserInput === false);
  check("PDF 원문 위치에 쪽 번호", good.summary.disposals[0].sources[0].page === 1);
  check("이메일 원문 위치에는 쪽 번호 없음", !("page" in good.summary.firmOpinion.sources[0]));
}

console.log("\n■ 틀린 답은 막음");
expectProblem("점검 항목이 9개", (o) => o.checklist.pop(), "정확히 10개");
expectProblem("점검 번호 순서가 섞임", (o) => o.checklist.reverse(), "정확히 10개");
expectProblem("'회신에 없음'인데 원문 위치가 있음", (o) => { o.checklist[0].summary = { text: NOT_IN_REPLY, sources: [pdf(1, 1)] }; }, "원문 위치가 있음");
expectProblem("요약은 있는데 원문 위치가 없음", (o) => { o.issues[0].detail.sources = []; }, "원문 위치가 없음");
expectProblem("보낸 원문에 없는 위치", (o) => { o.issues[0].detail.sources = [pdf(5, 9)]; }, "없는 위치만 있음");
expectProblem("이메일에 쪽 번호를 붙임", (o) => { o.issues[0].detail.sources = [{ fileName: "이메일 본문", page: 1, paragraph: 1 }]; }, "없는 위치만 있음");
expectProblem("상태와 요약이 맞지 않음", (o) => { o.checklist[0].status = "present"; }, "맞지 않음");
expectProblem("용어 풀이 3문장", (o) => { o.glossary[0].explanation = "첫째예요. 둘째예요. 셋째예요."; }, "2문장");
expectProblem("법률행위 일자 형식 틀림", (o) => { o.disposals[0].legalActDate = "2025. 8. 30."; }, "YYYY-MM-DD");
expectProblem("처분행위 원문 위치 없음", (o) => { o.disposals[0].sources = []; }, "원문 위치가 없음");

console.log("\n■ 용어 풀이는 서버가 원문 기준으로 정리");
function glossaryOf(mutate: (o: SummaryOutput) => void) {
  const o = goodOutput();
  mutate(o);
  const r = validateSummaryOutput(o, input);
  return r.ok ? r.summary.glossary : null;
}
const reordered = glossaryOf((o) => o.glossary.reverse());
check("순서가 뒤섞여도 회신에 나온 순서로 정렬", reordered?.map((g) => g.term).join(",") === "수익자,가액배상,가압류", reordered?.map((g) => g.term).join(","));
const dropped = glossaryOf((o) => o.glossary.push({ term: "제척기간", explanation: "기한이에요.", firstSeen: mail(1) }));
check("원문에 없는 용어는 뺌", dropped?.length === 3 && !dropped.some((g) => g.term === "제척기간"));
const relocated = glossaryOf((o) => { o.glossary[0].firstSeen = mail(2); });
check("처음 나온 위치를 원문에서 다시 찾음", relocated?.[0].firstSeen.page === 1 && relocated?.[0].firstSeen.paragraph === 2);
const twelve = ["채무자", "수익자", "아파트", "매도", "근저당권", "말소", "가액배상", "청구", "무자력", "채무초과", "보전처분", "가압류"];
const capped = glossaryOf((o) => { o.glossary = [...twelve].reverse().map((term) => ({ term, explanation: "풀이예요.", firstSeen: pdf(1, 1) })); });
check("12개 중 앞에서부터 10개만", capped?.length === 10 && capped.map((g) => g.term).join() === twelve.slice(0, 10).join(), capped?.map((g) => g.term).join(","));

console.log("\n■ 유형·사건 표시 처리");
const other = validateSummaryOutput({ ...goodOutput(), checklist: [] }, { ...input, lawsuitType: "other" });
check("'기타'면 점검 항목을 건너뜀(null)", other.ok && other.summary.checklist === null);
const noId = goodOutput();
noId.identity = { caseNumber: null, debtorName: " ", beneficiaryNames: [], sources: [] };
const noIdResult = validateSummaryOutput(noId, input);
check("사건번호·이름이 모두 없으면 입력 요청", noIdResult.ok && noIdResult.summary.identity.needsUserInput === true);

console.log("\n■ 제척기간 계산 (기준일 2026-10-28)");
{
  const T = "2026-10-28";
  const d = (legalActDate: string | null, known: string | null) => computeDeadline({ id: "x", legalActDate }, known, T);
  const s3 = d("2021-12-20", "2026-10-01");
  check("샘플 3: 안 날 있음 → 53일 노랑", s3.daysLeft === 53 && s3.level === "warning");
  const s5 = d("2021-03-15", "2026-10-25");
  check("샘플 5: 안 날 있음 → -227일 빨강", s5.daysLeft === -227 && s5.level === "expired" && !s5.fiveYearOnly);
  const s5none = d("2021-03-15", null);
  check("PLAN 31: 안 날 비움 + 5년 경과 → 빨강 경고(-227일)", s5none.daysLeft === -227 && s5none.level === "expired" && s5none.fiveYearOnly === true, JSON.stringify(s5none));
  const s3none = d("2021-12-20", null);
  check("PLAN 31: 안 날 비움 + 5년이 아직 안 지남 → [확인 필요]", s3none.level === "needs-check" && s3none.daysLeft === null);
  check(
    "5년 기한이 오늘(0일)이면 경과, 내일이면 [확인 필요]",
    d("2021-10-28", null).level === "expired" && d("2021-10-28", null).daysLeft === 0 && d("2021-10-29", null).level === "needs-check",
  );
  check("법률행위일이 없으면 [확인 필요]", d(null, null).level === "needs-check" && d(null, "2026-01-01").level === "needs-check");
  const many = computeDeadlines([{ id: "a", legalActDate: "2024-11-02" }, { id: "b", legalActDate: "2021-03-15" }, { id: "c", legalActDate: null }], null, T);
  check("처분행위 여러 개: 안 날 없이 경과한 것이 가장 짧은 기한", many.shortest?.disposalId === "b" && many.shortest.level === "expired");
}

console.log("\n■ 초안 검사 (PLAN 20~23)");
if (good.ok) {
  const summary = good.summary;
  const baseDraft = {
    debtor: "서채무",
    perBeneficiary: [{ disposalId: "d1", beneficiaryAndProperty: "남수익 — 아파트", fraudulentAct: "2025. 8. 30. 매도", claimDraft: "가액배상" }],
    securedClaim: "보증채무",
    deadlineReview: "여유 있음",
    preservation: "가압류 검토",
    firmOpinionSummary: "법무법인은 소 제기를 검토할 만하다고 봄",
    attachmentsAndChecks: "등기부",
  };
  const withExtra = [{ ...input.sources[0], segments: [...input.sources[0].segments, { page: 2, paragraph: 9, text: "인용되지 않은 문단입니다" }] }, input.sources[1]];
  const draftText = draftInput(summary, null, withExtra);
  check("초안 AI에는 근거로 든 문단만 보냄 (비용 절감)", draftText.includes("근저당권이 말소") && !draftText.includes("인용되지 않은 문단"));
  const okDraft = validateDraftOutput(baseDraft, summary, null, input.sources);
  check("맞는 초안 통과", okDraft.ok, okDraft.ok ? "" : okDraft.problems.join(" / "));
  const wrongDate = validateDraftOutput({ ...baseDraft, securedClaim: "2023. 4. 19. 발생" }, summary, null, input.sources);
  check("원문에 없는 날짜에 [확인 필요]", wrongDate.ok && wrongDate.draft.securedClaim.includes("[확인 필요](원문에 없는 날짜)"));
  const wrongAmount = validateDraftOutput(
    { ...baseDraft, perBeneficiary: [{ ...baseDraft.perBeneficiary[0], claimDraft: "27,000,000원 한도" }] },
    summary,
    null,
    input.sources,
  );
  check("원문에 없는 금액에 [확인 필요]", wrongAmount.ok && wrongAmount.draft.perBeneficiary[0].claimDraft.includes("[확인 필요](원문에 없는 금액)"));
  const sameDate = validateDraftOutput({ ...baseDraft, securedClaim: "2025-08-30" }, summary, null, input.sources);
  check("원문에 있는 날짜는 다른 표기여도 그대로", sameDate.ok && !sameDate.draft.securedClaim.includes("확인 필요"));
  const missingBeneficiary = validateDraftOutput({ ...baseDraft, perBeneficiary: [] }, summary, null, input.sources);
  check("처분행위별 칸이 빠지면 막음", !missingBeneficiary.ok);
  const empty = validateDraftOutput({ ...baseDraft, preservation: " " }, summary, null, input.sources);
  check("빈 칸이 있으면 막음", !empty.ok);
  const noDisposal = validateDraftOutput(
    { ...baseDraft, perBeneficiary: [{ disposalId: "none", beneficiaryAndProperty: NOT_IN_REPLY, fraudulentAct: NOT_IN_REPLY, claimDraft: NOT_IN_REPLY }] },
    { ...summary, disposals: [] },
    null,
    input.sources,
  );
  check("처분행위가 없으면 수익자 칸 1개('none')로 통과", noDisposal.ok);
  check("[확인 필요] 개수는 8번 칸을 빼고 셈", countNeedsCheck({ ...baseDraft, debtor: "[확인 필요] 이름", attachmentsAndChecks: "[확인 필요] a\n[확인 필요] b" }, summary.disposals) === 1);
  const t0 = Date.now();
  validateDraftOutput({ ...baseDraft, securedClaim: "1억".repeat(1_999) }, summary, null, input.sources);
  validateDraftOutput({ ...baseDraft, securedClaim: "1천만 ".repeat(999) }, summary, null, input.sources);
  check("금액 검사가 긴 악성 입력에서도 빨리 끝남 (보안 SEC-002)", Date.now() - t0 < 1_000, `${Date.now() - t0}ms`);
  check("너무 긴 칸은 막음", !validateDraftOutput({ ...baseDraft, securedClaim: "가".repeat(4_001) }, summary, null, input.sources).ok);
  const wrongDebtor = validateDraftOutput({ ...baseDraft, debtor: "엉뚱한이름" }, summary, null, input.sources);
  check("초안의 채무자 이름이 정리 결과와 다르면 [확인 필요]", wrongDebtor.ok && wrongDebtor.draft.debtor.includes("(채무자 이름이 정리 결과와 다름)"));
  const wrongBeneficiary = validateDraftOutput(
    { ...baseDraft, perBeneficiary: [{ ...baseDraft.perBeneficiary[0], beneficiaryAndProperty: "다른사람 — 아파트" }] },
    summary,
    null,
    input.sources,
  );
  check("초안의 수익자 이름이 정리 결과와 다르면 [확인 필요]", wrongBeneficiary.ok && wrongBeneficiary.draft.perBeneficiary[0].beneficiaryAndProperty.includes("(수익자 이름이 정리 결과와 다름)"));
  check("이름이 맞으면 [확인 필요]를 붙이지 않음", okDraft.ok && !okDraft.draft.debtor.includes("확인 필요") && !okDraft.draft.perBeneficiary[0].beneficiaryAndProperty.includes("확인 필요"));
  const honorific = validateDraftOutput(baseDraft, { ...summary, identity: { ...summary.identity, debtorName: "서채무 씨" } }, null, input.sources);
  check("'서채무 씨'와 '서채무'는 같은 이름으로 봄", honorific.ok && !honorific.draft.debtor.includes("확인 필요"));
  check("HTML 특수문자 처리", escapeHtml(`<script>alert("x")</script>&`) === "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;");
  const html = buildDownloadHtml({ createdAt: "2026-10-28", summary, deadlines: null, draft: { ...baseDraft, debtor: "<img src=x onerror=alert(1)>" } });
  check("내려받은 HTML에 스크립트·태그가 실행되지 않음", !/<script|<img/i.test(html) && html.includes("&lt;img"));
}

console.log("\n■ 사건 표시: 원문에 없는 모양의 이름 처리");
{
  const withIdentity = (identity: SummaryOutput["identity"]) => {
    const o = goodOutput();
    o.identity = identity;
    return validateSummaryOutput(o, input);
  };
  // 원문(input)에는 "서채무"(1쪽 1문단)와 "남수익"(1쪽 2문단)이 그대로 있다
  const prefixed = withIdentity({ caseNumber: null, debtorName: "채무자 서채무", beneficiaryNames: ["남수익 씨"], sources: [] });
  check("'채무자 서채무'·'남수익 씨'는 덧붙인 말을 떼고 원문에서 찾음", prefixed.ok && prefixed.summary.identity.debtorName === "서채무" && prefixed.summary.identity.beneficiaryNames[0] === "남수익", prefixed.ok ? JSON.stringify(prefixed.summary.identity) : prefixed.problems.join(" / "));
  check("찾은 이름의 원문 위치가 붙음", prefixed.ok && prefixed.summary.identity.sources.length > 0 && !prefixed.summary.identity.needsUserInput);
  const invented = withIdentity({ caseNumber: "2099-없는-9999", debtorName: "없는사람", beneficiaryNames: ["가짜수익자"], sources: [] });
  check("원문에 없는 값만 있으면 실패가 아니라 담당자 입력 요청(needsUserInput)", invented.ok && invented.summary.identity.needsUserInput && invented.summary.identity.debtorName === null && invented.summary.identity.beneficiaryNames.length === 0, invented.ok ? "" : invented.problems.join(" / "));
  const mixed = withIdentity({ caseNumber: "2099-없는-9999", debtorName: "서채무", beneficiaryNames: [], sources: [] });
  check("일부만 원문에 있으면 있는 것만 남김", mixed.ok && mixed.summary.identity.caseNumber === null && mixed.summary.identity.debtorName === "서채무" && !mixed.summary.identity.needsUserInput);
}

console.log("\n■ 근거 없는 법무법인 의견");
{
  const o = goodOutput();
  o.firmOpinion = { text: "법무법인은 소 제기를 권고함", sources: [] };
  const r = validateSummaryOutput(o, input);
  check("근거를 대지 못한 의견은 실패가 아니라 '회신에 없음'으로 바꿈", r.ok && r.summary.firmOpinion.text === NOT_IN_REPLY && r.summary.firmOpinion.sources.length === 0, r.ok ? "" : r.problems.join(" / "));
  const o2 = goodOutput();
  o2.firmOpinion = { text: "법무법인은 소 제기를 권고함", sources: [{ fileName: "없는파일.pdf", page: 1, paragraph: 1 }] };
  const r2 = validateSummaryOutput(o2, input);
  check("없는 위치만 댄 의견도 '회신에 없음'으로 바꿈", r2.ok && r2.summary.firmOpinion.text === NOT_IN_REPLY);
  const r3 = validateSummaryOutput(goodOutput(), input);
  check("근거가 있는 의견은 그대로", r3.ok && r3.summary.firmOpinion.text !== NOT_IN_REPLY);
}

console.log("\n■ 요청 모양 검사");
check("맞는 요청 통과", ReplyInputSchema.safeParse(input).success);
check("원문이 하나도 없으면 막음", !ReplyInputSchema.safeParse({ ...input, sources: [] }).success);
check("안 날이 오늘 이후면 막음", !ReplyInputSchema.safeParse({ ...input, cancellationKnownDate: "2999-01-01" }).success);
check("차수가 1·2가 아니면 막음", !ReplyInputSchema.safeParse({ ...input, sources: [{ ...input.sources[0], round: 3 }] }).success);

console.log("\n■ 사건정보 대조 검사 (PLAN 29)");
{
  const court: ExtractedSource = {
    fileName: "사건정보.pdf",
    kind: "pdf",
    round: 1,
    segments: [
      { page: 1, paragraph: 1, text: "접수일 2026.10.27 소장접수" },
      { page: 1, paragraph: 2, text: "피고 남수익" },
      { page: 1, paragraph: 3, text: "서울중앙지방법원" },
    ],
  };
  const mail2 = { fileName: "이메일 본문", page: null, paragraph: 2 };
  const ct = (n: number) => ({ fileName: "사건정보.pdf", page: 1, paragraph: n });
  const missingCourt = { text: "사건정보에 없음", sources: [] };
  const base = (): CompareOutput => ({
    items: [
      { id: 1, result: "same", replySays: { text: "피고는 남수익", sources: [mail2] }, courtSays: { text: "피고 남수익", sources: [ct(2)] } },
      { id: 2, result: "not-comparable", replySays: { text: "사해행위취소", sources: [mail2] }, courtSays: missingCourt },
      { id: 3, result: "same", replySays: { text: "소 제기 전 (회신 2026. 10. 24.)", sources: [mail2] }, courtSays: { text: "2026.10.27 소장접수", sources: [ct(1)] } },
      { id: 4, result: "not-comparable", replySays: missing, courtSays: missingCourt },
      { id: 5, result: "different", replySays: { text: "부산지방법원", sources: [mail2] }, courtSays: { text: "서울중앙지방법원", sources: [ct(3)] } },
      { id: 6, result: "not-comparable", replySays: missing, courtSays: missingCourt },
    ],
  });
  const run = (mutate: (o: CompareOutput) => void) => {
    const o = base();
    mutate(o);
    return validateCompareOutput(o, input.sources, court);
  };
  const ok = run(() => {});
  check("맞는 대조 결과 통과", ok.ok, ok.ok ? "" : ok.problems.join(" / "));
  check("주제 6개가 순서대로 만들어짐", ok.ok && ok.compare.items.map((i) => i.id).join() === "1,2,3,4,5,6");
  check("날짜가 서로 다르면 일치를 다름으로 바꿈 (2026. 10. 24. ≠ 2026.10.27)", ok.ok && ok.compare.items[2].result === "different");
  check("한쪽이 없으면 비교 불가로 고정", ok.ok && ok.compare.items[1].result === "not-comparable" && ok.compare.items[3].result === "not-comparable");
  check("양쪽 모두 없으면 비교 불가", ok.ok && ok.compare.items[5].result === "not-comparable");
  const forced = run((o) => { o.items[1].result = "different"; });
  check("한쪽이 없는데 다름이라 해도 비교 불가로 고침", forced.ok && forced.compare.items[1].result === "not-comparable");
  check("주제가 5개면 막음", !run((o) => { o.items.pop(); }).ok);
  check("양쪽에 내용이 있는데 비교 불가면 막음", !run((o) => { o.items[0].result = "not-comparable"; }).ok);
  check("사건정보에 없는 위치를 대면 막음", !run((o) => { o.items[0].courtSays.sources = [{ fileName: "사건정보.pdf", page: 9, paragraph: 9 }]; }).ok);
  check("원문 위치 없이 내용만 있으면 막음", !run((o) => { o.items[4].courtSays.sources = []; }).ok);
  const unknownDate = run((o) => { o.items[0].courtSays.text = "피고 남수익 (2030. 1. 1. 접수)"; });
  check("사건정보에 없는 날짜에는 [확인 필요]", unknownDate.ok && unknownDate.compare.items[0].courtSays.text.includes("[확인 필요](원문에 없는 날짜)"));
  const unknownCase = run((o) => { o.items[0].courtSays.text = "피고 남수익 (2026가합99999)"; });
  check("사건정보에 없는 사건번호에는 [확인 필요]", unknownCase.ok && unknownCase.compare.items[0].courtSays.text.includes("(원문에 없는 사건번호)"));
  const courtWithNo = { ...court, segments: [...court.segments, { page: 1, paragraph: 4, text: "사건번호 2026가합12345" }] };
  const o2 = base();
  o2.items[0].courtSays = { text: "사건번호 2026가합12345, 피고 남수익", sources: [ct(4)] };
  const knownCase = validateCompareOutput(o2, input.sources, courtWithNo);
  check("원문에 있는 사건번호와 '2026년' 같은 날짜 표기에는 붙이지 않음", knownCase.ok && !knownCase.compare.items[0].courtSays.text.includes("확인 필요"));
}

console.log("\n■ OCR (PLAN 33)");
{
  const out = (pages: { page: number; paragraphs: string[] }[]) => ({ pages });
  const okOcr = validateOcrOutput(out([{ page: 1, paragraphs: ["  1. 사안의   개요 ", "- 1 / 3 -", "채무자는 2025. 3. 14. 매도"] }, { page: 2, paragraphs: [] }]), [1, 2]);
  check("맞는 OCR 결과 통과", okOcr.ok, okOcr.ok ? "" : okOcr.problems.join(" / "));
  check("공백을 정리하고 쪽 번호만 있는 줄은 걸러냄", okOcr.ok && okOcr.pages[0].paragraphs.join("|") === "1. 사안의 개요|채무자는 2025. 3. 14. 매도");
  check("글자가 없는 쪽(빈 배열)은 허용", okOcr.ok && okOcr.pages[1].paragraphs.length === 0);
  check("요청한 쪽이 빠지면 막음", !validateOcrOutput(out([{ page: 1, paragraphs: ["내용"] }]), [1, 2]).ok);
  check("요청하지 않은 쪽이 있으면 막음", !validateOcrOutput(out([{ page: 1, paragraphs: ["내용"] }, { page: 9, paragraphs: ["내용"] }]), [1]).ok);
  check("같은 쪽이 두 번 오면 막음", !validateOcrOutput(out([{ page: 1, paragraphs: ["내용"] }, { page: 1, paragraphs: ["내용"] }]), [1, 1]).ok);
  check("4쪽 묶음이 모두 빈 쪽(양면 스캔 뒷면 등)이어도 막지 않음", validateOcrOutput(out([{ page: 1, paragraphs: [] }, { page: 2, paragraphs: ["  ", "- 2 -"] }]), [1, 2]).ok);
  check("쪽 순서대로 정렬", validateOcrOutput(out([{ page: 3, paragraphs: ["셋"] }, { page: 1, paragraphs: ["하나"] }]), [1, 3]).ok);

  const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  check("JPEG 그림 요청 통과", OcrRequestSchema.safeParse({ pages: [{ page: 1, image: jpeg }] }).success);
  check("JPEG가 아닌 그림은 막음", !OcrRequestSchema.safeParse({ pages: [{ page: 1, image: "data:image/png;base64,AAAA" }] }).success);
  check("그림이 아닌 글을 보내면 막음", !OcrRequestSchema.safeParse({ pages: [{ page: 1, image: "http://evil.example/x.jpg" }] }).success);
  const seven = OcrRequestSchema.safeParse({ pages: Array.from({ length: 7 }, (_, i) => ({ page: i + 1, image: jpeg })) });
  check("한 번에 7쪽을 보내면 막음", !seven.success);
  check("그림 한 장이 너무 크면 막음", !OcrRequestSchema.safeParse({ pages: [{ page: 1, image: "data:image/jpeg;base64," + "A".repeat(1_000_001) }] }).success);

  const tag = tagSources([{ fileName: "스캔.pdf", kind: "pdf", round: 1, ocr: true, segments: [{ page: 1, paragraph: 1, text: "본문" }] }]);
  check("OCR로 읽은 자료는 꼬리표에 OCR 표시", tag.startsWith("[스캔.pdf | 1차·OCR | 1 | 1]"), tag);
  const plain = tagSources([{ fileName: "일반.pdf", kind: "pdf", round: 2, segments: [{ page: 1, paragraph: 1, text: "본문" }] }]);
  check("일반 자료에는 OCR 표시가 없음", plain.startsWith("[일반.pdf | 2차 보완 | 1 | 1]"), plain);
  check("정리 지시문에 OCR 줄 처리 규칙이 있음", summarizeInstructions("fraudulent-transfer").includes("OCR로 읽은 줄"));
  const ocrHtml = buildDownloadHtml({ createdAt: "2026-10-28", summary: good.ok ? good.summary : (undefined as never), deadlines: null, draft: null, ocrFileNames: ["스캔<1>.pdf"] });
  check("내려받는 HTML에 OCR 안내(특수문자 처리 포함)", ocrHtml.includes("OCR(AI 글자 인식)로 읽은 파일") && ocrHtml.includes("스캔&lt;1&gt;.pdf"));
}

console.log("\n■ 차이 분석 2차 수정 (OCR 표시 전달, 날짜·이름 원문 대조, 제척기간 빈틈)");
{
  // 1. 요청 검사를 거쳐도 OCR 표시가 남아 AI 꼬리표에 "·OCR"이 붙는다
  const ocrReq = { ...input, sources: [{ ...input.sources[0], ocr: true }, input.sources[1]] };
  const parsedReq = ReplyInputSchema.safeParse(ocrReq);
  check("요청 검사 뒤에도 ocr 표시가 남음", parsedReq.success && parsedReq.data.sources[0].ocr === true);
  check("검사를 거친 요청의 꼬리표에 OCR 표시", parsedReq.success && tagSources(parsedReq.data.sources).startsWith("[라온_1차회신.pdf | 1차·OCR |"));

  // 2. 법률행위일·수익자 이름을 원문과 맞춰 본다
  const wrongDate = goodOutput();
  wrongDate.disposals[0].legalActDate = "2024-01-01";
  const wd = validateSummaryOutput(wrongDate, input);
  check("원문에 없는 법률행위일은 비움([확인 필요]로 이어짐)", wd.ok && wd.summary.disposals[0].legalActDate === null, wd.ok ? "" : wd.problems.join(" / "));
  const okDate = validateSummaryOutput(goodOutput(), input);
  check("원문에 있는 법률행위일(2025. 8. 30.)은 그대로", okDate.ok && okDate.summary.disposals[0].legalActDate === "2025-08-30");
  const wrongName = goodOutput();
  wrongName.disposals[0].beneficiary = "수익자 가짜이름 씨";
  const wn = validateSummaryOutput(wrongName, input);
  check("원문에 없는 수익자 이름은 덧붙인 말을 떼고 [확인 필요]를 붙임", wn.ok && wn.summary.disposals[0].beneficiary === "[확인 필요] 가짜이름", wn.ok ? wn.summary.disposals[0].beneficiary : wn.problems.join(" / "));
  const prefixedName = goodOutput();
  prefixedName.disposals[0].beneficiary = "수익자 남수익 씨";
  const pn = validateSummaryOutput(prefixedName, input);
  check("원문에 있는 이름은 덧붙인 말만 떼고 그대로", pn.ok && pn.summary.disposals[0].beneficiary === "남수익");

  // 3·4·15. 제척기간 빈틈
  const T = "2026-10-28";
  const d = (legalActDate: string | null, known: string | null) => computeDeadline({ id: "x", legalActDate }, known, T);
  const oneOnly = d(null, "2025-10-01");
  check("안 날 1년이 지났고 법률행위일이 없으면 빨강", oneOnly.level === "expired" && oneOnly.oneYearOnly === true && oneOnly.daysLeft !== null && oneOnly.daysLeft < 0, JSON.stringify(oneOnly));
  check("안 날 1년이 아직 안 지났고 법률행위일이 없으면 [확인 필요]", d(null, "2026-01-01").level === "needs-check");
  const shortestMix = computeDeadlines([{ id: "a", legalActDate: "2025-08-30" }, { id: "b", legalActDate: null }], "2026-10-01", T);
  check("날짜 없는 처분행위가 있으면 맨 위 줄이 초록이 아니라 [확인 필요]", shortestMix.shortest?.disposalId === "b" && shortestMix.shortest.level === "needs-check", JSON.stringify(shortestMix.shortest));
  const warnMix = computeDeadlines([{ id: "a", legalActDate: "2021-12-20" }, { id: "b", legalActDate: null }], "2026-10-01", T);
  check("임박(노랑) 처분행위가 있으면 날짜 없는 것이 있어도 노랑을 보여 줌", warnMix.shortest?.disposalId === "a" && warnMix.shortest.level === "warning");
  check("전부 계산되면 가장 짧은 것", computeDeadlines([{ id: "a", legalActDate: "2025-08-30" }, { id: "b", legalActDate: "2021-12-20" }], "2026-10-01", T).shortest?.disposalId === "b");
  check("기한이 오늘(0일)이면 '오늘이 마지막 날'", deadlineMessage(d("2021-10-28", null)).includes("오늘이 마지막 날") && !deadlineMessage(d("2021-10-28", null)).includes("0일 지남"));

  // 17. 90일·91일 경계와 윤년
  // 안 날 2026-01-26 → 1년 기한 2027-01-26 → 오늘(2026-10-28)부터 90일, 하루 늦은 안 날은 91일
  const r90 = d("2031-01-01", "2026-01-26");
  const r91 = d("2031-01-01", "2026-01-27");
  check("90일 남음은 노랑, 91일은 초록 (경계)", r90.daysLeft === 90 && r90.level === "warning" && r91.daysLeft === 91 && r91.level === "ok", `${r90.daysLeft}/${r91.daysLeft}`);
  const leap = d("2020-02-29", null); // 5년 기한: 2020-03-01부터 5년 → 2025-02-28 또는 03-01
  check("윤년(2020-02-29) 법률행위의 5년 기한이 계산됨", leap.fiveYearEnd === "2025-02-28", leap.fiveYearEnd ?? "null");
  const leapKnown = d(null, "2024-02-29");
  check("윤년(2024-02-29) 안 날의 1년 기한이 계산됨", leapKnown.oneYearEnd === "2025-02-28", leapKnown.oneYearEnd ?? "null");

  // 10·11. 초안: 직접 정한 사건 표시와 처분행위 0개
  if (good.ok) {
    const base = {
      debtor: "서채무",
      perBeneficiary: [{ disposalId: "d1", beneficiaryAndProperty: "남수익 — 아파트", fraudulentAct: "2025. 8. 30. 매도", claimDraft: "가액배상" }],
      securedClaim: "보증채무",
      deadlineReview: "여유 있음",
      preservation: "가압류 검토",
      firmOpinionSummary: "법무법인은 소 제기를 검토할 만하다고 봄",
      attachmentsAndChecks: "등기부",
    };
    const labeled = validateDraftOutput(base, { ...good.summary, identity: { ...good.summary.identity, manualLabel: "가명 사건 A" } }, null, input.sources);
    check("직접 정한 사건 표시가 초안 1번에 들어감", labeled.ok && labeled.draft.debtor.startsWith("가명 사건 A"), labeled.ok ? labeled.draft.debtor : "");
    const already = validateDraftOutput({ ...base, debtor: "가명 사건 A 서채무" }, { ...good.summary, identity: { ...good.summary.identity, manualLabel: "가명 사건 A" } }, null, input.sources);
    check("이미 들어 있으면 중복해서 붙이지 않음", already.ok && already.draft.debtor === "가명 사건 A 서채무");
    const none = validateDraftOutput(
      { ...base, perBeneficiary: [{ disposalId: "none", beneficiaryAndProperty: "아무 말", fraudulentAct: "지어낸 내용", claimDraft: "지어낸 청구" }] },
      { ...good.summary, disposals: [] },
      null,
      input.sources,
    );
    check("처분행위가 0개면 AI가 무엇을 써도 수익자 칸 3개를 '회신에 없음'으로 고정", none.ok && none.draft.perBeneficiary.length === 1 && Object.values(none.draft.perBeneficiary[0]).slice(1).every((v) => v === NOT_IN_REPLY));
    const fbName = validateDraftOutput(base, { ...good.summary, disposals: [{ ...good.summary.disposals[0], beneficiary: "[확인 필요] 남수익" }] }, null, input.sources);
    check("수익자 이름 앞의 [확인 필요]는 이름 대조에서 제외", fbName.ok && !fbName.draft.perBeneficiary[0].beneficiaryAndProperty.includes("정리 결과와 다름"));
    // 담당자 결정(2026-10-29): 초안이 있으면 내려받는 파일은 법무법인에 보내는 소송 의뢰서(초안 8항목)만 담는다
    const req = buildDownloadHtml({ createdAt: "2026-10-28", summary: good.summary, deadlines: computeDeadlines(good.summary.disposals, "2026-10-01", "2026-10-28"), draft: base, ocrFileNames: ["스캔.pdf"], staleNotices: ["낡았어요"] });
    check("초안이 있으면 HTML에 초안 8항목이 모두 들어감", [1, 2, 3, 4, 5, 6, 7, 8].every((n) => req.includes(`<h2>${n}. `)));
    check("초안이 있으면 HTML에 점검표·제척기간 표·쟁점·용어·내부 안내가 없음", !/점검 항목|용어 풀이|<h2>쟁점|<h2>제척기간|<h2>법무법인 의견|스캔\.pdf|낡았어요/.test(req));
    const noDraft = buildDownloadHtml({ createdAt: "2026-10-28", summary: good.summary, deadlines: null, draft: null, staleNotices: ["<낡았어요>"] });
    check("초안이 없으면(기타 유형 등) 정리 결과를 내보내고 낡은 결과 경고도 담음", noDraft.includes("점검 항목 10개") && noDraft.includes("&lt;낡았어요&gt;"));
  }
}

async function hwpxChecks() {
  console.log("\n■ hwpx 내려받기 (PLAN 30)");
  const r = validateSummaryOutput(goodOutput(), input);
  if (!r.ok) return check("hwpx 시험용 정리 결과 만들기", false);
  const draft = {
    debtor: "서채무 <b>굵게</b> & \u0007제어문자",
    perBeneficiary: [{ disposalId: "d1", beneficiaryAndProperty: "남수익 — 아파트", fraudulentAct: "2025. 8. 30. 매도\n둘째 줄", claimDraft: "가액배상" }],
    securedClaim: "보증채무",
    deadlineReview: "여유 있음",
    preservation: "가압류 검토",
    firmOpinionSummary: "법무법인은 소 제기를 검토할 만하다고 봄",
    attachmentsAndChecks: "등기부",
  };
  const bundle = { createdAt: "2026-10-28", summary: r.summary, deadlines: computeDeadlines(r.summary.disposals, "2026-10-01", "2026-10-28"), draft };
  const bytes = await buildHwpx(bundle);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  check("압축 파일 맨 앞이 mimetype", names[0] === "mimetype");
  check("mimetype은 압축하지 않음(저장만)", bytes[8] === 0 && bytes[9] === 0);
  check("mimetype 내용", (await zip.files["mimetype"].async("string")) === "application/hwp+zip");
  check("필수 파일이 모두 있음", ["version.xml", "META-INF/container.xml", "Contents/content.hpf", "Contents/header.xml", "Contents/section0.xml"].every((n) => names.includes(n)));
  const section = await zip.files["Contents/section0.xml"].async("string");
  const paragraphs = [...section.matchAll(/<hp:t>(.*?)<\/hp:t>/g)].map((m) => m[1]);
  check("문단 수 = 열린 문단 수 = 닫힌 문단 수", paragraphs.length === (section.match(/<hp:p /g) ?? []).length && paragraphs.length === (section.match(/<\/hp:p>/g) ?? []).length);
  const order = ["1. 사건 개요", "2. 피보전채권 내용", "3. 사해행위 내용과 일자", "4. 제척기간 검토 결과", "5. 청구취지(안)", "6. 보전처분 필요 여부", "7. 법무법인 의견 요약", "8. 첨부서류 목록과 [확인 필요] 사항"].map((h) => paragraphs.indexOf(h));
  check("초안 8항목이 순서대로 들어감", order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1])), order.join(","));
  check("글 속 <, &가 XML 문자로 바뀜", section.includes("&lt;b&gt;굵게&lt;/b&gt; &amp;") && !section.includes("<b>"));
  check("XML에 못 쓰는 제어 문자는 지움", !section.includes("\u0007"));
  check("여러 줄 글은 문단으로 나뉨", paragraphs.includes("2025. 8. 30. 매도") && paragraphs.includes("둘째 줄"));
  check("초안이 있으면 초안 8항목만 담김(점검·제척기간·용어 없음)", paragraphs[0] === "소송 의뢰서 (초안)" && [1, 2, 3, 4, 5, 6, 7, 8].every((n) => paragraphs.some((p) => p.startsWith(`${n}. `))) && !paragraphs.some((p) => p.startsWith("가장 짧은 기한") || p.startsWith("점검 항목") || p.startsWith("용어 풀이")));
  const refParagraphs = hwpxParagraphs({ createdAt: "2026-10-28", summary: r.summary, deadlines: computeDeadlines(r.summary.disposals, "2026-10-01", "2026-10-28"), draft: null });
  check("초안이 없으면 제척기간·점검 10항목·용어가 담김", refParagraphs.some((p) => p.startsWith("가장 짧은 기한")) && refParagraphs.filter((p) => /^\d+\. .* \[(있음|불명확|회신에 없음)\]/.test(p)).length === 10 && refParagraphs.some((p) => p.startsWith("수익자:")));
  check("파일 이름이 .hwpx", hwpxFileName(bundle).endsWith(".hwpx") && !hwpxFileName(bundle).includes("html"), hwpxFileName(bundle));

  console.log("\n■ 요청 거절 이유 안내");
  const asCode = async (res: Response | null) => (res ? { status: res.status, code: ((await res.json()) as { error: { code: string } }).error.code } : null);
  const tooLong = ReplyInputSchema.safeParse({ ...input, sources: [{ ...input.sources[0], segments: [{ page: 1, paragraph: 1, text: "가".repeat(20_001) }] }] });
  const tooLongResult = await asCode(tooLong.success ? null : errorFromParse(tooLong.error));
  check("한 문단이 2만 자를 넘으면 '너무 길다'(413)로 안내", tooLongResult?.code === "PAYLOAD_TOO_LARGE" && tooLongResult.status === 413, JSON.stringify(tooLongResult));
  const tooMany = ReplyInputSchema.safeParse({ ...input, sources: Array.from({ length: 31 }, () => input.sources[0]) });
  check("자료가 30개를 넘으면 '너무 길다'로 안내", (await asCode(tooMany.success ? null : errorFromParse(tooMany.error)))?.code === "PAYLOAD_TOO_LARGE");
  const future = ReplyInputSchema.safeParse({ ...input, cancellationKnownDate: "2999-01-01" });
  const futureResult = await asCode(future.success ? null : errorFromParse(future.error));
  check("안 날이 오늘 이후면 날짜 안내(INVALID_DATE)", futureResult?.code === "INVALID_DATE" && futureResult.status === 400, JSON.stringify(futureResult));
  const empty = ReplyInputSchema.safeParse({ ...input, sources: [] });
  check("그 밖의 잘못된 입력은 '입력을 확인해 주세요'", (await asCode(empty.success ? null : errorFromParse(empty.error)))?.code === "INVALID_INPUT");
}

hwpxChecks().then(() => {
  console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
  process.exit(failed ? 1 : 0);
});
