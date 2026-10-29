// PDF 글자 추출 (브라우저에서만). 원본 파일은 서버로 보내지 않는다.
// Design Ref: §1 원칙 1, §4.1 — PDF 원문 위치는 "쪽 + 그 쪽 안에서 센 문단 번호"
// PDF에는 문단 정보가 없어서, 줄 간격이 평소보다 넓으면 새 문단으로 본다.

import type { ExtractedSource, ReplyRound, TextSegment } from "../reply-types";
import { PAGE_NUMBER } from "./shared";
import type { ExtractResult } from "./types";

interface Line {
  y: number;
  height: number;
  /** 줄 오른쪽 끝 x 좌표 */
  end: number;
  text: string;
}

type TextItem = { str: string; transform: number[]; width: number; height: number; hasEOL: boolean };

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        return pdfjs;
      })
      .catch((err) => {
        // 한 번 실패한 로딩 결과를 저장해 두면 이후 모든 PDF가 실패하므로, 다음에 다시 시도하게 비운다
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

/** 글자 조각들을 줄로 묶는다 */
function toLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  for (const item of items) {
    const y = item.transform[5];
    if (!current || Math.abs(current.y - y) > Math.max(item.height, 1) * 0.5) {
      if (current && current.text.trim()) lines.push(current);
      current = { y, height: item.height, end: 0, text: "" };
    }
    current.text += item.str;
    current.height = Math.max(current.height, item.height);
    if (item.str.trim()) current.end = Math.max(current.end, item.transform[4] + item.width);
    if (item.hasEOL) {
      if (current.text.trim()) lines.push(current);
      current = null;
    }
  }
  if (current && current.text.trim()) lines.push(current);
  return lines;
}


/** 문단 머리 표시: [제목], ①, 1., 가., Ⅰ., -, ※ 등 */
const PARAGRAPH_MARKER = /^(\[[^\]]{1,15}\]|[①-⑳]|\d{1,2}[.)]\s|[가-하][.)]\s|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ][.)]?\s|[-※•■□○●▶]\s?)/;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
}

/**
 * 새 문단으로 보는 경우: 줄 간격이 평소보다 15% 넘게 벌어짐, 글자 크기가 바뀜,
 * 앞 줄이 오른쪽 끝까지 가지 않고 일찍 끝남(문단 마지막 줄), 문단 머리 표시로 시작함
 */
function toParagraphs(lines: Line[]): string[] {
  const gaps = lines.slice(1).map((line, i) => lines[i].y - line.y).filter((g) => g > 0);
  // 한두 줄짜리 문단이 많으면 가운데 값이 문단 사이 간격이 되므로, 아래쪽 값을 평소 줄 간격으로 본다
  const usual = percentile(gaps, 0.2);
  const fullWidth = percentile(lines.map((l) => l.end), 0.9);
  const paragraphs: string[] = [];
  let buffer: string[] = [];
  lines.forEach((line, i) => {
    if (i > 0) {
      const prev = lines[i - 1];
      const gap = prev.y - line.y;
      const sizeChanged = Math.abs(prev.height - line.height) > Math.min(prev.height, line.height) * 0.15;
      const prevEndedEarly = prev.end < fullWidth * 0.85;
      const startsWithMarker = PARAGRAPH_MARKER.test(line.text.trim());
      if (gap <= 0 || gap > usual * 1.15 || sizeChanged || prevEndedEarly || startsWithMarker) {
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

export async function extractPdf(file: File, round: ReplyRound, fileName: string = file.name): Promise<ExtractResult> {
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
      const items = content.items.filter((it): it is typeof it & TextItem => "str" in it);
      toParagraphs(toLines(items)).forEach((text, i) => segments.push({ page: pageNo, paragraph: i + 1, text }));
    }
    const chars = segments.reduce((sum, s) => sum + s.text.length, 0);
    // 글자가 거의 없으면 스캔한 이미지 PDF로 본다
    if (chars < 20) return { ok: false, code: "SCAN_PDF", pages: doc.numPages };

    const source: ExtractedSource = { fileName, kind: "pdf", round, segments };
    return { ok: true, source, pages: doc.numPages, chars };
  } catch {
    return { ok: false, code: "EXTRACT_FAILED" };
  } finally {
    void task.destroy();
  }
}
