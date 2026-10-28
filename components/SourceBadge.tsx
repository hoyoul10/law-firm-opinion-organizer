// 📍 원문 위치 표시 (Design Ref: §4.1 — PDF는 "쪽 + 문단", 그 외는 "문단")

import { formatLocation } from "@/lib/labels";
import type { SourceLocation } from "@/lib/reply-types";

export default function SourceBadge({ sources }: { sources: SourceLocation[] }) {
  if (sources.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {sources.map((loc) => {
        const label = formatLocation(loc);
        return (
          <span
            key={label}
            className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            📍 {label}
          </span>
        );
      })}
    </span>
  );
}
