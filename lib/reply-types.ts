// 회신 정리·누락 점검·소송 의뢰 초안에서 함께 쓰는 데이터 구조.
// 화면, 서버 API, AI 응답 검사, HTML 내려받기가 모두 이 파일을 기준으로 한다.
// 근거: PRD 5장(must 1·2), PLAN 3번

/* ───────── 공통 표시 ───────── */

/** 회신이 아예 다루지 않은 내용 */
export const NOT_IN_REPLY = "회신에 없음";
/** 회신이 다루기는 했지만 확신할 수 없는 내용 */
export const NEEDS_CHECK = "[확인 필요]";

/** 날짜는 모두 "YYYY-MM-DD" 문자열로 다룬다 (시간대 문제를 피하려고 Date 객체를 쓰지 않음) */
export type IsoDate = string;

/* ───────── 입력 ───────── */

export type LawsuitType = "fraudulent-transfer" | "other";

export const LAWSUIT_TYPE_LABELS: Record<LawsuitType, string> = {
  "fraudulent-transfer": "사해행위취소",
  other: "기타",
};

export type SourceKind = "pdf" | "hwpx" | "email";

/** 원본에서 뽑은 글자 한 덩어리. 원문 위치를 알 수 있도록 쪽·문단 번호를 함께 둔다 */
export interface TextSegment {
  /** PDF만 있음 (1부터) */
  page?: number;
  /** 문단 번호 (1부터). PDF는 그 쪽 안에서 센 번호, .hwpx·이메일은 파일 전체에서 센 번호 (Design Ref: §4.1) */
  paragraph: number;
  text: string;
}

/** 1차 회신 / 2차 보완 회신 */
export type ReplyRound = 1 | 2;

/** 파일 하나(또는 이메일 본문)에서 뽑은 글자 */
export interface ExtractedSource {
  /** 이메일 본문은 "이메일 본문"으로 적는다 */
  fileName: string;
  kind: SourceKind;
  round: ReplyRound;
  segments: TextSegment[];
}

/** 이메일 본문을 가리킬 때 쓰는 파일 이름 */
export const EMAIL_SOURCE_NAME = "이메일 본문";

/** 담당자가 한 번에 올리는 회신 1건 (파일 여러 개 + 이메일 본문, 1차·2차 회신 포함) */
export interface ReplyInput {
  lawsuitType: LawsuitType;
  sources: ExtractedSource[];
  /** 취소원인을 안 날. 오늘 이후 날짜는 받지 않는다. 비어 있으면 null */
  cancellationKnownDate: IsoDate | null;
}

/* ───────── 원문 위치 ───────── */

export interface SourceLocation {
  fileName: string;
  page?: number;
  paragraph?: number;
}

/** 원문 위치가 붙은 글. 회신에 없으면 text가 NOT_IN_REPLY, sources는 빈 배열 */
export interface CitedText {
  text: string;
  sources: SourceLocation[];
}

/* ───────── must 1. 회신 정리 ───────── */

/** 회신과 사건을 잇는 표시. 사건번호 → 채무자명·수익자명 순으로 쓰고, 셋 다 없으면 담당자에게 묻는다 */
export interface CaseIdentity {
  caseNumber: string | null;
  debtorName: string | null;
  beneficiaryNames: string[];
  /** 사건번호·채무자명·수익자명이 모두 없으면 true */
  needsUserInput: boolean;
  /** needsUserInput일 때 담당자가 화면에서 직접 넣은 사건 표시. 초안·HTML에도 그대로 쓴다 */
  manualLabel: string | null;
  /** 사건번호·이름을 찾은 원문 위치 */
  sources: SourceLocation[];
}

export interface Issue {
  title: string;
  detail: CitedText;
}

/** 처분행위 1건. 수익자가 여럿이면 처분행위도 여럿이다 */
export interface Disposal {
  id: string;
  /** 매매, 증여, 근저당권설정 등 회신에 적힌 그대로 */
  kind: string;
  beneficiary: string;
  /** 전득자가 있으면 이름 */
  subsequentAcquirer: string | null;
  property: string;
  /** 법률행위 일자. 회신에 없으면 null */
  legalActDate: IsoDate | null;
  sources: SourceLocation[];
}

export type ChecklistItemId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** 사해행위취소소송 점검 항목 10개 (PRD 5장 순서 그대로) */
export const CHECKLIST_ITEMS: ReadonlyArray<{ id: ChecklistItemId; title: string }> = [
  { id: 1, title: "피보전채권" },
  { id: 2, title: "사해행위" },
  { id: 3, title: "채무자의 무자력" },
  { id: 4, title: "채무자의 사해의사" },
  { id: 5, title: "수익자·전득자의 악의" },
  { id: 6, title: "제척기간" },
  { id: 7, title: "원상회복 방법" },
  { id: 8, title: "보전처분 필요 여부" },
  { id: 9, title: "관할 법원과 피고" },
  { id: 10, title: "필요 증거서류" },
];

