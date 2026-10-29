// 내려받기용 HTML 파일 만들기 (브라우저)
// Design Ref: §4.3 — 담는 순서, 특수문자 처리, 스크립트 없음, 파일 이름

import { draftSections } from "./draft";
import { caseLabel, deadlineMessage, formatLocation } from "./labels";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_STATUS_LABELS,
  COMPARE_RESULT_LABELS,
  LAWSUIT_TYPE_LABELS,
  NOT_IN_REPLY,
  type DownloadBundle,
  type SourceLocation,
} from "./reply-types";

/** AI나 담당자가 쓴 글 속 특수문자를 바꿔, 검토자 PC에서 코드로 실행되지 않게 한다 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;
const multiline = (text: string) => e(text).replace(/\n/g, "<br>");
const where = (sources: SourceLocation[]) =>
  sources.length ? ` <span class="src">📍 ${sources.map((s) => e(formatLocation(s))).join(", ")}</span>` : "";

const STYLE = `
:root{--brand:#005bac;--navy:#0a2f5c;--tint:#e6f0fa;--line:#cfd8e3;--muted:#566274;--ok:#0b6b40;--ok-bg:#e4f4ec;--warn:#7a4f00;--warn-bg:#fff3d1;--danger:#a4221a;--danger-bg:#fde8e6}
*{box-sizing:border-box}
body{font-family:"Pretendard","Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:16px;max-width:880px;margin:0 auto;padding:0 24px 48px;color:#1b2430;line-height:1.8;word-break:keep-all;overflow-wrap:anywhere;background:#fff}
.doc-head{margin:0 -24px 28px;padding:28px 24px 20px;background:var(--navy);color:#fff;border-bottom:5px solid #00857c}
.doc-head .org{font-size:13px;letter-spacing:.04em;opacity:.8;margin:0}
.doc-head h1{font-size:28px;line-height:1.3;margin:6px 0 10px;color:#fff}
.doc-head .meta{color:#dce8f5;font-size:14px;margin:0}
h1{font-size:26px;margin:24px 0 6px}
h2{font-size:19px;color:var(--navy);margin:34px 0 12px;padding:6px 0 6px 12px;border-left:6px solid var(--brand);background:var(--tint)}
h3{font-size:16px;margin:16px 0 4px;color:var(--navy)}
.meta{color:var(--muted);font-size:14px}
.notice{background:var(--warn-bg);color:var(--warn);border:1px solid #e8c866;padding:10px 14px;border-radius:8px;margin:12px 0;font-size:15px}
.danger{background:var(--danger-bg);color:var(--danger);border-color:#e7a6a1}
.ok{background:var(--ok-bg);color:var(--ok);border-color:#9fd3b7}
.src{display:inline-block;color:#0b4a86;background:var(--tint);border-radius:5px;padding:0 6px;font-size:12px;margin-left:4px;white-space:nowrap}
table{border-collapse:collapse;width:100%;font-size:15px;margin:8px 0}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--tint);color:var(--navy);font-weight:700}
.label{font-weight:700;color:var(--navy)}
.muted{color:#778}
.field{margin:6px 0 14px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:#fbfdff}
.foot{margin-top:36px;padding-top:12px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
@media print{body{max-width:none;padding:0 12mm}.doc-head{margin:0 -12mm 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2{break-after:avoid}.field,tr{break-inside:avoid}}`;

/**
 * 초안이 있으면 법무법인에 소송을 의뢰하는 문서로 초안 8항목만 내보낸다.
 * 점검표·제척기간 표·쟁점·용어 풀이·대조 결과는 담당자가 화면에서 보는 참고 자료라 넣지 않는다 (담당자 결정 2026-10-29).
 */
