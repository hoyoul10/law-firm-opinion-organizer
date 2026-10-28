"use client";

// ① 회신 올리기: 소송 유형, 파일, 이메일 본문, 취소원인을 안 날
// Design Ref: §3.1 — 파일 글자 추출(PLAN 11·12)과 날짜 제한(PLAN 18)은 다음 모듈에서 붙인다

import { LAWSUIT_TYPE_LABELS, type LawsuitType } from "@/lib/reply-types";

export interface InputState {
  lawsuitType: LawsuitType;
  files: File[];
  emailBody: string;
  cancellationKnownDate: string;
}

export const EMPTY_INPUT: InputState = {
  lawsuitType: "fraudulent-transfer",
  files: [],
  emailBody: "",
  cancellationKnownDate: "",
};

const ACCEPT = ".pdf,.hwpx";

interface Props {
  value: InputState;
  onChange: (next: InputState) => void;
  onSubmit: () => void;
  busy: boolean;
}

export default function InputPanel({ value, onChange, onSubmit, busy }: Props) {
  const set = <K extends keyof InputState>(key: K, v: InputState[K]) => onChange({ ...value, [key]: v });

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const known = new Set(value.files.map((f) => f.name));
    set("files", [...value.files, ...Array.from(list).filter((f) => !known.has(f.name))]);
  };

  const canSubmit = !busy && (value.files.length > 0 || value.emailBody.trim() !== "");

  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold">① 회신 올리기</h2>

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium">소송 유형</legend>
        <div className="flex gap-6">
          {(Object.keys(LAWSUIT_TYPE_LABELS) as LawsuitType[]).map((type) => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="radio"
                name="lawsuitType"
                checked={value.lawsuitType === type}
                onChange={() => set("lawsuitType", type)}
              />
              {LAWSUIT_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-5">
        <p className="mb-2 text-sm font-medium">회신 파일 (PDF·.hwpx, 여러 개 가능)</p>
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-black/15 px-4 py-6 text-sm text-zinc-500 hover:bg-black/[.02] dark:border-white/20 dark:hover:bg-white/[.03]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          여기로 끌어 놓거나 눌러서 파일 고르기
          <span className="mt-1 text-xs">옛 한글 형식(.hwp)은 PDF로 바꿔서 올려 주세요</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {value.files.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {value.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-2 rounded bg-black/[.03] px-3 py-1.5 dark:bg-white/[.05]">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-zinc-500 hover:text-red-600"
                  onClick={() => set("files", value.files.filter((x) => x !== f))}
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-5">
        <label htmlFor="emailBody" className="mb-2 block text-sm font-medium">
          이메일 본문 (붙여넣기)
        </label>
        <textarea
          id="emailBody"
          rows={6}
          value={value.emailBody}
          onChange={(e) => set("emailBody", e.target.value)}
          placeholder="법무법인에서 받은 이메일 본문을 그대로 붙여넣으세요"
          className="w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm dark:border-white/20"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="knownDate" className="mb-2 block text-sm font-medium">
          취소원인을 안 날
        </label>
        <input
          id="knownDate"
          type="date"
          value={value.cancellationKnownDate}
          onChange={(e) => set("cancellationKnownDate", e.target.value)}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "정리하는 중…" : "회신 정리하기"}
        </button>
      </div>
    </section>
  );
}
