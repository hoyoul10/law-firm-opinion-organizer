// POST /api/summarize — 회신 정리
// 지금은 모듈 1(PLAN 7)의 연결 확인 단계: 이메일 본문을 받아 AI가 한 문장으로 답한다.
// PLAN 9에서 ReplyInput을 받아 requestStructured + validateSummaryOutput으로 ReplySummary를 돌려주도록 바뀐다.

import { z } from "zod";
import { getModel, getOpenAI } from "@/lib/server/openai";
import { errorResponse, logFailure } from "@/lib/server/respond";
import { APIConnectionTimeoutError } from "openai";

export const maxDuration = 60;

const MAX_CHARS = 50_000;

const RequestSchema = z.object({
  emailBody: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_INPUT");

  const { emailBody } = parsed.data;
  if (emailBody.length > MAX_CHARS) return errorResponse("PAYLOAD_TOO_LARGE");

  try {
    const response = await getOpenAI().responses.create({
      model: getModel(),
      instructions:
        "너는 법무법인 검토회신을 읽는 도우미다. 회신의 핵심을 한국어 한 문장으로 요약한다. 회신에 없는 내용은 지어내지 않는다.",
      input: emailBody,
      store: false,
    });
    return Response.json({ answer: response.output_text.trim() });
  } catch (err) {
    const code = err instanceof APIConnectionTimeoutError ? "AI_TIMEOUT" : "AI_FAILED";
    logFailure("summarize", code, { chars: emailBody.length });
    return errorResponse(code);
  }
}
