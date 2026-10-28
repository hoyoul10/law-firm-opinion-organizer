"use client";

// ① 회신 올리기: 소송 유형, 파일(차수·추출 상태), 이메일 본문(차수), 취소원인을 안 날
// Design Ref: §3.1 — 스캔 PDF·읽지 못한 파일이 하나라도 있으면 정리하기를 잠근다 (PRD: 안내하고 멈춤)

import type { Dispatch, SetStateAction } from "react";
import { extractFile } from "@/lib/extract";
import { LAWSUIT_TYPE_LABELS, type LawsuitType, type ReplyRound } from "@/lib/reply-types";
import FileList, { type UploadedFile } from "./FileList";
import RoundSelect from "./RoundSelect";

export interface InputState {
  lawsuitType: LawsuitType;
  files: UploadedFile[];
  emailBody: string;
  emailRound: ReplyRound;
  cancellationKnownDate: string;
}

export const EMPTY_INPUT: InputState = {
  lawsuitType: "fraudulent-transfer",
  files: [],
  emailBody: "",
  emailRound: 1,
  cancellationKnownDate: "",
};

const ACCEPT = ".pdf,.hwpx";

/** 정리하기를 누를 수 있는지와, 못 누르면 그 이유 */
export function submitBlocker(input: InputState): string | null {
  if (input.files.some((f) => f.result === null)) return "파일을 읽는 중이에요.";
  if (input.files.some((f) => f.result && !f.result.ok)) return "⚠ 표시된 파일을 빼야 정리할 수 있어요.";
  if (input.files.length === 0 && input.emailBody.trim() === "") return "회신 파일이나 이메일 본문을 넣어 주세요.";
  return null;
}

interface Props {
  value: InputState;
  setValue: Dispatch<SetStateAction<InputState>>;
  onSubmit: () => void;
  busy: boolean;
  /** 한국 시간 오늘. 취소원인을 안 날은 이 날 이후를 고를 수 없다 */
  today: string;
}

let nextId = 0;

export default function InputPanel({ value, setValue, onSubmit, busy, today }: Props) {
  const set = <K extends keyof InputState>(key: K, v: InputState[K]) => setValue((prev) => ({ ...prev, [key]: v }));

  const updateFile = (id: string, patch: Partial<UploadedFile>) =>
    setValue((prev) => ({ ...prev, files: prev.files.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const known = new Set(value.files.map((f) => f.file.name));
    const added: UploadedFile[] = Array.from(list)
      .filter((file) => !known.has(file.name))
      .map((file) => ({ id: `f${nextId++}`, file, round: 1, result: null }));
    if (added.length === 0) return;
    setValue((prev) => ({ ...prev, files: [...prev.files, ...added] }));
    for (const f of added) {
      void extractFile(f.file, f.round).then((result) => updateFile(f.id, { result }));
    }
  };

  const changeRound = (id: string, round: ReplyRound) =>
    setValue((prev) => ({
      ...prev,
      files: prev.files.map((f) =>
        f.id !== id ? f : { ...f, round, result: f.result?.ok ? { ...f.result, source: { ...f.result.source, round } } : f.result },
      ),
    }));

  const blocker = submitBlocker(value);

  return (
    <section className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <h2 className="mb-4 text-lg font-semibold">① 회신 올리기</h2>

      <fieldset className="mb-5" disabled={busy}>
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
            if (!busy) addFiles(e.dataTransfer.files);
          }}
        >
          여기로 끌어 놓거나 눌러서 파일 고르기
          <span className="mt-1 text-xs">옛 한글 형식(.hwp)은 PDF로 바꿔서 올려 주세요. 파일은 이 컴퓨터 안에서만 읽어요.</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <FileList
          files={value.files}
          disabled={busy}
          onRoundChange={changeRound}
          onRemove={(id) => setValue((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== id) }))}
        />
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center gap-3">
          <label htmlFor="emailBody" className="text-sm font-medium">
            이메일 본문 (붙여넣기)
          </label>
          <RoundSelect value={value.emailRound} disabled={busy} onChange={(r) => set("emailRound", r)} label="이메일 본문 차수" />
        </div>
        <textarea
          id="emailBody"
          rows={6}
          value={value.emailBody}
          disabled={busy}
          onChange={(e) => set("emailBody", e.target.value)}
          placeholder="법무법인에서 받은 이메일 본문을 그대로 붙여넣으세요"
          className="w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm dark:border-white/20"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="knownDate" className="mb-2 block text-sm font-medium">
          취소원인을 안 날 <span className="font-normal text-zinc-500">(모르면 비워 두세요)</span>
        </label>
        <input
          id="knownDate"
          type="date"
          max={today || undefined}
          value={value.cancellationKnownDate}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            // 오늘 이후 날짜는 받지 않는다 (PRD 예외: 날짜 입력 오류)
            set("cancellationKnownDate", today && v > today ? today : v);
          }}
          className="rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {blocker && !busy && <span className="text-sm text-zinc-500">{blocker}</span>}
        <button
          type="button"
          disabled={busy || blocker !== null}
          onClick={onSubmit}
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "정리하는 중… (30초 안팎)" : "회신 정리하기"}
        </button>
      </div>
    </section>
  );
}
