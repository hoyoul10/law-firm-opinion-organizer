// ② 제척기간 표: 처분행위별 + 가장 짧은 기한 경고 (Design Ref: §3.1)
// 90일 이하 노랑, 0일 이하 빨강, 날짜가 없으면 회색 [확인 필요]. 계산은 lib/deadline.ts (코드)

import { deadlineMessage } from "@/lib/labels";
import { NEEDS_CHECK, type DeadlineLevel, type DeadlineSummary, type Disposal } from "@/lib/reply-types";

export const LEVEL_STYLE: Record<DeadlineLevel, string> = {
  ok: "notice notice-ok",
  warning: "notice notice-warn",
  expired: "notice notice-danger",
  "needs-check": "notice notice-neutral",
};

const LEVEL_CHIP: Record<DeadlineLevel, string> = {
  ok: "chip chip-ok",
  warning: "chip chip-warn",
  expired: "chip chip-danger",
  "needs-check": "chip chip-neutral",
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
      <h3 className="sub-title">제척기간</h3>
      {disposals.length === 0 ? (
        <p className={LEVEL_STYLE["needs-check"]}>
          처분행위를 찾지 못했어요 {NEEDS_CHECK}
        </p>
      ) : (
        <>
          {shortest && (
            <p className={`${LEVEL_STYLE[shortest.level]} mb-3 !text-base font-bold`}>
              {shortest.level === "expired" ? "🔴 " : shortest.level === "warning" ? "⚠ " : ""}
              가장 짧은 기한: {deadlineMessage(shortest)}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="tbl min-w-[640px]">
              <thead>
                <tr>
                  <th>처분행위</th>
                  <th>법률행위일</th>
                  <th>1년 기한</th>
                  <th>5년 기한</th>
                  <th>남은 날</th>
                </tr>
              </thead>
              <tbody>
                {deadlines.perDisposal.map((r, i) => {
                  const d = byId.get(r.disposalId);
                  return (
                    <tr key={r.disposalId}>
                      <td>
                        {i + 1}. {d?.kind} · {d?.beneficiary}
                        {d?.subsequentAcquirer && <span className="muted"> (전득자 {d.subsequentAcquirer})</span>}
                      </td>
                      <td>
                        {d?.legalActDate ? (
                          <>
                            {d.legalActDate}
                            {d.legalActDateManual && (
                              <>
                                <span className="ml-1 text-sm muted">(직접 입력)</span>
                                <button type="button" onClick={() => onSetLegalActDate(r.disposalId, null)} className="btn-link ml-2">
                                  지우기
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="block space-y-1">
                            <span>{NEEDS_CHECK}</span>
                            {d?.legalActDateUnverified && (
                              <span className="block text-sm text-[var(--warn-fg)]">
                                AI가 읽은 날짜 {d.legalActDateUnverified}를 근거 문단에서 확인하지 못해 비웠어요. 원문을 보고 맞으면 직접 입력해 주세요.
                              </span>
                            )}
                            <input
                              type="date"
                              max={today}
                              aria-label={`${i + 1}번 처분행위 법률행위일 직접 입력`}
                              onChange={(e) => onSetLegalActDate(r.disposalId, e.target.value || null)}
                              className="input input-inline !px-2 !py-1 !text-sm"
                            />
                          </span>
                        )}
                      </td>
                      <td>{r.oneYearEnd ?? "안 날 미입력"}</td>
                      <td>{r.fiveYearEnd ?? NEEDS_CHECK}</td>
                      <td>
                        <span className={LEVEL_CHIP[r.level]}>
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
