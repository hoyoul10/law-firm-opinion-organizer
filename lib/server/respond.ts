// 서버 API 오류 응답 (Design Ref: §5.2)
// 회신 내용은 로그에 남기지 않는다. 오류 코드와 글자 수만 남긴다 (Design Ref: §7)

import "server-only";
import { API_ERROR_MESSAGES, type ApiErrorBody, type ApiErrorCode } from "../api-errors";

const STATUS: Record<ApiErrorCode, number> = {
  INVALID_INPUT: 400,
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

/** 내용 없이 오류 종류만 기록한다 */
export function logFailure(route: string, code: ApiErrorCode, detail: { chars?: number; problems?: number } = {}) {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${v}`);
  console.error(`[${route}] ${code}${parts.length ? " " + parts.join(" ") : ""}`);
}
