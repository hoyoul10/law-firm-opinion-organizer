// POST /api/draft — 소송 의뢰 초안 8항목 (사해행위취소만)
// Design Ref: §5 — 정리 결과 + 제척기간 + 원문을 받아, 날짜·금액을 원문과 대조한 초안만 돌려준다

import { AiCallError, requestStructured } from "@/lib/server/openai";
import { draftInput, draftInstructions } from "@/lib/server/prompts";
import { errorResponse, logFailure, rejectForeignRequest } from "@/lib/server/respond";
import { DraftOutputSchema, DraftRequestSchema } from "@/lib/server/schemas";
import { validateDraftOutput } from "@/lib/server/validate";
import type { DraftRequest } from "@/lib/reply-types";

export const maxDuration = 120;

/** 비용 방지용 글자 수 상한 (Design Ref: §7) */
const MAX_CHARS = 80_000;

export async function POST(request: Request) {
  const rejected = rejectForeignRequest(request);
  if (rejected) return rejected;

  const parsed = DraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_INPUT");

  const { summary, deadlines, sources } = parsed.data as DraftRequest;
  const input = draftInput(summary, deadlines, sources);
  if (input.length > MAX_CHARS) return errorResponse("PAYLOAD_TOO_LARGE");

  try {
    const output = await requestStructured({
      schema: DraftOutputSchema,
      schemaName: "lawsuit_draft",
      instructions: draftInstructions(),
      input,
    });

    const result = validateDraftOutput(output, summary, deadlines, sources);
    if (!result.ok) {
      logFailure("draft", "INVALID_AI_OUTPUT", { chars: input.length, problems: result.problems.length });
      const response = errorResponse("INVALID_AI_OUTPUT");
      if (process.env.NODE_ENV !== "development") return response;
      const body = await response.json();
      return Response.json({ ...body, problems: result.problems }, { status: response.status });
    }

    return Response.json({ draft: result.draft });
  } catch (err) {
    const code = err instanceof AiCallError ? err.code : "AI_FAILED";
    logFailure("draft", code, { chars: input.length, status: err instanceof AiCallError ? err.status : undefined });
    return errorResponse(code);
  }
}
