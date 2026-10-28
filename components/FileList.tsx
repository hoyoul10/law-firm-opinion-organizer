"use client";

// ① 올린 파일 목록: 차수, 쪽수·글자 수, 추출 상태 (Design Ref: §3.1 ① 파일 목록)

import type { ReplyRound } from "@/lib/reply-types";
import { EXTRACT_ERROR_MESSAGES, type ExtractResult } from "@/lib/extract/types";
import RoundSelect from "./RoundSelect";

export interface UploadedFile {
  id: string;
  file: File;
  round: ReplyRound;
  /** 아직 읽는 중이면 null */
  result: ExtractResult | null;
}

interface Props {
  files: UploadedFile[];
  disabled: boolean;
  onRoundChange: (id: string, round: ReplyRound) => void;
  onRemove: (id: string) => void;
}

export default function FileList({ files, disabled, onRoundChange, onRemove }: Props) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {files.map((f) => {
        const r = f.result;
        return (
          <li
            key={f.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-3 py-2 ${
              r && !r.ok ? "bg-red-50 dark:bg-red-950" : "bg-black/[.03] dark:bg-white/[.05]"
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{f.file.name}</span>
            <RoundSelect value={f.round} disabled={disabled} onChange={(round) => onRoundChange(f.id, round)} label={`${f.file.name} 차수`} />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {r === null && "읽는 중…"}
              {r?.ok && `${r.pages ? `${r.pages}쪽 · ` : ""}${r.chars.toLocaleString()}자 ✓`}
              {r && !r.ok && <span className="text-red-700 dark:text-red-300">⚠ {EXTRACT_ERROR_MESSAGES[r.code]}</span>}
            </span>
            <button
              type="button"
              disabled={disabled}
              className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-40"
              onClick={() => onRemove(f.id)}
            >
              빼기
            </button>
          </li>
        );
      })}
    </ul>
  );
}
