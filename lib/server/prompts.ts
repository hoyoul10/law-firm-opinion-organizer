// AI에게 보내는 프롬프트.
// Design Ref: §5.1-2 — 문단마다 [파일이름 | 차수 | 쪽 | 문단] 꼬리표를 붙여 원문 위치를 그대로 옮기게 한다

import "server-only";
import {
  CHECKLIST_ITEMS,
  COMPARE_TOPICS,
  MAX_GLOSSARY_TERMS,
  NEEDS_CHECK,
  NOT_IN_COURT,
  NOT_IN_REPLY,
  UNREADABLE,
  type ExtractedSource,
  type DeadlineSummary,
  type LawsuitType,
  type ReplySummary,
} from "../reply-types";

/** 원문을 꼬리표가 붙은 줄들로 바꾼다. 쪽이 없는 원문(.hwpx·이메일)은 쪽 자리에 "-" */
export function tagSources(sources: ExtractedSource[]): string {
  return sources
    .flatMap((source) =>
      source.segments.map((seg) => {
        const round = (source.round === 2 ? "2차 보완" : "1차") + (source.ocr ? "·OCR" : "");
        const page = source.kind === "pdf" && seg.page ? String(seg.page) : "-";
        return `[${source.fileName} | ${round} | ${page} | ${seg.paragraph}] ${seg.text.replace(/\s+/g, " ").trim()}`;
      }),
    )
    .join("\n");
}

/**
 * 점검 항목별 판정 기준. "있음"이 되려면 무엇이 회신에 있어야 하는지, 무엇은 "불명확"인지 정해 둔다.
 * 기준이 없으면 같은 회신도 실행할 때마다 판정이 달라졌다 (샘플 5건 시험, 2026-10-28)
 */
const CHECKLIST_CRITERIA: Record<number, string> = {
  1: `있음: 의뢰인 채권의 내용(발생 원인·일자·금액 중 하나 이상)과, 그 채권이 처분행위보다 먼저 성립했는지에 대한 판단이 있다.
     불명확: 채권은 적었지만 처분행위보다 먼저인지 판단하지 않았다.`,
  2: `있음: 처분행위(종류·일자·대상 재산)가 적혀 있고, 그것이 사해행위에 해당한다는(또는 아니라는) 판단이 있다.
     불명확: 처분행위는 적었지만 사해행위 해당 여부를 다른 사정(무자력 등) 확인 뒤로 미뤘다.`,
  3: `있음: 처분 당시 채무초과(무자력)였는지에 대한 결론이 있다.
     불명확: 자료가 부족하다며 판단을 미뤘거나, 확인이 더 필요하다고만 했다.`,
  4: `있음: 채무자의 사해의사가 인정·추정된다(또는 아니다)는 판단이 있다. "무자력 상태의 처분이므로 사해의사가 추정된다"도 있음이다.
     회신에 없음: 채무자의 사해의사를 다루지 않았다. 수익자의 악의만 다룬 것은 이 항목이 아니다.`,
  5: `있음: 수익자의 악의(또는 선의 항변 가능성)에 대한 판단이 있다. 전득자가 있는데 전득자 판단이 없으면 상태는 있음으로 두고, summary 끝에 "${NEEDS_CHECK} 전득자의 악의는 회신에 없음"을 붙인다.
     불명확: 수익자의 악의를 언급만 하고 판단하지 않았다.`,
  6: `있음: 1년 기한 또는 5년 기한 가운데 하나 이상에 대해 기한 날짜나 경과 여부를 적었다.
     '취소원인을 안 날'은 담당자가 따로 입력하는 값이므로, 회신이 안 날을 적지 않았다거나 의뢰인에게 확인하라고 했다는 이유만으로 불명확으로 하지 않는다.
     불명확: 제척기간을 언급만 하고 기한도 경과 여부도 적지 않았다.`,
  7: `있음: 원물반환(등기 말소 등) 또는 가액배상 가운데 어느 방법을 쓸지(또는 그럴 가능성)를 적었다.`,
  8: `있음: 보전처분(처분금지가처분·가압류 등)이 필요하다, 또는 필요성이 낮다는 의견이 있다.`,
  9: `있음: 관할 법원을 적었다. 피고는 적지 않았어도 있음으로 두고(사해행위취소의 피고는 수익자·전득자이므로), summary 끝에 "${NEEDS_CHECK} 피고는 회신에 명시 없음"을 붙인다.
     불명확: 관할을 언급했지만 어느 법원인지 정하지 않았다.`,
  10: `있음: 필요한 증거서류를 하나 이상 구체적으로 적었다.`,
};

