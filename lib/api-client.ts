// 브라우저 → 서버 API 호출과 오류 안내 문구 변환 (Design Ref: §5.2)

import { API_ERROR_MESSAGES, type ApiErrorBody, type ApiErrorCode } from "./api-errors";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; /** 담당자가 취소해서 멈춘 경우 */ aborted?: boolean };

/**
 * messages로 오류 문구를 이 호출에 맞게 바꿀 수 있다 (예: OCR의 "쪽 그림이 너무 커요")
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
  messages: Partial<Record<ApiErrorCode, string>> = {},
): Promise<ApiResult<T>> {
  const text = (code: ApiErrorCode) => messages[code] ?? API_ERROR_MESSAGES[code];

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal?.aborted) return { ok: false, message: "취소했어요.", aborted: true };
    return { ok: false, message: text("NETWORK") };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as ApiErrorBody | null)?.error?.code;
    if (code && code in API_ERROR_MESSAGES) return { ok: false, message: text(code) };
    // 배포 환경의 시간 초과(504)나 요청이 너무 큰 경우(413)는 우리 서버 답이 아닐 수 있다
    if (res.status === 504) return { ok: false, message: text("AI_TIMEOUT") };
    if (res.status === 413) return { ok: false, message: text("PAYLOAD_TOO_LARGE") };
    return { ok: false, message: text("AI_FAILED") };
  }
  return { ok: true, data: data as T };
}
