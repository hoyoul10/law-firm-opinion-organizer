// AI에게 보내는 프롬프트.
// Design Ref: §5.1-2 — 문단마다 [파일이름 | 차수 | 쪽 | 문단] 꼬리표를 붙여 원문 위치를 그대로 옮기게 한다

import "server-only";
import { CHECKLIST_ITEMS, MAX_GLOSSARY_TERMS, NOT_IN_REPLY, type ExtractedSource, type LawsuitType } from "../reply-types";

/** 원문을 꼬리표가 붙은 줄들로 바꾼다. 쪽이 없는 원문(.hwpx·이메일)은 쪽 자리에 "-" */
export function tagSources(sources: ExtractedSource[]): string {
  return sources
    .flatMap((source) =>
      source.segments.map((seg) => {
        const round = source.round === 2 ? "2차 보완" : "1차";
        const page = source.kind === "pdf" && seg.page ? String(seg.page) : "-";
        return `[${source.fileName} | ${round} | ${page} | ${seg.paragraph}] ${seg.text.replace(/\s+/g, " ").trim()}`;
      }),
    )
    .join("\n");
}

const CHECKLIST_LINES = CHECKLIST_ITEMS.map((item) => `${item.id}. ${item.title}`).join("\n");

export function summarizeInstructions(lawsuitType: LawsuitType): string {
  const checklistRule =
    lawsuitType === "fraudulent-transfer"
      ? `checklist: 아래 10개 점검 항목을 1번부터 10번까지 순서대로 정확히 10개 채운다.
${CHECKLIST_LINES}
  - status "present": 회신이 그 항목에 대해 결론이나 근거를 적었다. summary.sources에 그 위치를 넣는다.
  - status "unclear": 회신이 그 항목을 언급했지만 결론이나 근거가 없다. summary에 무엇이 빠졌는지 적고, 언급한 위치를 sources에 넣는다.
  - status "not-in-reply": 회신이 그 항목을 전혀 다루지 않는다. summary.text는 정확히 "${NOT_IN_REPLY}", summary.sources는 빈 배열.
  - 언급이 하나도 없는 항목을 "unclear"로 적지 않는다.`
      : `checklist: 이 회신은 "기타" 유형이므로 빈 배열로 둔다.`;

  return `너는 법무법인 검토회신을 정리하는 도우미다. 사용자는 법률전문가가 아닌 소송업무 담당자다.

[입력 형식]
회신 원문이 한 줄에 한 문단씩 온다. 각 줄 앞의 꼬리표는 [파일 이름 | 차수 | 쪽 | 문단 번호]이다.

[원문 위치 규칙]
- 모든 sources, firstSeen에는 근거가 된 줄의 꼬리표 값을 그대로 옮긴다: fileName은 파일 이름, page는 쪽 번호(쪽이 "-"이면 null), paragraph는 문단 번호.
- 꼬리표에 없는 위치를 만들지 않는다.

[지어내기 금지]
- 회신에 없는 사실을 만들지 않는다. 회신이 다루지 않은 내용은 text를 정확히 "${NOT_IN_REPLY}"로, sources를 빈 배열로 둔다.
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
typeMismatchWarning: 담당자가 고른 소송 유형은 "${lawsuitType === "fraudulent-transfer" ? "사해행위취소" : "기타"}"이다. 회신 내용이 이 유형과 달라 보이면 그 이유를 한 문장으로, 아니면 null.

모든 글은 한국어로 쓴다.`;
}
