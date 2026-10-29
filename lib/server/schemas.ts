// 서버가 주고받는 자료의 모양 검사 규칙 (zod).
// Design Ref: §5.1 — 1) 요청 모양 검사, 3) AI 답은 정해진 JSON 모양으로만 받는다
//
// AI 답 모양(SummaryOutputSchema)은 OpenAI 구조화 출력에 그대로 넘긴다.
// 구조화 출력은 "없을 수도 있는 칸"을 허용하지 않으므로, 빈 값은 모두 null로 받는다.
// 개수·순서·원문 위치 같은 내용 검사는 validate.ts에서 한다.

import "server-only";
import { z } from "zod";
import { isAfter, isIsoDate, todayInSeoul } from "../dates";

/* ───────── 요청 모양 ───────── */

const IsoDateSchema = z.string().refine(isIsoDate, "YYYY-MM-DD 형식의 날짜가 아니에요");

const TextSegmentSchema = z.object({
  page: z.number().int().min(1).optional(),
  paragraph: z.number().int().min(1),
  text: z.string().max(20_000),
});

export const ExtractedSourceSchema = z.object({
  // 꼬리표를 어지럽히는 글자(줄바꿈·탭·|·[·])는 브라우저가 바꿔 보내지만, 직접 호출에도 대비해 서버도 막는다
  fileName: z.string().trim().min(1).max(200).regex(/^[^\r\n\t|[\]]+$/, "파일 이름에 쓸 수 없는 글자가 있어요"),
  kind: z.enum(["pdf", "hwpx", "email"]),
  round: z.union([z.literal(1), z.literal(2)]),
  /** OCR로 읽은 파일 표시. 칸을 비워 두면 zod가 지워 버려 AI가 "OCR" 꼬리표를 받지 못한다 */
  ocr: z.boolean().optional(),
  segments: z.array(TextSegmentSchema).min(1).max(5_000),
});

/** POST /api/summarize 요청 */
export const ReplyInputSchema = z.object({
  lawsuitType: z.enum(["fraudulent-transfer", "other"]),
  sources: z.array(ExtractedSourceSchema).min(1).max(30),
  cancellationKnownDate: IsoDateSchema.nullable().refine(
    (d) => d === null || !isAfter(d, todayInSeoul()),
    "취소원인을 안 날은 오늘 이후일 수 없어요",
  ),
});

/* ───────── AI 답 모양 ───────── */

const LocationSchema = z.object({
  fileName: z.string(),
  page: z.number().int().nullable(),
  paragraph: z.number().int().nullable(),
});

const CitedTextSchema = z.object({
  text: z.string(),
  sources: z.array(LocationSchema),
});

/** AI가 돌려주는 회신 정리. 서버가 검사한 뒤 ReplySummary로 바꾼다 */
export const SummaryOutputSchema = z.object({
  identity: z.object({
    caseNumber: z.string().nullable(),
    debtorName: z.string().nullable(),
    beneficiaryNames: z.array(z.string()),
    sources: z.array(LocationSchema),
  }),
  firmName: z.string().nullable(),
  issues: z.array(z.object({ title: z.string(), detail: CitedTextSchema })),
  firmOpinion: CitedTextSchema,
  disposals: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      beneficiary: z.string(),
      subsequentAcquirer: z.string().nullable(),
      property: z.string(),
      legalActDate: z.string().nullable(),
      sources: z.array(LocationSchema),
    }),
  ),
  /** "기타" 유형이면 빈 배열로 받는다 */
  checklist: z.array(
    z.object({
      id: z.number().int(),
      status: z.enum(["present", "not-in-reply", "unclear"]),
      summary: CitedTextSchema,
    }),
  ),
  glossary: z.array(
    z.object({
      term: z.string(),
      explanation: z.string(),
      firstSeen: LocationSchema,
    }),
  ),
  typeMismatchWarning: z.string().nullable(),
});

export type SummaryOutput = z.infer<typeof SummaryOutputSchema>;
export type LocationOutput = z.infer<typeof LocationSchema>;
export type CitedTextOutput = z.infer<typeof CitedTextSchema>;

/* ───────── 초안 ───────── */

/** 화면이 돌려보내는 정리 결과의 글·목록 크기 상한 (비정상적으로 큰 요청을 일찍 거절) */
const Text = z.string().max(20_000);
const MAX_ITEMS = 300;

const SourceLocationSchema = z.object({
  fileName: z.string().max(200),
  page: z.number().int().optional(),
  paragraph: z.number().int().optional(),
});

const CitedSchema = z.object({ text: Text, sources: z.array(SourceLocationSchema).max(MAX_ITEMS) });

