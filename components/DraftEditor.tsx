"use client";

// ③ 소송 의뢰 초안 8항목 편집 (Design Ref: §3.1 ③)
// 1번 일부·3번·5번은 수익자마다 반복. 담당자가 모든 칸을 직접 고칠 수 있다

import { draftSections, updateDraftField } from "@/lib/draft";
import { NEEDS_CHECK, type Disposal, type LawsuitDraft } from "@/lib/reply-types";

interface Props {
  draft: LawsuitDraft;
  disposals: Disposal[];
  onChange: (draft: LawsuitDraft) => void;
}

export default function DraftEditor({ draft, disposals, onChange }: Props) {
  return (
    <div className="space-y-5">
      {draftSections(draft, disposals).map((section) => (
        <div key={section.no}>
          <h3 className="mb-2 font-semibold">
            {section.no}. {section.title}
          </h3>
          <div className="space-y-2">
            {section.fields.map((f) => {
              const id = `draft-${section.no}-${"index" in f.path ? f.path.index : "main"}-${f.path.key}`;
              const needsCheck = f.text.includes(NEEDS_CHECK);
              return (
                <div key={id}>
                  {f.label && (
                    <label htmlFor={id} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {f.label}
                    </label>
                  )}
                  <textarea
                    id={id}
                    aria-label={f.label ? `${section.no}. ${section.title} ${f.label}` : `${section.no}. ${section.title}`}
                    value={f.text}
                    rows={Math.min(8, Math.max(2, Math.ceil(f.text.length / 70) + f.text.split("\n").length - 1))}
                    onChange={(e) => onChange(updateDraftField(draft, f.path, e.target.value))}
                    className={`w-full rounded-lg border bg-transparent p-3 text-sm leading-relaxed ${
                      needsCheck && section.no !== 8
                        ? "border-amber-400 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/30"
                        : "border-black/15 dark:border-white/20"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
