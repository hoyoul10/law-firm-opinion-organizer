"use client";

// ② 사건정보 대조 (선택). 평소에는 쓰지 않고, 필요할 때만 법원 '나의 사건검색' PDF를 올려 [대조 요청]을 누른다.
// Design Ref: §13.1 — 정리하기와 별개 동작, 저장하지 않음, 다른 항목을 눈에 띄게 표시

import { useRef, useState } from "react";
import { extractFile } from "@/lib/extract";
import { EXTRACT_ERROR_MESSAGES, type ExtractResult } from "@/lib/extract/types";
import {
  COMPARE_RESULT_LABELS,
  NOT_IN_COURT,
  NOT_IN_REPLY,
  type CaseCompare,
  type CompareResult,
} from "@/lib/reply-types";
import ErrorNotice from "./ErrorNotice";
import SourceBadge from "./SourceBadge";

const RESULT_STYLE: Record<CompareResult, string> = {
  same: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  different: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  "not-comparable": "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

interface Props {
  compare: CaseCompare | null;
  busy: boolean;
  error: string | null;
  /** 읽은 사건정보 글자로 대조를 요청한다 */
  onCompare: (caseInfo: Extract<ExtractResult, { ok: true }>["source"]) => void;
}

export default function CaseInfoCompare({ compare, busy, error, onCompare }: Props) {
  const [file, setFile] = useState<{ name: string; result: ExtractResult | null } | null>(null);

  /** 파일을 고를 때마다 올린다. 읽는 중에 다른 파일을 골랐다면 늦게 끝난 옛 파일의 결과는 버린다 */
  const pickId = useRef(0);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const id = ++pickId.current;
    setFile({ name: f.name, result: null });
    void extractFile(f, 1).then((result) => {
      if (id === pickId.current) setFile({ name: f.name, result });
    });
  };

  const ready = file?.result?.ok ? file.result : null;
  const differences = compare?.items.filter((i) => i.result === "different").length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-black/20 p-4 dark:border-white/20">
      <div>
        <h3 className="font-semibold">사건정보 대조 (선택)</h3>
        <p className="text-sm text-zinc-500">
          필요할 때만 쓰세요. 법원 &apos;나의 사건검색&apos; 화면을 PDF로 저장해 올리고 [대조 요청]을 누르면, 회신과 다른 항목을 표시해 줘요. 파일은
          이 컴퓨터 안에서만 읽어요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="cursor-pointer rounded border border-black/20 px-3 py-1.5 hover:bg-black/[.03] dark:border-white/25 dark:hover:bg-white/[.05]">
          사건정보 PDF 고르기
          <input
            type="file"
            accept=".pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {file && (
          <span>
            {file.name} —{" "}
            {file.result === null && "읽는 중…"}
            {file.result?.ok && `${file.result.pages}쪽 · ${file.result.chars.toLocaleString()}자 ✓`}
            {file.result && !file.result.ok && (
              <span className="text-red-700 dark:text-red-300">
                ⚠{" "}
                {file.result.code === "SCAN_PDF"
                  ? "글자를 읽을 수 없는 PDF예요 (스캔한 그림일 수 있어요). 이 칸은 OCR을 지원하지 않아요. 법원 화면을 PDF로 저장한 파일(글자가 들어 있는 것)을 올려 주세요."
                  : EXTRACT_ERROR_MESSAGES[file.result.code]}
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => ready && onCompare(ready.source)}
          className="ml-auto rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
        >
          {busy ? "대조하는 중…" : compare ? "다시 대조하기" : "대조 요청"}
        </button>
      </div>

      {error && ready && <ErrorNotice message={error} onRetry={() => onCompare(ready.source)} busy={busy} />}

      {compare && (
        <div className="space-y-2">
          <p
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              differences > 0 ? RESULT_STYLE.different : RESULT_STYLE.same
            }`}
          >
            {differences > 0 ? `⚠ 회신과 사건정보가 다른 항목이 ${differences}개 있어요` : "회신과 사건정보가 다른 항목은 없어요"} ({compare.caseInfoFileName})
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs text-zinc-500 dark:border-white/10">
                  <th className="w-40 py-2">주제</th>
                  <th className="w-24 py-2">결과</th>
                  <th className="py-2">회신</th>
                  <th className="py-2">사건정보</th>
                </tr>
              </thead>
              <tbody>
                {compare.items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-black/5 align-top dark:border-white/5 ${item.result === "different" ? "bg-red-50/60 dark:bg-red-950/30" : ""}`}
                  >
                    <td className="py-2 pr-2 font-medium">{item.topic}</td>
                    <td className="py-2 pr-2">
                      <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[item.result]}`}>
                        {COMPARE_RESULT_LABELS[item.result]}
                      </span>
                    </td>
                    <td className={`py-2 pr-3 leading-relaxed ${item.replySays.text === NOT_IN_REPLY ? "text-zinc-400" : ""}`}>
                      {item.replySays.text}
                      <SourceBadge sources={item.replySays.sources} />
                    </td>
                    <td className={`py-2 leading-relaxed ${item.courtSays.text === NOT_IN_COURT ? "text-zinc-400" : ""}`}>
                      {item.courtSays.text}
                      <SourceBadge sources={item.courtSays.sources} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
