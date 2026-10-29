// 글자 추출에서 함께 쓰는 규칙 (브라우저·서버 공용, 다른 모듈을 불러오지 않는다)

/** "- 1 / 3 -", "2", "3쪽" 같은 쪽 번호만 있는 줄 */
export const PAGE_NUMBER = /^[-–\s]*\d+\s*(\/\s*\d+)?\s*(쪽|page)?[-–\s]*$/i;

/**
 * 파일 이름에서 AI에게 보내는 꼬리표 `[이름 | 차수 | 쪽 | 문단]`를 어지럽힐 수 있는 글자(줄바꿈·탭·`|`·`[`·`]`)를 `_`로 바꾼다.
 * 윈도우 파일 이름에도 `[최종]` 같은 글자가 흔해서 올리는 것을 막지 않고 이름만 고친다.
 */
export function safeFileName(name: string): string {
  const safe = name.replace(/[\r\n\t|[\]]/g, "_").trim() || "파일";
  if (safe.length <= MAX_FILE_NAME) return safe;
  // 서버 상한(200자)을 넘으면 확장자는 남기고 앞부분을 줄인다
  const dot = safe.lastIndexOf(".");
  const ext = dot > 0 && safe.length - dot <= 10 ? safe.slice(dot) : "";
  return safe.slice(0, MAX_FILE_NAME - ext.length) + ext;
}

/** 서버가 받는 파일 이름 최대 글자 수 (lib/server/schemas.ts와 같게) */
const MAX_FILE_NAME = 200;
