// POST /api/summarize — 회신 정리
// Design Ref: §5 — ReplyInput을 받아 AI에게 정리를 맡기고, 검사를 통과한 ReplySummary만 돌려준다

import { AiCallError, requestStructured } from "@/lib/server/openai";
import { summarizeInstructions, tagSources } from "@/lib/server/prompts";
import { errorFromParse, errorResponse, logFailure, rejectForeignRequest } from "@/lib/server/respond";
import { ReplyInputSchema, SummaryOutputSchema } from "@/lib/server/schemas";
import { validateSummaryOutput } from "@/lib/server/validate";
import type { ReplyInput } from "@/lib/reply-types";

export const maxDuration = 120;

/** 비용 방지용 글자 수 상한 (Design Ref: §7). 의견서는 길어도 PDF 50장 이하(약 75,000~125,000자)라는 담당자 결정(2026-10-29)에 맞춰 넉넉히 잡았다 */
const MAX_CHARS = 200_000;

export async function POST(request: Request) {
  const rejected = rejectForeignRequest(request);
  if (rejected) return rejected;

  const parsed = ReplyInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorFromParse(parsed.error);

  const input: ReplyInput = parsed.data;
  const tagged = tagSources(input.sources);
  if (tagged.length > MAX_CHARS) return errorResponse("PAYLOAD_TOO_LARGE");

  try {
    const output = await requestStructured({
      schema: SummaryOutputSchema,
      schemaName: "reply_summary",
      instructions: summarizeInstructions(input.lawsuitType),
      input: tagged,
    });

    const result = validateSummaryOutput(output, input);
    if (!result.ok) {
      logFailure("summarize", "INVALID_AI_OUTPUT", { chars: tagged.length, problems: result.problems.length });
      // 개발 중에는 어떤 검사에 걸렸는지 화면 개발자 도구에서 볼 수 있게 함께 돌려준다 (서버 로그에는 남기지 않음)
      const response = errorResponse("INVALID_AI_OUTPUT");
      if (process.env.NODE_ENV !== "development") return response;
      const body = await response.json();
      return Response.json({ ...body, problems: result.problems }, { status: response.status });
    }

    return Response.json({ summary: result.summary });
  } catch (err) {
    const code = err instanceof AiCallError ? err.code : "AI_FAILED";
    logFailure("summarize", code, { chars: tagged.length, status: err instanceof AiCallError ? err.status : undefined });
    return errorResponse(code);
  }
}
