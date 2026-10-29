"use client";

// ① 회신 올리기: 소송 유형, 파일(차수·추출 상태), 이메일 본문(차수), 취소원인을 안 날
// Design Ref: §3.1 — 스캔 PDF·읽지 못한 파일이 하나라도 있으면 정리하기를 잠근다 (PRD: 안내하고 멈춤)

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { extractFile } from "@/lib/extract";
import { ocrPdf } from "@/lib/extract/ocr";
import { safeFileName } from "@/lib/extract/shared";
import type { ExtractResult } from "@/lib/extract/types";
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
  if (input.files.some((f) => f.ocr)) return "OCR로 읽는 중이에요.";
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
  /** 사건정보 대조 중처럼, 입력은 바꿀 수 있지만 새로 정리는 못 하게 막을 때 */
  locked?: boolean;
  /** 한국 시간 오늘. 취소원인을 안 날은 이 날 이후를 고를 수 없다 */
  today: string;
}

let nextId = 0;

/** 읽는 사이에 담당자가 차수를 바꿨을 수 있으니, 읽기 결과에는 지금 고른 차수를 넣는다 */
function withRound(result: ExtractResult, round: ReplyRound): ExtractResult {
  return result.ok ? { ...result, source: { ...result.source, round } } : result;
}

/** "회신.pdf" → "회신 (2).pdf", 이미 있으면 (3), (4)… */
function uniqueName(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

export default function InputPanel({ value, setValue, onSubmit, busy, locked = false, today }: Props) {
  const set = <K extends keyof InputState>(key: K, v: InputState[K]) => setValue((prev) => ({ ...prev, [key]: v }));
  const [notice, setNotice] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const started = useRef(new Set<string>());
  /** OCR 진행 중인 파일마다 취소 장치 */
  const aborts = useRef(new Map<string, AbortController>());
  const filesRef = useRef(value.files);

  useEffect(() => {
    filesRef.current = value.files;
  }, [value.files]);

  // 아직 읽기를 시작하지 않은 파일은 여기서 한 번만 읽는다
  useEffect(() => {
    for (const f of value.files) {
      if (f.result !== null || started.current.has(f.id)) continue;
      started.current.add(f.id);
      void extractFile(f.file, f.round, f.displayName).then((result) =>
        setValue((prev) => ({
          ...prev,
          files: prev.files.map((x) => (x.id === f.id ? { ...x, result: withRound(result, x.round) } : x)),
        })),
      );
    }
  }, [value.files, setValue]);

  // 스캔 PDF를 OCR로 읽는다 (담당자가 [OCR로 읽기]를 눌렀을 때만)
  const startOcr = (id: string) => {
    const f = filesRef.current.find((x) => x.id === id);
    if (!f || f.ocr) return;
    const controller = new AbortController();
    aborts.current.set(id, controller);
    const patch = (change: Partial<UploadedFile>) =>
      setValue((prev) => ({ ...prev, files: prev.files.map((x) => (x.id === id ? { ...x, ...change } : x)) }));
    patch({ ocr: { done: 0, total: 0 } });
    void ocrPdf(f.file, f.round, f.displayName, (done, total) => patch({ ocr: { done, total } }), controller.signal).then((result) => {
      aborts.current.delete(id);
      setValue((prev) => ({
        ...prev,
        files: prev.files.map((x) => (x.id === id ? { ...x, ocr: undefined, result: withRound(result, x.round) } : x)),
      }));
    });
  };

  const cancelOcr = (id: string) => aborts.current.get(id)?.abort();

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const current = [...filesRef.current];
    const added: UploadedFile[] = [];
    const skipped: string[] = [];
    const renamed: string[] = [];
    const cleaned: string[] = [];
    for (const file of Array.from(list)) {
      const all = [...current, ...added];
      // 이름·크기·수정 시각이 모두 같으면 같은 파일이므로 다시 올리지 않는다
      if (all.some((f) => f.file.name === file.name && f.file.size === file.size && f.file.lastModified === file.lastModified)) {
        skipped.push(file.name);
        continue;
      }
      // 이름만 같고 내용이 다른 파일(예: 1차·2차 회신)은 "이름 (2)"처럼 구분해서 둘 다 올린다
      const used = new Set(all.map((f) => f.displayName));
      const safeName = safeFileName(file.name);
      const displayName = used.has(safeName) ? uniqueName(safeName, used) : safeName;
      if (displayName !== safeName) renamed.push(`${file.name} → ${displayName}`);
      else if (safeName !== file.name) cleaned.push(`${file.name} → ${safeName}`);
      added.push({ id: `f${nextId++}`, file, displayName, round: 1, result: null });
    }
    const parts: string[] = [];
    if (skipped.length) parts.push(`이미 올린 파일이에요: ${skipped.join(", ")}`);
    if (renamed.length) parts.push(`이름이 같은 파일은 구분해서 올렸어요: ${renamed.join(", ")}`);
    if (cleaned.length) parts.push(`파일 이름의 줄바꿈·| 같은 글자를 _로 바꿨어요: ${cleaned.join(", ")}`);
    setNotice(parts.length ? parts.join(" / ") : null);
    if (added.length > 0) setValue((prev) => ({ ...prev, files: [...prev.files, ...added] }));
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
    <section className="card">
      <h2 className="step-title"><span className="step-no">1</span>회신 올리기</h2>

      <fieldset className="mb-5" disabled={busy}>
        <legend className="label">소송 유형</legend>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(LAWSUIT_TYPE_LABELS) as LawsuitType[]).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-4 py-2 font-medium has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[var(--brand-tint)]">
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
        <p className="label">회신 파일 (PDF·.hwpx, 여러 개 가능)</p>
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--brand)] bg-[var(--brand-tint)] px-4 py-8 text-center text-base font-semibold text-[var(--brand-strong)] hover:bg-[var(--surface-soft)]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!busy) addFiles(e.dataTransfer.files);
          }}
        >
          여기로 끌어 놓거나 눌러서 파일 고르기
          <span className="mt-1 text-sm font-normal muted">옛 한글 형식(.hwp)은 PDF로 바꿔서 올려 주세요. 파일은 이 컴퓨터 안에서만 읽어요.</span>
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
        {notice && (
          <p role="status" className="notice notice-warn mt-2">
            {notice}
          </p>
        )}
        <FileList
          files={value.files}
          disabled={busy}
          onRoundChange={changeRound}
          onRemove={(id) => {
            aborts.current.get(id)?.abort();
            setValue((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== id) }));
          }}
          onOcr={startOcr}
          onCancelOcr={cancelOcr}
        />
      </div>

      <div className="mb-5">
        <div className="mb-2 flex items-center gap-3">
          <label htmlFor="emailBody" className="font-bold">
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
          className="input"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="knownDate" className="label">
          취소원인을 안 날 <span className="font-normal muted">(모르면 비워 두세요)</span>
        </label>
        <input
          id="knownDate"
          type="date"
          max={today || undefined}
          value={value.cancellationKnownDate}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            // 오늘 이후 날짜는 받지 않는다 (PRD 예외: 날짜 입력 오류). 조용히 다른 날짜로 바꾸지 않고 비운 뒤 이유를 알린다
            if (today && v > today) {
              setDateError("오늘 이후 날짜는 고를 수 없어요. 날짜를 다시 골라 주세요.");
              set("cancellationKnownDate", "");
              return;
            }
            setDateError(null);
            set("cancellationKnownDate", v);
          }}
          aria-invalid={dateError !== null}
          className="input input-inline"
        />
        {dateError && (
          <p role="alert" className="mt-1 text-sm text-[var(--danger-fg)] font-semibold">
            {dateError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {blocker && !busy && <span className="text-base muted">{blocker}</span>}
        <button
          type="button"
          disabled={busy || locked || blocker !== null}
          onClick={onSubmit}
          className="btn btn-primary"
        >
          {busy ? "정리하는 중… (30초 안팎)" : "회신 정리하기"}
        </button>
      </div>
    </section>
  );
}
