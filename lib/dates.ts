// 날짜 도우미. 날짜는 모두 "YYYY-MM-DD" 문자열로 다루고, 계산할 때만 UTC 기준 숫자로 바꾼다.
// Design Ref: §4.2 — "오늘"은 한국 시간 기준

import type { IsoDate } from "./reply-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" 형식이면서 실제로 있는 날짜인지 */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/** 한국 시간 기준 오늘 날짜 */
export function todayInSeoul(now: Date = new Date()): IsoDate {
  // en-CA 형식이 YYYY-MM-DD로 나온다
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function parts(date: IsoDate): [number, number, number] {
  if (!isIsoDate(date)) throw new Error(`날짜 형식이 아니에요: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return [y, m, d];
}

function toUtc(date: IsoDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** to - from (일). to가 앞이면 음수 */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** a가 b보다 늦은 날짜인지 */
export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return toUtc(a) > toUtc(b);
}

/**
 * 기산일부터 n년 기간의 마지막 날 (민법 제160조).
 * - 기산일에 해당하는 n년 뒤 날짜의 전날에 끝난다.
 * - n년 뒤 그 달에 해당하는 날이 없으면 그 달의 말일에 끝난다.
 */
export function yearPeriodEnd(startDate: IsoDate, years: number): IsoDate {
  const [y, m, d] = parts(startDate);
  const targetYear = y + years;
  const lastDay = daysInMonth(targetYear, m);
  if (d > lastDay) {
    return fromUtc(Date.UTC(targetYear, m - 1, lastDay));
  }
  return addDays(fromUtc(Date.UTC(targetYear, m - 1, d)), -1);
}
