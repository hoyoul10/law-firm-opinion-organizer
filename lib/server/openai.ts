// OpenAI 연결. API 키는 서버에서만 읽는다.
// Design Ref: §7 보안 — 이 파일이 화면 쪽 코드에 섞이면 server-only가 만들 때 막는다

import "server-only";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.4-mini-2026-03-17";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
    // 응답이 50초 안에 오지 않으면 끊는다 (API 최대 처리 시간 60초 안에서)
    client = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 1 });
  }
  return client;
}

export function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}
