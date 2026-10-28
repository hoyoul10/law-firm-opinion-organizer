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
  text: z.string(),
});

export const ExtractedSourceSchema = z.object({
  fileName: z.string().trim().min(1),
  kind: z.enum(["pdf", "hwpx", "email"]),
  round: z.union([z.literal(1), z.literal(2)]),
  segments: z.array(TextSegmentSchema).min(1),
});

/** POST /api/summarize 요청 */
export const ReplyInputSchema = z.object({
  lawsuitType: z.enum(["fraudulent-transfer", "other"]),
  sources: z.array(ExtractedSourceSchema).min(1),
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
