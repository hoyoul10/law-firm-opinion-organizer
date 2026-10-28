// OpenAI 연결. API 키는 서버에서만 읽는다.
// Design Ref: §7 보안 — 이 파일이 화면 쪽 코드에 섞이면 server-only가 만들 때 막는다

import "server-only";
import OpenAI, { APIConnectionTimeoutError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { ApiErrorCode } from "../api-errors";

const DEFAULT_MODEL = "gpt-5.4-mini-2026-03-17";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
    // 응답이 110초 안에 오지 않으면 끊는다 (API 최대 처리 시간 120초 안에서). medium 생각 수준으로 PDF+이메일 샘플이 40초 가까이 걸려 DESIGN의 50초에서 늘렸다.
    // 다시 요청은 화면의 [다시 시도]에 맡기므로 서버에서는 다시 보내지 않는다 (Design Ref: §5.1-5)
    client = new OpenAI({ apiKey, timeout: 110_000, maxRetries: 0 });
  }
  return client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

type ReasoningEffort = "low" | "medium" | "high";

/**
 * AI가 답하기 전에 얼마나 따져 볼지. 샘플 3 시험에서 기본값은 9초지만 처분행위·점검 상태를 자주 틀렸고,
 * medium은 30초 안팎이지만 정답표와 맞았다. high는 60초를 넘었다. .env의 OPENAI_REASONING_EFFORT로 바꿀 수 있다
 */
function getReasoningEffort(): ReasoningEffort {
  const value = process.env.OPENAI_REASONING_EFFORT;
  return value === "low" || value === "high" ? value : "medium";
}

/** AI 호출 실패. code는 화면 안내 문구와 이어진다 (lib/api-errors.ts) */
export class AiCallError extends Error {
  constructor(public readonly code: Extract<ApiErrorCode, "AI_TIMEOUT" | "AI_FAILED" | "INVALID_AI_OUTPUT">) {
    super(code);
    this.name = "AiCallError";
  }
}

/**
 * AI에게 정해진 JSON 모양으로만 답하게 하고, 그 모양대로 읽은 결과를 돌려준다.
 * OpenAI 쪽에 응답을 보관하지 않는다 (store: false, Design Ref: §7).
 */
export async function requestStructured<S extends z.ZodType>(options: {
  schema: S;
  schemaName: string;
  instructions: string;
  input: string;
}): Promise<z.infer<S>> {
  try {
    const response = await getOpenAI().responses.parse({
      model: getModel(),
      instructions: options.instructions,
      input: options.input,
      text: { format: zodTextFormat(options.schema, options.schemaName) },
      reasoning: { effort: getReasoningEffort() },
      store: false,
    });
    if (response.output_parsed == null) throw new AiCallError("INVALID_AI_OUTPUT");
    return response.output_parsed as z.infer<S>;
  } catch (err) {
    if (err instanceof AiCallError) throw err;
    if (err instanceof APIConnectionTimeoutError) throw new AiCallError("AI_TIMEOUT");
    // 모양이 틀린 JSON을 읽다가 난 오류
    if (err instanceof SyntaxError || (err as Error)?.name === "ZodError") throw new AiCallError("INVALID_AI_OUTPUT");
    throw new AiCallError("AI_FAILED");
  }
}