const CHECKLIST_LINES = CHECKLIST_ITEMS.map(
  (item) => `${item.id}. ${item.title}\n     ${CHECKLIST_CRITERIA[item.id]}`,
).join("\n");

export function summarizeInstructions(lawsuitType: LawsuitType): string {
  const checklistRule =
    lawsuitType === "fraudulent-transfer"
      ? `checklist: 아래 10개 점검 항목을 1번부터 10번까지 순서대로 정확히 10개 채운다. 항목마다 적힌 판정 기준을 그대로 따른다.
${CHECKLIST_LINES}
  [공통 판정 규칙]
  - status "present"(있음): 위 기준의 "있음" 조건을 회신이 채운다. summary.sources에 그 위치를 넣는다.
  - status "unclear"(불명확): 회신이 그 항목을 언급했지만 위 기준의 "있음" 조건을 채우지 못한다. summary에 무엇이 빠졌는지 적고, 언급한 위치를 sources에 넣는다.
  - status "not-in-reply"(회신에 없음): 회신이 그 항목을 전혀 다루지 않는다. summary.text는 정확히 "${NOT_IN_REPLY}", summary.sources는 빈 배열.
  - 언급이 하나도 없는 항목을 "unclear"로 적지 않는다.
  - 판정은 회신이 그 항목을 "다루었는지"만 본다. 법무법인의 결론이 의뢰인에게 유리한지 불리한지는 판정에 영향을 주지 않는다 (예: "제척기간이 이미 지났다"도 6번은 있음).
  - 1차와 2차 보완 회신을 합쳐서 판정한다. 1차가 보류한 내용을 2차가 채웠으면 있음이다.`
      : `checklist: 이 회신은 "기타" 유형이므로 빈 배열로 둔다.`;

  return `너는 법무법인 검토회신을 정리하는 도우미다. 사용자는 법률전문가가 아닌 소송업무 담당자다.

[입력 형식]
회신 원문이 한 줄에 한 문단씩 온다. 각 줄 앞의 꼬리표는 [파일 이름 | 차수 | 쪽 | 문단 번호]이다.

[원문 위치 규칙]
- 모든 sources, firstSeen에는 근거가 된 줄의 꼬리표 값을 그대로 옮긴다: fileName은 파일 이름, page는 쪽 번호(쪽이 "-"이면 null), paragraph는 문단 번호.
- 꼬리표에 없는 위치를 만들지 않는다.

[OCR로 읽은 줄]
- 꼬리표의 차수 칸에 "OCR"가 붙은 줄(예: 1차·OCR)은 스캔한 그림을 AI가 글자로 읽은 것이라 글자 인식 오류가 있을 수 있다.
- 그 줄에서 가져온 날짜·금액·이름·사건번호가 흐리거나 앞뒤가 맞지 않아 믿기 어려우면, 해당 글 맨 앞에 "${NEEDS_CHECK}"를 붙이고 이유를 적는다.
- "${UNREADABLE}"로 표시된 부분의 내용은 추측하지 않는다.

[지어내기 금지]
- 회신에 없는 사실을 만들지 않는다. 회신이 다루지 않은 내용은 text를 정확히 "${NOT_IN_REPLY}"로, sources를 빈 배열로 둔다.
- 회신이 다루기는 했지만 표현이 모호하거나 서로 맞지 않아 확신할 수 없는 내용은 그 글 맨 앞에 "${NEEDS_CHECK}"를 붙이고, 무엇을 확인해야 하는지 함께 적는다. 이때도 근거가 된 위치를 sources에 넣는다.

[1차·2차 회신]
- 차수가 "2차 보완"인 줄은 같은 사건에 대한 보완 회신이다. 1차에서 보류·부족했던 내용을 2차가 채웠으면 2차 내용을 쓴다.
- 1차와 2차가 같은 항목에 대해 서로 다른 결론을 말하면 2차를 따르되, 글 맨 앞에 "${NEEDS_CHECK}"를 붙이고 1차 내용도 짧게 함께 적는다. sources에는 두 위치를 모두 넣는다.
- 날짜·금액·당사자 이름은 원문 표기를 그대로 옮긴다. 단 legalActDate만 YYYY-MM-DD로 바꾼다.
- 승소 가능성, 소 제기 여부 같은 법률 판단을 스스로 하지 않는다. 회신에 그런 판단이 있으면 "법무법인은 ~라고 봄"처럼 법무법인 의견으로만 옮긴다.

[채울 항목]
identity: 사건번호(caseNumber), 채무자 이름(debtorName), 수익자 이름 목록(beneficiaryNames). 회신에 없으면 null 또는 빈 배열. 찾은 위치를 sources에 넣는다. 추측하지 않는다.
firmName: 회신을 보낸 법무법인 이름. 없으면 null.
issues: 회신이 다루는 쟁점을 회신에 나온 순서대로 적는다. title은 짧은 이름, detail.text는 법무법인이 그 쟁점에 대해 쓴 내용을 쉬운 말 1~2문장으로 요약한다.
firmOpinion: 법무법인의 결론과 권고를 쉬운 말 2~3문장으로 요약한다.
disposals: 채무자 본인이 한 처분행위(매매, 증여, 근저당권설정 등)만 하나씩 적는다. id는 "d1", "d2" 순서.
  - beneficiary는 채무자에게서 직접 재산을 받은 사람(수익자)이다.
  - 수익자가 그 재산을 다시 다른 사람에게 넘긴 것은 채무자의 처분행위가 아니다. 별도 항목으로 적지 말고, 넘겨받은 사람을 원래 처분행위의 subsequentAcquirer(전득자)로만 적는다.
  - 예: "채무자 A가 B에게 팔고, B가 다시 C에게 팔았다" → 처분행위는 1개(beneficiary B, subsequentAcquirer C). kind는 원문 표현, beneficiary는 수익자, subsequentAcquirer는 전득자(없으면 null), property는 대상 재산, legalActDate는 법률행위(계약) 일자(없으면 null).
${checklistRule}
glossary: 회신 원문에 글자 그대로 나온 법률 용어 가운데 담당자가 헷갈리기 쉬운 것을 처음 나온 순서대로 최대 ${MAX_GLOSSARY_TERMS}개 고른다. 원문에 없는 용어는 넣지 않는다. explanation은 일상어로 2문장 이내. firstSeen은 그 용어가 처음 나온 위치.
typeMismatchWarning: ${
    lawsuitType === "fraudulent-transfer"
      ? `담당자는 소송 유형을 "사해행위취소"로 골랐다. 회신이 사해행위취소가 아닌 다른 소송(대여금, 손해배상 등)을 다루면 그 이유를 한 문장으로, 아니면 null.`
      : `담당자는 소송 유형을 "기타"(사해행위취소가 아닌 모든 소송)로 골랐다. 회신이 사해행위취소를 다룰 때만 그 이유를 한 문장으로 적고, 그 밖의 소송이면 null.`
  }

모든 글은 한국어로 쓴다.`;
}

