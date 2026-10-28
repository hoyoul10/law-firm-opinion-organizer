// 서버 API 오류 코드와 화면 안내 문구 (Design Ref: §5.2)

export type ApiErrorCode =
  | "INVALID_INPUT"
  | "PAYLOAD_TOO_LARGE"
  | "AI_TIMEOUT"
  | "AI_FAILED"
  | "INVALID_AI_OUTPUT"
  | "NETWORK";

export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  INVALID_INPUT: "입력을 확인해 주세요.",
  PAYLOAD_TOO_LARGE: "회신이 너무 길어요. 파일을 나눠 올려 주세요.",
  AI_TIMEOUT: "AI 응답이 너무 늦어요. 다시 시도해 주세요.",
  AI_FAILED: "AI 처리에 실패했어요. 다시 시도해 주세요.",
  INVALID_AI_OUTPUT: "결과가 불완전해서 보여 드리지 않았어요. 다시 시도해 주세요.",
  NETWORK: "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.",
};

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}
