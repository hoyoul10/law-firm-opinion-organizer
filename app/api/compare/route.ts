// POST /api/compare — 사건정보 대조 (담당자가 [대조 요청]을 눌렀을 때만 호출)
// Design Ref: §13.1 — 정리 결과와 법원 '나의 사건검색' PDF 글자를 주제 6개로 비교한다. 저장하지 않는다

import { AiCallError, requestStructured } from "@/lib/server/openai";
import { compareInput, compareInstructions } from "@/lib/server/prompts";
import { errorResponse, logFailure, rejectForeignRequest } from "@/lib/server/respond";
import { CompareOutputSchema, CompareRequestSchema } from "@/lib/server/schemas";
import { validateCompareOutput } from "@/lib/server/validate";
import type { CompareRequest } from "@/lib/reply-types";

export const maxDuration = 120;

/** 비용 방지용 글자 수 상한. 사건정보는 보통 짧아 정리보다 작게 잡았다 */
const MAX_CHARS = 150_000;

export async function POST(request: Request) {
  const rejected = rejectForeignRequest(request);
  if (rejected) return rejected;

  const parsed = CompareRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_INPUT");

  const { summary, sources, caseInfo } = parsed.data as CompareRequest;
  const input = compareInput(summary, sources, caseInfo);
  if (input.length > MAX_CHARS) return errorResponse("PAYLOAD_TOO_LARGE");

  try {
    const output = await requestStructured({
      schema: CompareOutputSchema,
      schemaName: "case_compare",
      instructions: compareInstructions(),
      input,
    });

    const result = validateCompareOutput(output, sources, caseInfo);
    if (!result.ok) {
      logFailure("compare", "INVALID_AI_OUTPUT", { chars: input.length, problems: result.problems.length });
      const response = errorResponse("INVALID_AI_OUTPUT");
      if (process.env.NODE_ENV !== "development") return response;
      const body = await response.json();
      return Response.json({ ...body, problems: result.problems }, { status: response.status });
    }

    return Response.json({ compare: result.compare });
  } catch (err) {
    const code = err instanceof AiCallError ? err.code : "AI_FAILED";
    logFailure("compare", code, { chars: input.length, status: err instanceof AiCallError ? err.status : undefined });
    return errorResponse(code);
  }
}
