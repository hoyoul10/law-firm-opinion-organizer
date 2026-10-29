// ② 용어 풀이: 회신에 나온 순서, 최대 10개 (Design Ref: §3.1)

import type { GlossaryTerm } from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

export default function Glossary({ glossary }: { glossary: GlossaryTerm[] }) {
  return (
    <div>
      <h3 className="sub-title">용어 풀이</h3>
      {glossary.length === 0 ? (
        <p className="text-base muted">풀이할 법률 용어가 없어요.</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-4 sm:grid-cols-[9rem_1fr]">
          {glossary.map((g) => (
            <div key={g.term} className="contents">
              <dt className="font-bold text-[var(--brand-strong)]">{g.term}</dt>
              <dd className="leading-relaxed">
                {g.explanation}
                <SourceBadge sources={[g.firstSeen]} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