/** 화면이 돌려보내는 정리 결과 (검사를 통과했던 ReplySummary) */
const ReplySummarySchema = z.object({
  lawsuitType: z.enum(["fraudulent-transfer", "other"]),
  identity: z.object({
    caseNumber: Text.nullable(),
    debtorName: Text.nullable(),
    beneficiaryNames: z.array(Text).max(MAX_ITEMS),
    needsUserInput: z.boolean(),
    manualLabel: Text.nullable(),
    sources: z.array(SourceLocationSchema).max(MAX_ITEMS),
  }),
  firmName: Text.nullable(),
  issues: z.array(z.object({ title: Text, detail: CitedSchema })).max(MAX_ITEMS),
  firmOpinion: CitedSchema,
  disposals: z
    .array(
      z.object({
        id: Text,
        kind: Text,
        beneficiary: Text,
        subsequentAcquirer: Text.nullable(),
        property: Text,
        legalActDate: IsoDateSchema.nullable(),
        legalActDateUnverified: IsoDateSchema.optional(),
        legalActDateManual: z.boolean().optional(),
        sources: z.array(SourceLocationSchema).max(MAX_ITEMS),
      }),
    )
    .max(MAX_ITEMS),
  checklist: z
    .array(z.object({ id: z.number().int(), status: z.enum(["present", "not-in-reply", "unclear"]), summary: CitedSchema }))
    .max(MAX_ITEMS)
    .nullable(),
  glossary: z.array(z.object({ term: Text, explanation: Text, firstSeen: SourceLocationSchema })).max(MAX_ITEMS),
  typeMismatchWarning: Text.nullable(),
});

/**
 * POST /api/draft 요청. 사해행위취소만, 사건 표시가 정해져 있어야 한다.
 * 제척기간은 화면이 계산한 값을 믿지 않고, 서버가 '안 날'로 다시 계산한다.
 */
export const DraftRequestSchema = z
  .object({
    summary: ReplySummarySchema,
    cancellationKnownDate: IsoDateSchema.nullable().refine(
      (d) => d === null || !isAfter(d, todayInSeoul()),
      "취소원인을 안 날은 오늘 이후일 수 없어요",
    ),
    sources: z.array(ExtractedSourceSchema).min(1).max(30),
  })
  .refine((r) => r.summary.lawsuitType === "fraudulent-transfer", "초안은 사해행위취소 전용이에요")
  .refine((r) => !r.summary.identity.needsUserInput || Boolean(r.summary.identity.manualLabel), "사건 표시가 필요해요");

/** AI가 돌려주는 초안 8항목 (1번 일부·3번·5번은 수익자별) */
export const DraftOutputSchema = z.object({
  debtor: z.string(),
  perBeneficiary: z.array(
    z.object({
      disposalId: z.string(),
      beneficiaryAndProperty: z.string(),
      fraudulentAct: z.string(),
      claimDraft: z.string(),
    }),
  ),
  securedClaim: z.string(),
  deadlineReview: z.string(),
  preservation: z.string(),
  firmOpinionSummary: z.string(),
  attachmentsAndChecks: z.string(),
});

export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/* ───────── 사건정보 대조 ───────── */

/** POST /api/compare 요청 */
export const CompareRequestSchema = z.object({
  summary: ReplySummarySchema,
  sources: z.array(ExtractedSourceSchema).min(1).max(30),
  caseInfo: ExtractedSourceSchema,
});

const CompareSideSchema = z.object({ text: z.string(), sources: z.array(LocationSchema) });

/** AI가 돌려주는 대조 결과 (주제 6개) */
export const CompareOutputSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      result: z.enum(["same", "different", "not-comparable"]),
      replySays: CompareSideSchema,
      courtSays: CompareSideSchema,
    }),
  ),
});

export type CompareOutput = z.infer<typeof CompareOutputSchema>;

/* ───────── OCR ───────── */

/** POST /api/ocr 요청: 쪽 그림(JPEG) 최대 6장. 한 장은 base64 글자 100만 자(약 750KB)까지 */
export const OcrRequestSchema = z.object({
  pages: z
    .array(
      z.object({
        page: z.number().int().min(1).max(2_000),
        image: z
          .string()
          .max(1_000_000)
          .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, "JPEG 그림이 아니에요"),
      }),
    )
    .min(1)
    .max(6),
});

/** AI가 돌려주는 OCR 결과: 쪽마다 문단 목록 */
export const OcrOutputSchema = z.object({
  pages: z.array(z.object({ page: z.number().int(), paragraphs: z.array(z.string()) })),
});

export type OcrOutput = z.infer<typeof OcrOutputSchema>;
