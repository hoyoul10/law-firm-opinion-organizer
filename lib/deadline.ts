// 사해행위취소 제척기간 계산. AI가 아니라 코드로 계산한다 (CLAUDE.md 6장).
// Design Ref: §1 원칙 3 / Plan SC: 제척기간 남은 일수 표시
//
// - 취소원인을 안 날부터 1년, 법률행위가 있은 날부터 5년 (민법 제406조 제2항)
// - 첫날은 세지 않으므로 다음 날부터 센다 (민법 제157조)
// - 마지막 날이 토요일·공휴일이면 다음 날로 미뤄지지만(민법 제161조), 여기서는 반영하지 않는다.
//   기한을 늦게 잡는 것보다 이르게 잡는 쪽이 안전하기 때문이다.

import { addDays, daysBetween, yearPeriodEnd } from "./dates";
import {
  DEADLINE_WARNING_DAYS,
  type DeadlineLevel,
  type DeadlineResult,
  type DeadlineSummary,
  type Disposal,
  type IsoDate,
} from "./reply-types";

function periodEnd(eventDate: IsoDate | null, years: number): IsoDate | null {
  return eventDate ? yearPeriodEnd(addDays(eventDate, 1), years) : null;
}

function levelOf(daysLeft: number | null): DeadlineLevel {
  if (daysLeft === null) return "needs-check";
  if (daysLeft <= 0) return "expired";
  if (daysLeft <= DEADLINE_WARNING_DAYS) return "warning";
  return "ok";
}

/**
 * 처분행위 1건의 제척기간.
 * - 두 날짜(안 날, 법률행위 일자)가 모두 있으면 먼저 끝나는 기한으로 계산한다.
 * - '안 날'이 없어도 5년 기한이 이미 지났으면 경과로 본다 (담당자 결정 2026-10-29).
 *   안 날이 언제든 5년이 지났으면 어느 쪽이든 기한이 지난 것이기 때문이다.
 * - 안 날이 없고 5년 기한이 아직 안 지났으면 1년 기한이 먼저 올 수 있어 계산하지 않고 [확인 필요]로 둔다.
 * Plan SC: 31
 */
export function computeDeadline(
  disposal: Pick<Disposal, "id" | "legalActDate">,
  cancellationKnownDate: IsoDate | null,
  today: IsoDate,
): DeadlineResult {
  const oneYearEnd = periodEnd(cancellationKnownDate, 1);
  const fiveYearEnd = periodEnd(disposal.legalActDate, 5);

  let deadline: IsoDate | null = null;
  let daysLeft: number | null = null;
  let fiveYearOnly = false;
  if (oneYearEnd && fiveYearEnd) {
    deadline = oneYearEnd < fiveYearEnd ? oneYearEnd : fiveYearEnd;
    daysLeft = daysBetween(today, deadline);
  } else if (!oneYearEnd && fiveYearEnd && daysBetween(today, fiveYearEnd) <= 0) {
    deadline = fiveYearEnd;
    daysLeft = daysBetween(today, fiveYearEnd);
    fiveYearOnly = true;
  }

  return {
    disposalId: disposal.id,
    oneYearEnd,
    fiveYearEnd,
    deadline,
    daysLeft,
    fiveYearOnly,
    level: levelOf(daysLeft),
  };
}

/** 처분행위마다 따로 계산하고, 가장 짧은 것을 경고 기준으로 고른다 */
export function computeDeadlines(
  disposals: Pick<Disposal, "id" | "legalActDate">[],
  cancellationKnownDate: IsoDate | null,
  today: IsoDate,
): DeadlineSummary {
  const perDisposal = disposals.map((d) => computeDeadline(d, cancellationKnownDate, today));

  const computed = perDisposal.filter((r) => r.daysLeft !== null);
  const shortest =
    computed.length > 0
      ? computed.reduce((min, r) => (r.daysLeft! < min.daysLeft! ? r : min))
      : (perDisposal[0] ?? null);

  return { perDisposal, shortest };
}
