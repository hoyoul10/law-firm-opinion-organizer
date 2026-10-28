// 파일 종류에 맞는 글자 추출을 고른다 (브라우저에서만)

import type { ReplyRound } from "../reply-types";
import type { ExtractResult } from "./types";

export async function extractFile(file: File, round: ReplyRound): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { extractPdf } = await import("./pdf");
    return extractPdf(file, round);
  }
  if (name.endsWith(".hwpx")) {
    const { extractHwpx } = await import("./hwpx");
    return extractHwpx(file, round);
  }
  return { ok: false, code: "UNSUPPORTED" };
}
