// 브라우저 → 서버 API 호출과 오류 안내 문구 변환 (Design Ref: §5.2)

import { API_ERROR_MESSAGES, type ApiErrorBody } from "./api-errors";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: API_ERROR_MESSAGES.NETWORK };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as ApiErrorBody | null)?.error?.code;
    if (code && code in API_ERROR_MESSAGES) return { ok: false, message: API_ERROR_MESSAGES[code] };
    // 배포 환경의 시간 초과(504)나 요청이 너무 큰 경우(413)는 우리 서버 답이 아닐 수 있다
    if (res.status === 504) return { ok: false, message: API_ERROR_MESSAGES.AI_TIMEOUT };
    if (res.status === 413) return { ok: false, message: API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE };
    return { ok: false, message: API_ERROR_MESSAGES.AI_FAILED };
  }
  return { ok: true, data: data as T };
}
