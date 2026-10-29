// 내려받기용 HTML 파일 만들기 (브라우저)
// Design Ref: §4.3 — 담는 순서, 특수문자 처리, 스크립트 없음, 파일 이름

import { draftSections, countNeedsCheck } from "./draft";
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
body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#171717;line-height:1.6}
h1{font-size:22px;margin-bottom:4px}h2{font-size:18px;border-bottom:2px solid #333;padding-bottom:4px;margin-top:32px}h3{font-size:15px;margin:16px 0 4px}
.meta{color:#555;font-size:13px}.notice{background:#fff7e6;border:1px solid #f0c36d;padding:10px 14px;border-radius:6px;margin:12px 0}
.danger{background:#fdecec;border-color:#e88}.src{color:#0a5a8a;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f4f4}
.label{font-weight:bold}.muted{color:#888}.field{white-space:normal;margin:4px 0 10px}
@media print{body{margin:0}}`;

export function buildDownloadHtml(bundle: DownloadBundle): string {
  const { summary, deadlines, draft, createdAt } = bundle;
  const label = caseLabel(summary.identity);
  const remaining = draft ? countNeedsCheck(draft, summary.disposals) : 0;
  const parts: string[] = [];

  // 1. 머리말
  parts.push(`<h1>소송 의뢰 초안 · 회신 정리</h1>
<p class="meta">만든 날짜 ${e(createdAt)} · 로펌 의견 정리기</p>
<p class="notice">AI가 법무법인 회신을 정리하고 초안을 만든 뒤, 담당자가 검토·수정한 문서입니다. 법률 판단은 법무법인 의견을 따릅니다.</p>`);

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
  if (remaining > 0) parts.push(`<p class="notice danger">⚠ 초안에 [확인 필요] 표시가 ${remaining}곳 남아 있습니다.</p>`);

  // 4. 초안 8항목
  if (draft) {
    parts.push(`<h2>소송 의뢰 초안</h2>`);
    for (const section of draftSections(draft, summary.disposals)) {
      parts.push(`<h3>${section.no}. ${e(section.title)}</h3>`);
      for (const f of section.fields) {
        parts.push(`<div class="field">${f.label ? `<span class="label">${e(f.label)}</span><br>` : ""}${multiline(f.text)}</div>`);
      }
    }
  }

  // 5. 제척기간
  if (deadlines) {
    parts.push(`<h2>제척기간</h2>`);
    if (deadlines.shortest) parts.push(`<p class="notice${deadlines.shortest.level === "expired" ? " danger" : ""}">가장 짧은 기한: ${e(deadlineMessage(deadlines.shortest))}</p>`);
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
<title>${e(`소송의뢰초안 ${label}`)}</title><style>${STYLE}</style></head>
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
