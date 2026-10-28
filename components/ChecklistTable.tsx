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
  present: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  unclear: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "not-in-reply": "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export default function ChecklistTable({ checklist }: { checklist: ChecklistResult[] }) {
  const byId = new Map(checklist.map((c) => [c.id, c]));
  const missing = checklist.filter((c) => c.status !== "present").length;

  return (
    <div>
      <h3 className="mb-2 font-semibold">
        점검 항목 10개{" "}
        {missing > 0 && <span className="text-sm font-normal text-zinc-500">— 확인할 항목 {missing}개</span>}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/10">
              <th className="w-8 py-2">#</th>
              <th className="w-40 py-2">항목</th>
              <th className="w-24 py-2">상태</th>
              <th className="py-2">회신 내용</th>
            </tr>
          </thead>
          <tbody>
            {CHECKLIST_ITEMS.map((item) => {
              const result = byId.get(item.id);
              const status = result?.status ?? "not-in-reply";
              return (
                <tr key={item.id} className="border-b border-black/5 align-top dark:border-white/5">
                  <td className="py-2 text-zinc-500">{item.id}</td>
                  <td className="py-2 font-medium">{item.title}</td>
                  <td className="py-2">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
                      {CHECKLIST_STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className={`py-2 leading-relaxed ${status === "not-in-reply" ? "text-zinc-400" : ""}`}>
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