/* ───────── 초안 ───────── */

/** 처분행위가 하나도 없을 때 수익자 칸 1개에 쓰는 id (Design Ref: §3.1 ③ 초안) */
export const NO_DISPOSAL_ID = "none";

export function draftInstructions(): string {
  return `너는 소송업무 담당자가 법무법인에 보낼 "사해행위취소 소송 의뢰 초안"을 만드는 도우미다.
입력으로 (1) 정리 결과 JSON, (2) 코드로 계산한 제척기간, (3) 회신 원문이 온다.

[초안 8항목 — 순서 고정]
1. 사건 개요: debtor(채무자) + perBeneficiary[].beneficiaryAndProperty(수익자·전득자와 대상 재산)
2. 피보전채권 내용: securedClaim (한 번만)
3. 사해행위 내용과 일자: perBeneficiary[].fraudulentAct
4. 제척기간 검토 결과: deadlineReview
5. 청구취지(안): perBeneficiary[].claimDraft (사해행위 취소와 원상회복 방법: 원물반환 또는 가액배상)
6. 보전처분 필요 여부: preservation
7. 법무법인 의견 요약: firmOpinionSummary
8. 첨부서류 목록과 ${NEEDS_CHECK} 사항: attachmentsAndChecks

[수익자별 반복]
- perBeneficiary는 정리 결과의 처분행위(disposals)마다 1개씩, 같은 순서로, disposalId에 그 처분행위의 id를 그대로 쓴다.
- 처분행위가 하나도 없으면 perBeneficiary를 1개만 만들고 disposalId는 "${NO_DISPOSAL_ID}", 세 칸은 모두 "${NOT_IN_REPLY}".

[규칙]
- 정리 결과와 회신 원문에 있는 사실만 쓴다. 없는 사실을 만들지 않는다.
- 날짜·금액·당사자 이름은 회신 원문 표기를 글자 그대로 옮긴다 (예: "2025. 3. 14.", "50,000,000원"). 바꾸거나 반올림하지 않는다.
- 회신이 아예 다루지 않은 항목은 정확히 "${NOT_IN_REPLY}"로 쓴다.
- 회신이 다루었지만 확신할 수 없는 부분은 그 문장 앞에 "${NEEDS_CHECK}"를 붙인다. 점검 결과가 "불명확"인 내용도 ${NEEDS_CHECK}로 표시한다.
- deadlineReview는 입력의 "제척기간 계산" 줄을 그대로 근거로 쓴다. 날짜 계산을 새로 하지 않는다.
- 승소 가능성이나 소 제기 여부를 스스로 판단하지 않는다. 그런 내용은 7번에 "법무법인은 ~라고 봄"으로만 쓴다.
- 8번에는 회신이 요청한 서류 목록과, 초안 전체에서 ${NEEDS_CHECK}를 붙인 사항을 한 줄씩 모아 적는다.
- 공문서처럼 간결한 한국어로 쓴다. 각 칸은 1~4문장.`;
}

