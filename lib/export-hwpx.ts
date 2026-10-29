// 초안을 한글(.hwpx) 파일로 내려받기 (브라우저). .hwp는 만들지 않는다 (담당자 결정 2026-10-29).
// .hwpx는 압축 파일이다: mimetype(압축 안 함, 맨 앞) + META-INF + Contents(header.xml, section0.xml, content.hpf).
// 본문은 HTML과 같은 순서로 담는다: 사건 → 경고 → 초안 8항목 → 제척기간 → 점검 10항목 → 의견·쟁점 → 용어.
// 주의: 이 구조가 한글 프로그램에서 열리는지는 직접 열어 확인해야 한다 (앱이 읽는 것과는 별개).

import JSZip from "jszip";
import { countNeedsCheck, draftSections } from "./draft";
import { downloadFileName } from "./export-html";
import { caseLabel, deadlineMessage, formatLocation } from "./labels";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STATUS_LABELS,
  LAWSUIT_TYPE_LABELS,
  NOT_IN_REPLY,
  type DownloadBundle,
  type SourceLocation,
} from "./reply-types";

const NS =
  'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" ' +
  'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" ' +
  'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" ' +
  'xmlns:opf="http://www.idpf.org/2007/opf/"';

const LANGS = ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"];

/** XML에 못 쓰는 제어 문자를 지우고 특수문자를 바꾼다 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function headerXml(): string {
  const faces = LANGS.map(
    (l) => `<hh:fontface lang="${l}" fontCnt="1"><hh:font id="0" face="맑은 고딕" type="TTF" isEmbedded="0"/></hh:fontface>`,
  ).join("");
  const seven = (tag: string, v: number) =>
    `<hh:${tag} hangul="${v}" latin="${v}" hanja="${v}" japanese="${v}" other="${v}" symbol="${v}" user="${v}"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hh:head ${NS} version="1.4" secCnt="1">` +
    '<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>' +
    `<hh:fontfaces itemCnt="7">${faces}</hh:fontfaces>` +
    '<hh:borderFills itemCnt="1"><hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">' +
    '<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' +
    '<hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/>' +
    '<hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>' +
    '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill></hh:borderFills>' +
    '<hh:charProperties itemCnt="1"><hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">' +
    seven("fontRef", 0) + seven("ratio", 100) + seven("spacing", 0) + seven("relSz", 100) + seven("offset", 0) +
    "</hh:charPr></hh:charProperties>" +
    '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
    '<hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">' +
    '<hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>' +
    '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>' +
    '<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>' +
    '<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>' +
    '<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>' +
    '<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>' +
    "</hh:paraPr></hh:paraProperties>" +
    '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
    "</hh:refList>" +
    '<hh:compatibleDocument targetProgram="HWP201X"/><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption></hh:head>'
  );
}

const SECTION_PROPERTIES =
  '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="0" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">' +
  '<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>' +
  '<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>' +
  '<hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr>' +
  '</hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>';

function sectionXml(paragraphs: string[]): string {
  const body = paragraphs
    .map((text, i) => {
      const first = i === 0 ? `<hp:run charPrIDRef="0">${SECTION_PROPERTIES}</hp:run>` : "";
      return `<hp:p id="${i}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${first}<hp:run charPrIDRef="0"><hp:t>${escapeXml(text)}</hp:t></hp:run></hp:p>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec ${NS}>${body}</hs:sec>`;
}

const where = (sources: SourceLocation[]) => (sources.length ? ` (📍 ${sources.map(formatLocation).join(", ")})` : "");

/** 문서 본문을 한 줄(문단) 목록으로 만든다. 여러 줄 글은 줄마다 문단으로 나눈다 */
export function hwpxParagraphs(bundle: DownloadBundle): string[] {
  const { summary, deadlines, draft, createdAt } = bundle;
  const out: string[] = [];
  const add = (...lines: string[]) => lines.forEach((l) => l.split("\n").forEach((x) => out.push(x)));

  add("소송 의뢰 초안 · 회신 정리", `만든 날짜 ${createdAt} · 로펌 의견 정리기`, "AI가 법무법인 회신을 정리하고 초안을 만든 뒤, 담당자가 검토·수정한 문서입니다. 법률 판단은 법무법인 의견을 따릅니다.", "");
  add("사건", `사건 표시: ${caseLabel(summary.identity) || "-"}${summary.identity.manualLabel ? " (담당자 직접 입력)" : where(summary.identity.sources)}`);
  add(`법무법인: ${summary.firmName ?? NOT_IN_REPLY}`, `소송 유형: ${LAWSUIT_TYPE_LABELS[summary.lawsuitType]}`, "");

  if (summary.typeMismatchWarning) add(`경고: ${summary.typeMismatchWarning} (고른 소송 유형은 바꾸지 않음)`);
  const remaining = draft ? countNeedsCheck(draft, summary.disposals) : 0;
  if (remaining > 0) add(`경고: 초안에 [확인 필요] 표시가 ${remaining}곳 남아 있습니다.`);

  if (draft) {
    add("소송 의뢰 초안");
    for (const section of draftSections(draft, summary.disposals)) {
      add("", `${section.no}. ${section.title}`);
      for (const f of section.fields) add(...(f.label ? [`[${f.label}]`] : []), f.text);
    }
    add("");
  }

  if (deadlines) {
    add("제척기간");
    if (deadlines.shortest) add(`가장 짧은 기한: ${deadlineMessage(deadlines.shortest)}`);
    if (summary.disposals.length === 0) add("처분행위를 찾지 못했어요 [확인 필요]");
    for (const r of deadlines.perDisposal) {
      const d = summary.disposals.find((x) => x.id === r.disposalId);
      add(
        `- ${d?.kind ?? ""} · ${d?.beneficiary ?? ""}${d?.subsequentAcquirer ? ` (전득자 ${d.subsequentAcquirer})` : ""}: 법률행위일 ${d?.legalActDate ?? "[확인 필요]"}, 1년 기한 ${r.oneYearEnd ?? "안 날 미입력"}, 5년 기한 ${r.fiveYearEnd ?? "[확인 필요]"}, 남은 날 ${r.daysLeft === null ? "[확인 필요]" : `${r.daysLeft}일`}`,
      );
    }
    add("");
  }

  if (summary.checklist) {
    add("점검 항목 10개");
    for (const item of CHECKLIST_ITEMS) {
      const c = summary.checklist.find((x) => x.id === item.id);
      add(`${item.id}. ${item.title} [${CHECKLIST_STATUS_LABELS[c?.status ?? "not-in-reply"]}] ${c?.summary.text ?? NOT_IN_REPLY}${c ? where(c.summary.sources) : ""}`);
    }
    add("");
  }

  add("법무법인 의견", `${summary.firmOpinion.text}${where(summary.firmOpinion.sources)}`, "", "쟁점");
  if (summary.issues.length === 0) add(NOT_IN_REPLY);
  summary.issues.forEach((i, n) => add(`${n + 1}. ${i.title} — ${i.detail.text}${where(i.detail.sources)}`));
  add("", "용어 풀이");
  if (summary.glossary.length === 0) add("풀이할 법률 용어가 없어요.");
  summary.glossary.forEach((g) => add(`${g.term}: ${g.explanation}${where([g.firstSeen])}`));
  return out;
}

/** .hwpx 파일 내용 (압축 파일) */
export async function buildHwpx(bundle: DownloadBundle): Promise<Uint8Array> {
  const paragraphs = hwpxParagraphs(bundle);
  const title = escapeXml(paragraphs[0] ?? "소송 의뢰 초안");
  const zip = new JSZip();
  // mimetype은 압축하지 않고 맨 앞에 둔다
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  zip.file("version.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>');
  zip.file("META-INF/container.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>');
  zip.file("META-INF/manifest.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>');
  zip.file(
    "Contents/content.hpf",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${title}</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`,
  );
  zip.file("Contents/header.xml", headerXml());
  zip.file("Contents/section0.xml", sectionXml(paragraphs));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function hwpxFileName(bundle: DownloadBundle): string {
  return downloadFileName(bundle).replace(/\.html$/, ".hwpx");
}

export async function downloadHwpx(bundle: DownloadBundle): Promise<void> {
  const bytes = await buildHwpx(bundle);
  const blob = new Blob([bytes as BlobPart], { type: "application/hwp+zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = hwpxFileName(bundle);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
