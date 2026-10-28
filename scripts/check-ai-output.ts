// AI 답 모양 검사·내용 검사(PLAN 8~19)와 초안 검사·HTML 안전 처리(PLAN 20~23)가 맞게 동작하는지 본다.
// 실행: npm run check:ai-output  (OpenAI를 부르지 않으므로 비용이 들지 않는다)

import { zodTextFormat } from "openai/helpers/zod";
import { NOT_IN_REPLY, type ReplyInput } from "../lib/reply-types";
import { ReplyInputSchema, SummaryOutputSchema, type SummaryOutput } from "../lib/server/schemas";
import { validateDraftOutput, validateSummaryOutput } from "../lib/server/validate";
import { countNeedsCheck } from "../lib/draft";
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
expectProblem("요약은 있는데 원문 위치가 없음", (o) => { o.firmOpinion.sources = []; }, "원문 위치가 없음");
expectProblem("보낸 원문에 없는 위치", (o) => { o.issues[0].detail.sources = [pdf(5, 9)]; }, "없는 위치만 있음");
expectProblem("이메일에 쪽 번호를 붙임", (o) => { o.firmOpinion.sources = [{ fileName: "이메일 본문", page: 1, paragraph: 1 }]; }, "없는 위치만 있음");
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
  check("HTML 특수문자 처리", escapeHtml(`<script>alert("x")</script>&`) === "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;");
  const html = buildDownloadHtml({ createdAt: "2026-10-28", summary, deadlines: null, draft: { ...baseDraft, debtor: "<img src=x onerror=alert(1)>" } });
  check("내려받은 HTML에 스크립트·태그가 실행되지 않음", !/<script|<img/i.test(html) && html.includes("&lt;img"));
}

console.log("\n■ 요청 모양 검사");
check("맞는 요청 통과", ReplyInputSchema.safeParse(input).success);
check("원문이 하나도 없으면 막음", !ReplyInputSchema.safeParse({ ...input, sources: [] }).success);
check("안 날이 오늘 이후면 막음", !ReplyInputSchema.safeParse({ ...input, cancellationKnownDate: "2999-01-01" }).success);
check("차수가 1·2가 아니면 막음", !ReplyInputSchema.safeParse({ ...input, sources: [{ ...input.sources[0], round: 3 }] }).success);

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