/** 정리 결과가 근거로 든 문단만 골라낸다. 하나도 없으면(드문 경우) 전체 원문을 그대로 쓴다 */
export function pickCitedSources(summary: ReplySummary, sources: ExtractedSource[]): ExtractedSource[] {
  const citedKeys = new Set<string>();
  const cite = (locs: { fileName: string; page?: number; paragraph?: number }[]) =>
    locs.forEach((l) => citedKeys.add(`${l.fileName}|${l.page ?? ""}|${l.paragraph ?? ""}`));
  cite(summary.identity.sources);
  cite(summary.firmOpinion.sources);
  summary.issues.forEach((i) => cite(i.detail.sources));
  summary.disposals.forEach((d) => cite(d.sources));
  summary.checklist?.forEach((c) => cite(c.summary.sources));
  const cited = sources
    .map((s) => ({
      ...s,
      segments: s.segments.filter((seg) => citedKeys.has(`${s.fileName}|${s.kind === "pdf" ? (seg.page ?? "") : ""}|${seg.paragraph}`)),
    }))
    .filter((s) => s.segments.length > 0);
  return cited.length > 0 ? cited : sources;
}

export function draftInput(
  summary: ReplySummary,
  deadlines: DeadlineSummary | null,
  sources: ExtractedSource[],
): string {
  const LEVEL_TEXT = { ok: "여유 있음", warning: "90일 이하로 임박", expired: "제척기간 경과 가능성", "needs-check": NEEDS_CHECK } as const;
  const deadlineLines =
    deadlines && deadlines.perDisposal.length > 0
      ? deadlines.perDisposal
          .map((d) => {
            const disposal = summary.disposals.find((x) => x.id === d.disposalId);
            const name = disposal ? `${disposal.kind}(수익자 ${disposal.beneficiary})` : d.disposalId;
            return `- ${name}: 1년 기한 ${d.oneYearEnd ?? "담당자가 취소원인을 안 날을 입력하지 않음"}, 5년 기한 ${d.fiveYearEnd ?? "법률행위 일자 없음"}, 적용 기한 ${d.deadline ?? NEEDS_CHECK}, 남은 일수 ${d.daysLeft ?? NEEDS_CHECK}, 판정 ${LEVEL_TEXT[d.level]}${d.fiveYearOnly ? " (취소원인을 안 날은 입력되지 않았지만 법률행위일 5년 기한이 이미 지나 경과로 봄)" : ""}`;
          })
          .join("\n")
      : `- 처분행위가 없어 계산하지 못함 ${NEEDS_CHECK}`;
  // 초안 AI에게는 정리 결과가 근거로 든 문단만 보낸다 (비용 절감: 50장 기준 입력 9만 → 수천 토큰).
  // 날짜·금액·이름이 원문과 같은지는 서버가 전체 원문으로 따로 대조한다 (validateDraftOutput)
  const sourcesForAi = pickCitedSources(summary, sources);

  const { lawsuitType: _type, glossary: _glossary, ...rest } = summary;
  void _type;
  void _glossary;
  return `## 정리 결과
${JSON.stringify(rest)}

## 제척기간 계산 (코드로 계산한 값)
1년 기한이 날짜로 적혀 있으면 담당자가 '취소원인을 안 날'을 이미 입력해 계산한 것이다. 그 경우 안 날을 [확인 필요]로 적지 않는다.
deadlineReview에는 처분행위 id(d1 등) 대신 처분행위 종류와 수익자 이름으로 적는다.
${deadlineLines}

## 회신 원문 (정리 결과가 근거로 든 문단만)
${tagSources(sourcesForAi)}`;
}

/* ───────── 사건정보 대조 ───────── */

const COMPARE_TOPIC_LINES = COMPARE_TOPICS.map((t) => `${t.id}. ${t.title}`).join("\n");