function buildRequestHtml(bundle: DownloadBundle, label: string): string {
  const { summary, draft, createdAt } = bundle;
  const parts: string[] = [
    `<div class="doc-head"><p class="org">한국자산관리공사 · 새출발채권관리2처</p><h1>소송 의뢰서 (초안)</h1><p class="meta">사건 ${e(label || "-")} · 작성일 ${e(createdAt)}</p></div>`,
  ];
  for (const section of draftSections(draft!, summary.disposals)) {
    parts.push(`<h2>${section.no}. ${e(section.title)}</h2>`);
    for (const f of section.fields) {
      parts.push(`<div class="field">${f.label ? `<span class="label">${e(f.label)}</span><br>` : ""}${multiline(f.text)}</div>`);
    }
  }
  // 스캔본을 OCR로 읽은 자료가 바탕이면 받는 쪽도 알 수 있게 마지막에 한 줄 알린다 (PRD: OCR 사실을 내려받는 파일에 알림)
  if (bundle.ocrFileNames && bundle.ocrFileNames.length > 0) {
    parts.push(`<p class="foot">※ 이 초안은 스캔본을 OCR(AI 글자 인식)로 읽은 자료를 바탕으로 해 날짜·금액·이름·사건번호에 인식 오류가 있을 수 있습니다. 원본과 대조해 주세요.</p>`);
  }
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(`소송의뢰초안 ${label}`)}</title><style>${STYLE}</style></head>
<body>
${parts.join("\n")}
</body></html>`;
}

/** 초안이 없을 때(기타 유형, 또는 [정리 결과만 내려받기]) 담당자·검토자 참고용 정리 결과를 내보낸다 */
export function buildDownloadHtml(bundle: DownloadBundle): string {
  const { summary, deadlines, draft, createdAt } = bundle;
  const label = caseLabel(summary.identity);
  if (draft) return buildRequestHtml(bundle, label);
  const parts: string[] = [];

  // 1. 머리말
  parts.push(`<div class="doc-head"><p class="org">한국자산관리공사 · 새출발채권관리2처</p><h1>회신 정리 결과</h1><p class="meta">만든 날짜 ${e(createdAt)} · 로펌 의견 정리기</p></div>
<p class="notice">AI가 법무법인 회신을 정리한 결과를 담당자가 검토한 참고 자료입니다. 법률 판단은 법무법인 의견을 따릅니다.</p>`);

  // 2. 사건 표시
  parts.push(`<h2>사건</h2><table>
