// 이메일 본문을 문단으로 나눈다. 빈 줄을 기준으로 나누고 1부터 번호를 매긴다.
// Design Ref: §3.1 ① 이메일 본문, §4.1 원문 위치 표기 단위 ("이메일 본문 N문단")

import { EMAIL_SOURCE_NAME, type ExtractedSource, type ReplyRound } from "../reply-types";

export function splitEmailBody(body: string, round: ReplyRound = 1): ExtractedSource | null {
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  return {
    fileName: EMAIL_SOURCE_NAME,
    kind: "email",
    round,
    segments: paragraphs.map((text, i) => ({ paragraph: i + 1, text })),
  };
}
