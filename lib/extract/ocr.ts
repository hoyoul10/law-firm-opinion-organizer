// 스캔한 PDF를 OCR(AI 글자 인식)로 읽는다 (브라우저 → /api/ocr)
// 쪽을 그림(JPEG)으로 만들어 4쪽씩 묶어 서버로 보내고, 돌아온 문단을 쪽·문단 번호가 붙은 글자로 바꾼다.
// 그림은 저장하지 않는다. 담당자가 [OCR로 읽기]를 눌렀을 때만 실행된다. Design Ref: §13.3

import type { PDFDocumentProxy } from "pdfjs-dist";
import { postJson } from "../api-client";
import {
  OCR_PAGES_PER_REQUEST,
  type OcrPageImage,
  type OcrRequest,
  type OcrResponse,
  type ReplyRound,
  type TextSegment,
} from "../reply-types";
import { loadPdfJs } from "./pdf";
import type { ExtractResult } from "./types";

/** 동시에 서버로 보내는 요청 수 */
const CONCURRENCY = 3;
/** 쪽 그림 한 장의 base64 글자 수 상한 (서버 상한 100만 자보다 작게) */
const MAX_IMAGE_CHARS = 900_000;

const fail = (message: string): ExtractResult => ({ ok: false, code: "OCR_FAILED", message });

/** 쪽 하나를 그림으로 만든다. 너무 크면 크기와 화질을 줄여 다시 만든다 */
async function renderPage(doc: PDFDocumentProxy, pageNo: number): Promise<string> {
  const page = await doc.getPage(pageNo);
  try {
    const base = page.getViewport({ scale: 1 });
    // 가로 약 1,600px, 긴 쪽은 2,400px를 넘지 않게 (글자가 또렷하게 읽히는 크기)
    let scale = Math.min(1600 / base.width, 2400 / base.height);
    for (let attempt = 0; attempt < 3; attempt++) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      // intent "print"는 화면 그리기 신호(requestAnimationFrame)에 기대지 않아, 다른 탭으로 옮겨 가도 멈추지 않는다
      await page.render({ canvas, viewport, background: "#ffffff", intent: "print" }).promise;
      const image = canvas.toDataURL("image/jpeg", attempt === 0 ? 0.75 : 0.6);
      canvas.width = 0;
      canvas.height = 0;
      if (image.length <= MAX_IMAGE_CHARS) return image;
      scale *= 0.8;
    }
    throw new Error("쪽 그림이 너무 커요");
  } finally {
    page.cleanup();
  }
}

export async function ocrPdf(
  file: File,
  round: ReplyRound,
  fileName: string,
  onProgress: (donePages: number, totalPages: number) => void,
  signal: AbortSignal,
): Promise<ExtractResult> {
  let task: ReturnType<Awaited<ReturnType<typeof loadPdfJs>>["getDocument"]> | undefined;
  try {
    const pdfjs = await loadPdfJs();
    task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise;
    const total = doc.numPages;
    onProgress(0, total);

    const pageNumbers = Array.from({ length: total }, (_, i) => i + 1);
    const batches: number[][] = [];
    for (let i = 0; i < pageNumbers.length; i += OCR_PAGES_PER_REQUEST) batches.push(pageNumbers.slice(i, i + OCR_PAGES_PER_REQUEST));

    const texts = new Map<number, string[]>();
    let done = 0;
    let next = 0;
    let failure: string | null = null;

    const worker = async () => {
      while (failure === null && !signal.aborted) {
        const index = next++;
        if (index >= batches.length) return;
        const images: OcrPageImage[] = [];
        for (const n of batches[index]) images.push({ page: n, image: await renderPage(doc, n) });
        if (signal.aborted) return;
        const request: OcrRequest = { pages: images };
        const res = await postJson<OcrResponse>("/api/ocr", request, signal);
        if (!res.ok) {
          if (!res.aborted && failure === null) failure = res.message;
          return;
        }
        for (const p of res.data.pages) texts.set(p.page, p.paragraphs);
        done += batches[index].length;
        onProgress(done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

    if (signal.aborted) return fail("OCR을 취소했어요.");
    if (failure !== null) return fail(failure);

    const segments: TextSegment[] = [...texts.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([page, paragraphs]) => paragraphs.map((text, i) => ({ page, paragraph: i + 1, text })));
    const chars = segments.reduce((sum, s) => sum + s.text.length, 0);
    if (chars < 20) return fail("글자를 거의 읽지 못했어요. 스캔 상태를 확인해 주세요.");

    return { ok: true, source: { fileName, kind: "pdf", round, ocr: true, segments }, pages: total, chars };
  } catch {
    if (signal.aborted) return fail("OCR을 취소했어요.");
    return fail("쪽을 그림으로 만들다 실패했어요 (파일이 너무 크거나 손상됐을 수 있어요).");
  } finally {
    void task?.destroy();
  }
}