<tr><th>사건 표시</th><td>${e(label || "-")}${summary.identity.manualLabel ? ' <span class="muted">(담당자 직접 입력)</span>' : where(summary.identity.sources)}</td></tr>
<tr><th>법무법인</th><td>${e(summary.firmName ?? NOT_IN_REPLY)}</td></tr>
<tr><th>소송 유형</th><td>${e(LAWSUIT_TYPE_LABELS[summary.lawsuitType])}</td></tr></table>`);

  // 2-2. OCR 안내
  if (bundle.ocrFileNames && bundle.ocrFileNames.length > 0) {
    parts.push(`<p class="notice">ⓘ 스캔본이라 OCR(AI 글자 인식)로 읽은 파일: ${bundle.ocrFileNames.map(e).join(", ")}. 글자를 잘못 읽었을 수 있으니 날짜·금액·이름·사건번호는 원본과 대조해 주세요.</p>`);
  }

  // 3. 경고 (낡은 결과 경고도 파일에 담아 검토자가 알 수 있게 한다)
  for (const notice of bundle.staleNotices ?? []) parts.push(`<p class="notice danger">⚠ ${e(notice)}</p>`);
  if (summary.typeMismatchWarning) parts.push(`<p class="notice">⚠ ${e(summary.typeMismatchWarning)} (고른 소송 유형은 바꾸지 않음)</p>`);

  // 4. 제척기간
  if (deadlines) {
    parts.push(`<h2>제척기간</h2>`);
    if (deadlines.shortest) parts.push(`<p class="notice${deadlines.shortest.level === "expired" ? " danger" : deadlines.shortest.level === "ok" ? " ok" : ""}">가장 짧은 기한: ${e(deadlineMessage(deadlines.shortest))}</p>`);
    if (summary.disposals.length === 0) {
      parts.push(`<p>처분행위를 찾지 못했어요 [확인 필요]</p>`);
    } else {
      parts.push(`<table><tr><th>처분행위</th><th>법률행위일</th><th>1년 기한</th><th>5년 기한</th><th>남은 날</th></tr>`);
      for (const r of deadlines.perDisposal) {
        const d = summary.disposals.find((x) => x.id === r.disposalId);
        parts.push(`<tr><td>${e(`${d?.kind ?? ""} · ${d?.beneficiary ?? ""}${d?.subsequentAcquirer ? ` (전득자 ${d.subsequentAcquirer})` : ""}`)}</td><td>${e(d?.legalActDate ?? "[확인 필요]")}</td><td>${e(r.oneYearEnd ?? "안 날 미입력")}</td><td>${e(r.fiveYearEnd ?? "[확인 필요]")}</td><td>${r.daysLeft === null ? "[확인 필요]" : `${r.daysLeft}일`}</td></tr>`);
      }
      parts.push(`</table>`);
    }
  }

  // 5-2. 사건정보 대조 (담당자가 요청했을 때만)
  if (bundle.compare) {
    const diff = bundle.compare.items.filter((i) => i.result === "different").length;
    parts.push(`<h2>사건정보 대조</h2><p class="notice${diff > 0 ? " danger" : ""}">${diff > 0 ? `⚠ 회신과 사건정보가 다른 항목이 ${diff}개 있습니다.` : "회신과 사건정보가 다른 항목은 없습니다."} (${e(bundle.compare.caseInfoFileName)})</p>`);
    parts.push(`<table><tr><th>주제</th><th>결과</th><th>회신</th><th>사건정보</th></tr>`);
    for (const i of bundle.compare.items) {
      parts.push(`<tr><td>${e(i.topic)}</td><td>${e(COMPARE_RESULT_LABELS[i.result])}</td><td>${e(i.replySays.text)}${where(i.replySays.sources)}</td><td>${e(i.courtSays.text)}${where(i.courtSays.sources)}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  // 6. 점검 10항목
  if (summary.checklist) {
    parts.push(`<h2>점검 항목 10개</h2><table><tr><th>#</th><th>항목</th><th>상태</th><th>회신 내용</th></tr>`);
    for (const item of CHECKLIST_ITEMS) {
      const c = summary.checklist.find((x) => x.id === item.id);
      parts.push(`<tr><td>${item.id}</td><td>${e(item.title)}</td><td>${e(CHECKLIST_STATUS_LABELS[c?.status ?? "not-in-reply"])}</td><td>${e(c?.summary.text ?? NOT_IN_REPLY)}${c ? where(c.summary.sources) : ""}</td></tr>`);
    }
    parts.push(`</table>`);
  }

  // 7. 쟁점과 법무법인 의견
  parts.push(`<h2>법무법인 의견</h2><p>${e(summary.firmOpinion.text)}${where(summary.firmOpinion.sources)}</p><h2>쟁점</h2>`);
  parts.push(
    summary.issues.length
      ? `<ol>${summary.issues.map((i) => `<li><span class="label">${e(i.title)}</span> — ${e(i.detail.text)}${where(i.detail.sources)}</li>`).join("")}</ol>`
      : `<p>${NOT_IN_REPLY}</p>`,
  );

  // 8. 용어 풀이
  parts.push(`<h2>용어 풀이</h2>`);
  parts.push(
    summary.glossary.length
      ? `<table>${summary.glossary.map((g) => `<tr><th>${e(g.term)}</th><td>${e(g.explanation)}${where([g.firstSeen])}</td></tr>`).join("")}</table>`
      : `<p class="muted">풀이할 법률 용어가 없어요.</p>`,
  );

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(`회신정리 ${label}`)}</title><style>${STYLE}</style></head>
<body>
${parts.join("\n")}
</body></html>`;
}

/** 파일 이름: 소송의뢰초안_{사건 표시}_{날짜}.html (파일 이름에 못 쓰는 글자는 _로) */
export function downloadFileName(bundle: DownloadBundle): string {
  const label = caseLabel(bundle.summary.identity) || "사건표시없음";
  const prefix = bundle.draft ? "소송의뢰초안" : "회신정리";
  return `${prefix}_${label}_${bundle.createdAt}.html`.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "");
}

export function downloadHtml(bundle: DownloadBundle): void {
  const blob = new Blob([buildDownloadHtml(bundle)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = downloadFileName(bundle);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