export function compareInstructions(): string {
  return `너는 법무법인 회신의 내용과 법원 '나의 사건검색' 사건정보를 비교하는 도우미다. 사용자는 법률전문가가 아닌 소송업무 담당자다.
입력으로 (1) 회신 정리 결과 JSON, (2) 회신 원문 일부, (3) 법원 사건정보 원문이 온다. 두 곳의 내용이 같은지 다른지만 표시한다.

[비교 주제 6개 — 1번부터 6번까지 순서대로 정확히 6개]
${COMPARE_TOPIC_LINES}

[칸마다 채울 것]
- replySays: 그 주제에 대해 회신(정리 결과·회신 원문)이 말한 내용을 1~2문장으로. 회신이 다루지 않았으면 text를 정확히 "${NOT_IN_REPLY}", sources는 빈 배열.
- courtSays: 그 주제에 대해 사건정보에 적힌 내용을 1~2문장으로. 사건정보에 없으면 text를 정확히 "${NOT_IN_COURT}", sources는 빈 배열.
- 각 sources에는 근거가 된 줄의 꼬리표 값을 그대로 옮긴다 (fileName, page는 쪽 번호이고 "-"이면 null, paragraph).
- result:
  - "same": 두 쪽 모두 내용이 있고 서로 같다.
  - "different": 두 쪽 모두 내용이 있는데 서로 다르다. 사소한 표기 차이(예: 2025. 3. 14. 과 2025-03-14)는 같은 것으로 본다. 날짜나 사람 이름이 다르면 다름이다.
  - "not-comparable": 한쪽이라도 "${NOT_IN_REPLY}" 또는 "${NOT_IN_COURT}"이다.

[규칙]
- 회신 쪽은 회신에서만, 사건정보 쪽은 사건정보에서만 가져온다. 서로의 내용으로 채우지 않는다.
- 날짜·사건번호·이름·법원 이름은 원문 표기를 그대로 옮긴다.
- 회신 시점 이후에 진행된 일이 사건정보에만 있어서 서로 다르게 보이면 "different"로 표시하고, 설명에 그 점을 적는다 (예: 회신은 소 제기 전이라고 했지만 사건정보에는 소장이 접수됨).
- 승소 가능성이나 소송 전략을 판단하지 않는다.
모든 글은 한국어로 쓴다.`;
}

export function compareInput(summary: ReplySummary, sources: ExtractedSource[], caseInfo: ExtractedSource): string {
  const { lawsuitType: _type, glossary: _glossary, ...rest } = summary;
  void _type;
  void _glossary;
  return `## 회신 정리 결과
${JSON.stringify(rest)}

## 회신 원문 (정리 결과가 근거로 든 문단만)
${tagSources(pickCitedSources(summary, sources))}

## 법원 사건정보 원문
${tagSources([caseInfo])}`;
}

/* ───────── OCR ───────── */

export function ocrInstructions(): string {
  return `너는 스캔한 문서 그림에서 글자를 그대로 옮겨 적는 도구다. 그림은 법무법인 검토회신(한국어 법률 문서)의 쪽들이다.

[규칙]
- 그림에 보이는 글자를 있는 그대로 옮겨 적는다. 요약하거나 고치거나 다시 쓰거나 번역하지 않는다. 맞춤법·띄어쓰기도 보이는 대로 둔다.
- 문단 단위로 나눠 위에서 아래 순서대로 paragraphs에 담는다. 제목·번호가 붙은 항목("1. 사안의 개요" 등)은 따로 한 문단으로 둔다. 같은 문단이 줄바꿈으로 여러 줄이면 한 문단으로 이어 붙인다.
- 쪽 번호만 있는 줄, 반복되는 머리글·바닥글은 적지 않는다.
- 날짜·금액·사건번호·이름 같은 숫자와 고유명사는 특히 정확하게 읽는다. 쉼표·마침표·단위(원, 년, 월, 일)도 그대로 옮긴다.
- 글자가 흐리거나 가려져 알아볼 수 없는 부분은 추측하지 말고 "${UNREADABLE}"로 적는다.
- 도장·서명·손글씨는 읽을 수 있으면 옮기고, 읽을 수 없으면 "${UNREADABLE}"로 적는다.
- 표는 칸 순서대로 한 줄로 이어서 적는다 (예: "접수일 2026.10.27 소장접수").
- 입력으로 받은 쪽마다 page에 입력의 쪽 번호를 그대로 쓴다. 글자가 하나도 없는 쪽은 paragraphs를 빈 배열로 둔다.`;
}
