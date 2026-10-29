// 파일 글자 추출 결과 (브라우저)
// Design Ref: §5.2 — 브라우저 오류 SCAN_PDF, EXTRACT_FAILED

import type { ExtractedSource } from "../reply-types";

export type ExtractErrorCode = "SCAN_PDF" | "EXTRACT_FAILED" | "UNSUPPORTED" | "OCR_FAILED";

export type ExtractResult =
  | { ok: true; source: ExtractedSource; pages?: number; chars: number }
  | { ok: false; code: ExtractErrorCode; pages?: number; /** 서버가 알려 준 이유 (OCR 실패 때) */ message?: string };

export const EXTRACT_ERROR_MESSAGES: Record<ExtractErrorCode, string> = {
  SCAN_PDF: "글자를 읽을 수 없는 PDF예요 (스캔한 그림일 수 있어요). [OCR로 읽기]를 누르거나 이 파일을 빼야 정리할 수 있어요.",
  OCR_FAILED: "OCR로 글자를 읽지 못했어요.",
  EXTRACT_FAILED: "파일을 열지 못했어요 (손상되었거나, 암호가 걸렸거나, 너무 큰 파일일 수 있어요).",
  UNSUPPORTED: "PDF 또는 .hwpx만 올릴 수 있어요. 옛 한글(.hwp)은 PDF로 바꿔서 올려 주세요.",
};
