// ② 쟁점과 법무법인 의견. 모든 줄에 원문 위치를 붙인다 (Design Ref: §3.1)

import { NOT_IN_REPLY, type ReplySummary } from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

export default function IssuesAndOpinion({ summary }: { summary: ReplySummary }) {
  const { issues, firmOpinion } = summary;
  return (
    <div className="space-y-5">
      <div>
        <h3 className="sub-title">법무법인 의견</h3>
        <p className={`leading-relaxed ${firmOpinion.text === NOT_IN_REPLY ? "muted" : ""}`}>
          {firmOpinion.text}
          <SourceBadge sources={firmOpinion.sources} />
        </p>
      </div>

      <div>
        <h3 className="sub-title">쟁점</h3>
        {issues.length === 0 ? (
          <p className="text-base muted">{NOT_IN_REPLY}</p>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed">
            {issues.map((issue, i) => (
              <li key={i}>
                <span className="font-bold">{issue.title}</span>
                {" — "}
                {issue.detail.text}
                <SourceBadge sources={issue.detail.sources} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
