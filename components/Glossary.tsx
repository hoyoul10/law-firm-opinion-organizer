// ② 용어 풀이: 회신에 나온 순서, 최대 10개 (Design Ref: §3.1)

import type { GlossaryTerm } from "@/lib/reply-types";
import SourceBadge from "./SourceBadge";

export default function Glossary({ glossary }: { glossary: GlossaryTerm[] }) {
  return (
    <div>
      <h3 className="mb-2 font-semibold">용어 풀이</h3>
      {glossary.length === 0 ? (
        <p className="text-sm text-zinc-500">풀이할 법률 용어가 없어요.</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          {glossary.map((g) => (
            <div key={g.term} className="contents">
              <dt className="font-medium">{g.term}</dt>
              <dd className="leading-relaxed text-zinc-700 dark:text-zinc-300">
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
