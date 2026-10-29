// ② 사해행위취소 점검 10항목. 10개를 항상 모두 보여 준다 (Design Ref: §3.1)
// Plan SC: 점검 항목 100% 표시 (있음 / 회신에 없음 / 불명확)

import {
  CHECKLIST_ITEMS,
  CHECKLIST_STATUS_LABELS,
  NOT_IN_REPLY,
  type ChecklistResult,
  type ChecklistStatus,
} from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

export const STATUS_STYLE: Record<ChecklistStatus, string> = {
  present: "chip chip-ok",
  unclear: "chip chip-warn",
  "not-in-reply": "chip chip-danger",
};

export default function ChecklistTable({ checklist }: { checklist: ChecklistResult[] }) {
  const byId = new Map(checklist.map((c) => [c.id, c]));
  const missing = checklist.filter((c) => c.status !== "present").length;

  return (
    <div>
      <h3 className="sub-title">
        점검 항목 10개{" "}
        {missing > 0 && <span className="text-base font-normal muted">— 확인할 항목 {missing}개</span>}
      </h3>
      <div className="overflow-x-auto">
        <table className="tbl min-w-[560px]">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-36">항목</th>
              <th className="w-28">상태</th>
              <th>회신 내용</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST_ITEMS.map((item) => {
              const result = byId.get(item.id);
              const status = result?.status ?? "not-in-reply";
              return (
                <tr key={item.id}>
                  <td className="muted">{item.id}</td>
                  <td className="font-bold">{item.title}</td>
                  <td>
                    <span className={STATUS_STYLE[status]}>
                      {CHECKLIST_STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className={status === "not-in-reply" ? "muted" : ""}>
                    {result?.summary.text ?? NOT_IN_REPLY}
                    {result && <SourceBadge sources={result.summary.sources} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
