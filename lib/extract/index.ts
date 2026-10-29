// 파일 종류에 맞는 글자 추출을 고른다 (브라우저에서만)
// 읽는 모듈을 불러오지 못하는 등 어떤 오류가 나도 "읽는 중…"에 멈추지 않고 실패 결과로 돌려준다

import type { ReplyRound } from "../reply-types";
import { safeFileName } from "./shared";
import type { ExtractResult } from "./types";

/** fileName은 화면과 원문 위치에 쓰는 이름이다. 같은 이름 파일이 여러 개면 "이름 (2).pdf"처럼 구분한 이름을 넘긴다 */
export async function extractFile(file: File, round: ReplyRound, fileName: string = file.name): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  fileName = safeFileName(fileName);
  try {
    if (name.endsWith(".pdf")) {
      const { extractPdf } = await import("./pdf");
      return await extractPdf(file, round, fileName);
    }
    if (name.endsWith(".hwpx")) {
      const { extractHwpx } = await import("./hwpx");
      return await extractHwpx(file, round, fileName);
    }
  } catch {
    return { ok: false, code: "EXTRACT_FAILED" };
  }
  return { ok: false, code: "UNSUPPORTED" };
}
