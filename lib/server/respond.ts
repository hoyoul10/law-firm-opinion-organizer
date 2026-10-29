// 서버 API 오류 응답 (Design Ref: §5.2)
// 회신 내용은 로그에 남기지 않는다. 오류 코드와 글자 수만 남긴다 (Design Ref: §7)

import "server-only";
import type { ZodError } from "zod";
import { API_ERROR_MESSAGES, type ApiErrorBody, type ApiErrorCode } from "../api-errors";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_DATE: 400,
  PAYLOAD_TOO_LARGE: 413,
  AI_TIMEOUT: 504,
  AI_FAILED: 502,
  INVALID_AI_OUTPUT: 502,
  NETWORK: 503,
};

export function errorResponse(code: ApiErrorCode): Response {
  const body: ApiErrorBody = { error: { code, message: API_ERROR_MESSAGES[code] } };
  return Response.json(body, { status: STATUS[code] });
}

/** 내용 없이 오류 종류만 기록한다. status는 OpenAI 상태 숫자(401 키 오류, 429 한도 초과 등) */
export function logFailure(
  route: string,
  code: ApiErrorCode,
  detail: { chars?: number; problems?: number; status?: number; pages?: number } = {},
) {
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  console.error(`[${route}] ${code}${parts.length ? " " + parts.join(" ") : ""}`);
}

/**
 * 다른 사이트의 화면에서 몰래 보내는 요청을 막는다 (보안 점검 SEC-001 일부).
 * JSON이 아니거나, 브라우저가 알려 준 출처가 이 서버가 아니면 거절한다.
 * curl 같은 직접 호출은 이것만으로 막을 수 없어 Vercel 접근 보호·요청 횟수 제한이 따로 필요하다.
 */
export function rejectForeignRequest(request: Request): Response | null {
  if (!request.headers.get("content-type")?.includes("application/json")) return errorResponse("INVALID_INPUT");
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host || new URL(origin).host !== host) return errorResponse("INVALID_INPUT");
  }
  return null;
}

/**
 * 요청 모양 검사에 실패한 이유를 화면에 알맞게 알린다.
 * 안 날(날짜) 문제는 날짜 안내로, 글자·문단·자료가 너무 많으면 "너무 길다"로, 그 밖에는 "입력을 확인해 주세요"로.
 */
export function errorFromParse(error: ZodError): Response {
  if (error.issues.some((i) => i.path.join(".").endsWith("cancellationKnownDate"))) return errorResponse("INVALID_DATE");
  if (error.issues.some((i) => i.code === "too_big")) return errorResponse("PAYLOAD_TOO_LARGE");
  return errorResponse("INVALID_INPUT");
}
