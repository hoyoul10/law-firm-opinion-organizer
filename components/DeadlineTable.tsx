// ② 제척기간 표: 처분행위별 + 가장 짧은 기한 경고 (Design Ref: §3.1)
// 90일 이하 노랑, 0일 이하 빨강, 날짜가 없으면 회색 [확인 필요]. 계산은 lib/deadline.ts (코드)

import { deadlineMessage } from "@/lib/labels";
import { NEEDS_CHECK, type DeadlineLevel, type DeadlineSummary, type Disposal } from "@/lib/reply-types";

export const LEVEL_STYLE: Record<DeadlineLevel, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  expired: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "needs-check": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

interface Props {
  deadlines: DeadlineSummary;
  disposals: Disposal[];
  /** 법률행위일을 담당자가 직접 넣는다(빈 값이면 지움). 오늘 이후 날짜는 막는다 */
  onSetLegalActDate: (disposalId: string, date: string | null) => void;
  today: string;
}

export default function DeadlineTable({ deadlines, disposals, onSetLegalActDate, today }: Props) {
  const byId = new Map(disposals.map((d) => [d.id, d]));
  const { shortest } = deadlines;

  return (
    <div>
      <h3 className="mb-2 font-semibold">제척기간</h3>
      {disposals.length === 0 ? (
        <p className={`rounded-lg px-4 py-3 text-sm ${LEVEL_STYLE["needs-check"]}`}>
          처분행위를 찾지 못했어요 {NEEDS_CHECK}
        </p>
      ) : (
        <>
          {shortest && (
            <p className={`mb-3 rounded-lg px-4 py-3 text-sm font-semibold ${LEVEL_STYLE[shortest.level]}`}>
              {shortest.level === "expired" ? "🔴 " : shortest.level === "warning" ? "⚠ " : ""}
              가장 짧은 기한: {deadlineMessage(shortest)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/10">
                  <th className="py-2">처분행위</th>
                  <th className="py-2">법률행위일</th>
                  <th className="py-2">1년 기한</th>
                  <th className="py-2">5년 기한</th>
                  <th className="py-2">남은 날</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.perDisposal.map((r, i) => {
                  const d = byId.get(r.disposalId);
                  return (
                    <tr key={r.disposalId} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-2">
                        {i + 1}. {d?.kind} · {d?.beneficiary}
                        {d?.subsequentAcquirer && <span className="text-zinc-500"> (전득자 {d.subsequentAcquirer})</span>}
                      </td>
                      <td className="py-2">
                        {d?.legalActDate ? (
                          <>
                            {d.legalActDate}
                            {d.legalActDateManual && (
                              <>
                                <span className="ml-1 text-xs text-zinc-500">(직접 입력)</span>
                                <button type="button" onClick={() => onSetLegalActDate(r.disposalId, null)} className="ml-2 text-xs text-zinc-500 underline">
                                  지우기
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="block space-y-1">
                            <span>{NEEDS_CHECK}</span>
                            {d?.legalActDateUnverified && (
                              <span className="block text-xs text-amber-800 dark:text-amber-300">
                                AI가 읽은 날짜 {d.legalActDateUnverified}를 근거 문단에서 확인하지 못해 비웠어요. 원문을 보고 맞으면 직접 입력해 주세요.
                              </span>
                            )}
                            <input
                              type="date"
                              max={today}
                              aria-label={`${i + 1}번 처분행위 법률행위일 직접 입력`}
                              onChange={(e) => onSetLegalActDate(r.disposalId, e.target.value || null)}
                              className="block rounded border border-black/20 px-2 py-1 text-xs dark:border-white/25 dark:bg-zinc-900"
                            />
                          </span>
                        )}
                      </td>
                      <td className="py-2">{r.oneYearEnd ?? "안 날 미입력"}</td>
                      <td className="py-2">{r.fiveYearEnd ?? NEEDS_CHECK}</td>
                      <td className="py-2">
                        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${LEVEL_STYLE[r.level]}`}>
                          {r.daysLeft === null ? NEEDS_CHECK : `${r.daysLeft}일`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