/** 언급은 있지만 결론이나 근거가 없으면 unclear */
export type ChecklistStatus = "present" | "not-in-reply" | "unclear";

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  present: "있음",
  "not-in-reply": NOT_IN_REPLY,
  unclear: "불명확",
};

export interface ChecklistResult {
  id: ChecklistItemId;
  status: ChecklistStatus;
  /** 회신 내용 요약. not-in-reply면 NOT_IN_REPLY */
  summary: CitedText;
}

export const MAX_GLOSSARY_TERMS = 10;
export const MAX_GLOSSARY_SENTENCES = 2;

/** 법률 용어 쉬운 말 풀이. 회신에 나온 순서대로 */
export interface GlossaryTerm {
  term: string;
  explanation: string;
  firstSeen: SourceLocation;
}

/** AI가 만든 회신 정리 결과 (서버에서 검사를 통과한 것만 화면에 보낸다) */
export interface ReplySummary {
  lawsuitType: LawsuitType;
  identity: CaseIdentity;
  firmName: string | null;
  issues: Issue[];
  /** 법무법인 의견 요약. 승소 가능성 같은 판단은 법무법인 의견으로만 옮긴다 */
  firmOpinion: CitedText;
  disposals: Disposal[];
  /** 사해행위취소가 아니면(기타) null — 점검을 건너뛴다 */
  checklist: ChecklistResult[] | null;
  glossary: GlossaryTerm[];
  /** 고른 소송 유형이 회신과 달라 보일 때 경고 문구. 유형은 바꾸지 않는다 */
  typeMismatchWarning: string | null;
}

/* ───────── 제척기간 (AI가 아니라 코드로 계산) ───────── */

export const DEADLINE_WARNING_DAYS = 90;

/** ok: 여유 있음 / warning: 90일 이하 / expired: 0일 이하 / needs-check: 날짜가 없어 계산 못 함 */
export type DeadlineLevel = "ok" | "warning" | "expired" | "needs-check";

export interface DeadlineResult {
  disposalId: string;
  /** 취소원인을 안 날 + 1년 */
  oneYearEnd: IsoDate | null;
  /** 법률행위 일자 + 5년 */
  fiveYearEnd: IsoDate | null;
  /** 두 기한 중 먼저 끝나는 날 */
  deadline: IsoDate | null;
  /** 오늘부터 deadline까지 남은 일수 (지났으면 음수) */
  daysLeft: number | null;
  /** '안 날'이 없지만 5년 기한이 이미 지나 경과로 본 경우 */
  fiveYearOnly?: boolean;
  level: DeadlineLevel;
}

/** 처분행위별 결과와, 그중 가장 짧은 것 기준 경고 */
export interface DeadlineSummary {
  perDisposal: DeadlineResult[];
  shortest: DeadlineResult | null;
}

/* ───────── must 2. 소송 의뢰 초안 ───────── */

/** 초안 8개 항목 (순서 고정). 1번 일부·3번·5번은 수익자별로 반복한다 */
export const DRAFT_SECTIONS = [
  { no: 1, title: "사건 개요" },
  { no: 2, title: "피보전채권 내용" },
  { no: 3, title: "사해행위 내용과 일자" },
  { no: 4, title: "제척기간 검토 결과" },
  { no: 5, title: "청구취지(안)" },
  { no: 6, title: "보전처분 필요 여부" },
  { no: 7, title: "법무법인 의견 요약" },
  { no: 8, title: "첨부서류 목록과 [확인 필요] 사항" },
] as const;

/** 수익자(처분행위)마다 반복하는 부분 */
export interface DraftPerBeneficiary {
  disposalId: string;
  /** 1번: 수익자(전득자)와 대상 재산 */
  beneficiaryAndProperty: string;
  /** 3번: 사해행위 내용과 일자 */
  fraudulentAct: string;
  /** 5번: 사해행위 취소와 원상회복 방법 */
  claimDraft: string;
}

/** 담당자가 화면에서 고칠 수 있는 초안. 모든 칸은 일반 글(문자열)이다 */
export interface LawsuitDraft {
  /** 1번 중 한 번만 쓰는 부분: 채무자 */
  debtor: string;
  perBeneficiary: DraftPerBeneficiary[];
  /** 2번 (한 번만) */
  securedClaim: string;
  /** 4번 */
  deadlineReview: string;
  /** 6번 */
  preservation: string;
  /** 7번 */
  firmOpinionSummary: string;
  /** 8번 */
  attachmentsAndChecks: string;
}

/* ───────── 내려받기 ───────── */

/** POST /api/draft 요청. 날짜·금액·이름을 원문과 대조하려고 원문 글자도 함께 보낸다 */
export interface DraftRequest {
  summary: ReplySummary;
  deadlines: DeadlineSummary | null;
  sources: ExtractedSource[];
}

/** HTML 파일 하나에 담는 전체 결과 */
export interface DownloadBundle {
  createdAt: IsoDate;
  summary: ReplySummary;
  deadlines: DeadlineSummary | null;
  /** "기타" 유형이면 초안 없이 정리 결과만 담는다 */
  draft: LawsuitDraft | null;
}
