// 화면에서 쓰는 "오늘" (한국 시간).
// Design Ref: §4.2 — 개발 모드에서만 주소 뒤 ?today=YYYY-MM-DD로 바꿀 수 있다 (정답표 확인용)

import { isIsoDate, todayInSeoul } from "./dates";
import type { IsoDate } from "./reply-types";

export function getToday(): IsoDate {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const override = new URLSearchParams(window.location.search).get("today");
    if (override && isIsoDate(override)) return override;
  }
  return todayInSeoul();
}
