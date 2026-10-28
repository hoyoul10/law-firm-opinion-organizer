// PDF 글자 추출 (브라우저에서만). 원본 파일은 서버로 보내지 않는다.
// Design Ref: §1 원칙 1, §4.1 — PDF 원문 위치는 "쪽 + 그 쪽 안에서 센 문단 번호"
// PDF에는 문단 정보가 없어서, 줄 간격이 평소보다 넓으면 새 문단으로 본다.

import type { ExtractedSource, ReplyRound, TextSegment } from "../reply-types";
import type { ExtractResult } from "./types";

interface Line {
  y: number;
  height: number;
  text: string;
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** 글자 조각들을 줄로 묶는다 */
function toLines(items: { str: string; transform: number[]; height: number; hasEOL: boolean }[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of items) {
    const y = item.transform[5];
    if (!current || Math.abs(current.y - y) > Math.max(item.height, 1) * 0.5) {
      if (current && current.text.trim()) lines.push(current);
      current = { y, height: item.height, text: "" };
    }
    current.text += item.str;
    current.height = Math.max(current.height, item.height);
    if (item.hasEOL) {
      if (current.text.trim()) lines.push(current);
      current = null;
    }
  }
  if (current && current.text.trim()) lines.push(current);
  return lines;
}

/** "- 1 / 3 -", "2", "3쪽" 같은 쪽 번호만 있는 줄 */
const PAGE_NUMBER = /^[-–\s]*\d+\s*(\/\s*\d+)?\s*(쪽|page)?[-–\s]*$/i;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 줄 간격이 보통보다 15% 넘게 벌어지거나 글자 크기가 바뀌면 새 문단 */
function toParagraphs(lines: Line[]): string[] {
  const gaps = lines.slice(1).map((line, i) => lines[i].y - line.y).filter((g) => g > 0);
  const usual = median(gaps);
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0) {
      const prev = lines[i - 1];
      const gap = prev.y - line.y;
      const sizeChanged = Math.abs(prev.height - line.height) > Math.min(prev.height, line.height) * 0.15;
      if (gap <= 0 || gap > usual * 1.15 || sizeChanged) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    }
    buffer.push(line.text.trim());
  });
  if (buffer.length) paragraphs.push(buffer.join(" "));
  return paragraphs
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !PAGE_NUMBER.test(p));
}

export async function extractPdf(file: File, round: ReplyRound): Promise<ExtractResult> {
  let task;
  let doc;
  try {
    const pdfjs = await loadPdfJs();
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    doc = await task.promise;
  } catch {
    return { ok: false, code: "EXTRACT_FAILED" };
  }

  try {
    const segments: TextSegment[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is (typeof it & { str: string; transform: number[]; height: number; hasEOL: boolean }) => "str" in it);
      toParagraphs(toLines(items)).forEach((text, i) => segments.push({ page: pageNo, paragraph: i + 1, text }));
    }
    const chars = segments.reduce((sum, s) => sum + s.text.length, 0);
    // 글자가 거의 없으면 스캔한 이미지 PDF로 본다
    if (chars < 20) return { ok: false, code: "SCAN_PDF", pages: doc.numPages };

    const source: ExtractedSource = { fileName: file.name, kind: "pdf", round, segments };
    return { ok: true, source, pages: doc.numPages, chars };
  } catch {
    return { ok: false, code: "EXTRACT_FAILED" };
  } finally {
    void task.destroy();
  }
}
