// POST /api/summarize — 회신 정리
// 모듈 1(PLAN 7) 단계: 이메일 본문을 받아 AI가 한 문장으로 답하는지만 확인한다.
// 모듈 2에서 ReplyInput을 받아 ReplySummary를 돌려주도록 바뀐다.

import { APIConnectionTimeoutError } from "openai";
import { z } from "zod";
import { API_ERROR_MESSAGES, type ApiErrorBody, type ApiErrorCode } from "@/lib/api-errors";
import { getModel, getOpenAI } from "@/lib/server/openai";

export const maxDuration = 60;

const MAX_CHARS = 50_000;

const RequestSchema = z.object({
  emailBody: z.string().trim().min(1),
});

function fail(code: ApiErrorCode, status: number) {
  const body: ApiErrorBody = { error: { code, message: API_ERROR_MESSAGES[code] } };
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("INVALID_INPUT", 400);

  const { emailBody } = parsed.data;
  if (emailBody.length > MAX_CHARS) return fail("PAYLOAD_TOO_LARGE", 413);

  try {
    const response = await getOpenAI().responses.create({
      model: getModel(),
      instructions:
        "너는 법무법인 검토회신을 읽는 도우미다. 회신의 핵심을 한국어 한 문장으로 요약한다. 회신에 없는 내용은 지어내지 않는다.",
      input: emailBody,
    });
    return Response.json({ answer: response.output_text.trim() });
  } catch (err) {
    // 회신 내용은 로그에 남기지 않는다. 오류 종류와 글자 수만 남긴다
    const timedOut = err instanceof APIConnectionTimeoutError;
    console.error(`[summarize] ${timedOut ? "AI_TIMEOUT" : "AI_FAILED"} chars=${emailBody.length} type=${(err as Error)?.name}`);
    return timedOut ? fail("AI_TIMEOUT", 504) : fail("AI_FAILED", 502);
  }
}
