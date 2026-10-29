"use client";

// ① 올린 파일 목록: 차수, 쪽수·글자 수, 추출 상태, 스캔 PDF의 [OCR로 읽기] (Design Ref: §3.1 ① 파일 목록, §13.3)

import type { ReplyRound } from "@/lib/reply-types";
import { EXTRACT_ERROR_MESSAGES, type ExtractResult } from "@/lib/extract/types";
import RoundSelect from "./RoundSelect";

export interface UploadedFile {
  id: string;
  file: File;
  /** 화면과 원문 위치에 쓰는 이름. 같은 이름 파일이 여러 개면 "이름 (2).pdf"처럼 구분한다 */
  displayName: string;
  round: ReplyRound;
  /** 아직 읽는 중이면 null */
  result: ExtractResult | null;
  /** OCR로 읽는 중이면 진행 상황 (total이 0이면 쪽 수를 세는 중) */
  ocr?: { done: number; total: number };
}

interface Props {
  files: UploadedFile[];
  disabled: boolean;
  onRoundChange: (id: string, round: ReplyRound) => void;
  onRemove: (id: string) => void;
  onOcr: (id: string) => void;
  onCancelOcr: (id: string) => void;
}

export default function FileList({ files, disabled, onRoundChange, onRemove, onOcr, onCancelOcr }: Props) {
  if (files.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {files.map((f) => {
        const r = f.result;
        const canOcr = r !== null && !r.ok && (r.code === "SCAN_PDF" || r.code === "OCR_FAILED") && !f.ocr;
        return (
          <li
            key={f.id}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-3 py-2 ${
              r && !r.ok && !f.ocr ? "bg-red-50 dark:bg-red-950" : "bg-black/[.03] dark:bg-white/[.05]"
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{f.displayName}</span>
            <RoundSelect value={f.round} disabled={disabled} onChange={(round) => onRoundChange(f.id, round)} label={`${f.displayName} 차수`} />
            <span className="text-xs text-zinc-600 dark:text-zinc-400">
              {r === null && "읽는 중…"}
              {f.ocr && `OCR로 읽는 중… ${f.ocr.total > 0 ? `${f.ocr.done}/${f.ocr.total}쪽` : "쪽 수를 세는 중"}`}
              {r?.ok && !f.ocr && (
                <>
                  {`${r.pages ? `${r.pages}쪽 · ` : ""}${r.chars.toLocaleString()}자 ✓`}
                  {r.source.ocr && (
                    <span className="ml-1 text-amber-700 dark:text-amber-300">(OCR로 읽음 — 글자 인식 오류가 있을 수 있어요)</span>
                  )}
                </>
              )}
              {r && !r.ok && !f.ocr && (
                <span className="text-red-700 dark:text-red-300">
                  ⚠ {EXTRACT_ERROR_MESSAGES[r.code]}
                  {r.message ? ` ${r.message}` : ""}
                </span>
              )}
            </span>
            {canOcr && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOcr(f.id)}
                className="rounded border border-zinc-900 px-2 py-0.5 text-xs font-semibold text-zinc-900 disabled:opacity-40 dark:border-white dark:text-white"
              >
                {r.code === "OCR_FAILED" ? "OCR 다시 하기" : "OCR로 읽기"}
              </button>
            )}
            {f.ocr && (
              <button type="button" onClick={() => onCancelOcr(f.id)} className="rounded border border-black/30 px-2 py-0.5 text-xs dark:border-white/30">
                취소
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              className="text-xs text-zinc-500 hover:text-red-600 disabled:opacity-40"
              onClick={() => onRemove(f.id)}
            >
              빼기
            </button>
            {canOcr && (
              <p className="basis-full text-xs text-zinc-500">
                OCR은 스캔한 쪽 그림을 AI 서버로 보내 글자를 읽어요 (저장하지 않아요). 쪽당 몇 초가 걸리고 비용이 들어요. 읽은 뒤 날짜·금액은 원본과 한 번 대조해 주세요.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
