// 한글(.hwpx) 글자 추출 (브라우저에서만).
// .hwpx는 압축 파일이고, 본문은 Contents/section0.xml, section1.xml … 안의 <hp:p>(문단) / <hp:t>(글자)에 있다.
// Design Ref: §4.1 — .hwpx 원문 위치는 "파일 전체에서 센 문단 번호" (쪽 정보 없음)

import JSZip from "jszip";
import type { ReplyRound, TextSegment } from "../reply-types";
import type { ExtractResult } from "./types";

const PARAGRAPH_NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";

function nearestParagraph(node: Element): Element | null {
  let el = node.parentElement;
  while (el && !(el.namespaceURI === PARAGRAPH_NS && el.localName === "p")) el = el.parentElement;
  return el;
}

function sectionOrder(name: string): number {
  return Number(/section(\d+)\.xml$/i.exec(name)?.[1] ?? 0);
}

export async function extractHwpx(file: File, round: ReplyRound, fileName: string = file.name): Promise<ExtractResult> {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const sectionNames = Object.keys(zip.files)
      .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
      .sort((a, b) => sectionOrder(a) - sectionOrder(b));
    if (sectionNames.length === 0) return { ok: false, code: "EXTRACT_FAILED" };

    const texts: string[] = [];
    for (const name of sectionNames) {
      const xml = new DOMParser().parseFromString(await zip.files[name].async("string"), "application/xml");
      if (xml.getElementsByTagName("parsererror").length > 0) return { ok: false, code: "EXTRACT_FAILED" };
      for (const p of Array.from(xml.getElementsByTagNameNS(PARAGRAPH_NS, "p"))) {
        // 표 안 문단은 바깥 문단과 겹치지 않게, 이 문단에 바로 속한 글자만 모은다
        const text = Array.from(p.getElementsByTagNameNS(PARAGRAPH_NS, "t"))
          .filter((t) => nearestParagraph(t) === p)
          .map((t) => t.textContent ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (text) texts.push(text);
      }
    }

    const segments: TextSegment[] = texts.map((text, i) => ({ paragraph: i + 1, text }));
    const chars = texts.reduce((sum, t) => sum + t.length, 0);
    if (chars === 0) return { ok: false, code: "EXTRACT_FAILED" };
    return { ok: true, source: { fileName, kind: "hwpx", round, segments }, chars };
  } catch {
    return { ok: false, code: "EXTRACT_FAILED" };
  }
}
