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
            className="src"
          >
            📍 {label}
          </span>
        );
      })}
    </span>
  );
}
