"use client";

// 화면 전체 상태를 가진 부모. ① 입력 → ② 정리 결과 → ③ 초안을 이어 준다.
// Design Ref: §4.2 — 모든 값은 브라우저 메모리에만 둔다 (저장 안 함)

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import InputPanel, { EMPTY_INPUT, type InputState } from "./InputPanel";
import CaseHeader from "./CaseHeader";
import ChecklistTable from "./ChecklistTable";
import DeadlineTable from "./DeadlineTable";
import DraftEditor from "./DraftEditor";
import ErrorNotice from "./ErrorNotice";
import Glossary from "./Glossary";
import CaseInfoCompare from "./CaseInfoCompare";
import IssuesAndOpinion from "./IssuesAndOpinion";
import Mascot from "./Mascot";
import { postJson } from "@/lib/api-client";
import { computeDeadlines } from "@/lib/deadline";
import { countNeedsCheck } from "@/lib/draft";
import { downloadHtml } from "@/lib/export-html";
import { downloadHwpx } from "@/lib/export-hwpx";
import { splitEmailBody } from "@/lib/extract/email";
import { getToday } from "@/lib/today";
import type {
  CaseCompare,
  CompareRequest,
  DraftRequest,
  ExtractedSource,
  LawsuitDraft,
  ReplyInput,
  ReplySummary,
} from "@/lib/reply-types";

const noSubscribe = () => () => {};

/** 화면 입력을 서버로 보낼 원문 목록으로 바꾼다 (파일 순서 → 이메일 본문) */
function collectSources(input: InputState): ExtractedSource[] {
  const sources = input.files.flatMap((f) => (f.result?.ok ? [f.result.source] : []));
  const email = splitEmailBody(input.emailBody, input.emailRound);
  return email ? [...sources, email] : sources;
}

type Failure = { step: "summarize" | "draft"; message: string };

/**
 * 정리 결과가 어떤 입력으로 만들어졌는지 알아보는 표시.
 * '취소원인을 안 날'은 일부러 뺐다: 바꾸면 제척기간 표가 바로 다시 계산되기 때문이다 (초안 4번은 따로 낡음 표시)
 */
function inputSignature(i: InputState): string {
  return JSON.stringify({
    t: i.lawsuitType,
    f: i.files.map((f) => [f.displayName, f.round, f.file.size]),
    e: i.emailBody,
    r: i.emailRound,
  });
}

const SECTION = "card space-y-6";
const PRIMARY_BUTTON = "btn btn-primary";
const SECONDARY_BUTTON = "btn btn-secondary";

export default function ReplyOrganizer() {
  const [input, setInput] = useState<InputState>(EMPTY_INPUT);
  // 서버에서 미리 그릴 때는 비워 두고, 브라우저에서 한국 시간 오늘을 읽는다
  const today = useSyncExternalStore(noSubscribe, getToday, () => "");
  const [busy, setBusy] = useState<"summarize" | "draft" | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [summary, setSummary] = useState<ReplySummary | null>(null);
  /** 정리에 실제로 쓴 원문. 초안을 만들 때 날짜·금액 대조에 다시 쓴다 */
  const [sentSources, setSentSources] = useState<ExtractedSource[]>([]);
  const [draft, setDraft] = useState<LawsuitDraft | null>(null);
  /** 지금 화면의 결과를 내려받았는지. 내려받은 뒤 고치면 다시 false */
  const [downloaded, setDownloaded] = useState(false);
  /** 담당자가 요청했을 때만 만드는 사건정보 대조 결과 (PLAN 29) */
  const [compare, setCompare] = useState<CaseCompare | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  /** 정리 결과를 만들 때의 입력 표시. 지금 입력과 다르면 결과가 낡았다고 알린다 */
  const [summarySig, setSummarySig] = useState<string | null>(null);
  /** 초안을 만들 때의 '취소원인을 안 날'. 지금 값과 다르면 초안 4번(제척기간)이 낡았다고 알린다 */
  const [draftKnownDate, setDraftKnownDate] = useState<string | null>(null);
  /** 초안을 만들 때의 법률행위일 목록. 담당자가 날짜를 직접 넣거나 지우면 초안 4번이 낡았다고 알린다 */
  const [draftDatesSig, setDraftDatesSig] = useState<string | null>(null);
  /** 정리를 새로 시작할 때마다 올린다. 늦게 도착한 옛 대조 결과를 버리는 데 쓴다 */
  const versionRef = useRef(0);

  // 입력을 바꾸면 이미 내려받은 결과와 달라지므로 다시 "내려받지 않음"으로 돌린다
  const updateInput: Dispatch<SetStateAction<InputState>> = (update) => {
    setInput(update);
    setDownloaded(false);
  };
  const inputStale = summary !== null && summarySig !== inputSignature(input);
  /** 정리에 쓴 자료 가운데 스캔본을 OCR로 읽은 파일들. 글자 인식 오류가 있을 수 있어 결과에 알린다 */
  const ocrFileNames = sentSources.filter((s) => s.ocr).map((s) => s.fileName);
  const datesSig = summary ? JSON.stringify(summary.disposals.map((d) => d.legalActDate)) : null;
  const draftStale = draft !== null && (draftKnownDate !== input.cancellationKnownDate || draftDatesSig !== datesSig);

  // 제척기간은 AI가 아니라 코드로, 안 날을 바꾸면 바로 다시 계산한다. "기타" 유형은 계산하지 않는다
  const deadlines = useMemo(
    () =>
      summary && summary.lawsuitType === "fraudulent-transfer" && today
        ? computeDeadlines(summary.disposals, input.cancellationKnownDate || null, today)
        : null,
    [summary, input.cancellationKnownDate, today],
  );

  // 내려받지 않은 결과가 있으면 창 닫기·새로고침 전에 경고한다 (PLAN 25)
  useEffect(() => {
    if (!summary || downloaded) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [summary, downloaded]);

  const summarize = async () => {
    // 고친 초안이나 대조 결과가 있으면 지우기 전에 확인한다. 창 닫기 경고는 페이지를 떠날 때만 작동한다
    if (
      (draft || compare) &&
      !downloaded &&
      !window.confirm("고친 초안이나 대조 결과가 있어요. 다시 정리하면 지금 결과가 모두 지워져요. 계속할까요?")
    ) {
      return;
    }
    const sources = collectSources(input);
    const body: ReplyInput = {
      lawsuitType: input.lawsuitType,
      sources,
      cancellationKnownDate: input.cancellationKnownDate || null,
    };
    const signature = inputSignature(input);
    setBusy("summarize");
    setFailure(null);
    // 새로 정리하는 동안 옛 결과를 남겨 두지 않는다. 실패했을 때 옛 결과가 새 입력의 결과처럼 보이는 것을 막는다
    versionRef.current += 1;
    setSummary(null);
    setDraft(null);
    setCompare(null);
    setCompareError(null);
    const result = await postJson<{ summary: ReplySummary }>("/api/summarize", body);
    setBusy(null);
    if (!result.ok) {
      // 불완전한 결과는 보여 주지 않는다. 입력은 그대로 둔다
      setFailure({ step: "summarize", message: result.message });
      return;
    }
    setSummary(result.data.summary);
    setSummarySig(signature);
    setSentSources(sources);
    setDownloaded(false);
  };

  /** 법률행위일을 담당자가 직접 넣거나 지운다. 넣은 값은 manual로 표시해 서버의 근거 문단 대조에서 빼 준다 */
  const setLegalActDate = (disposalId: string, date: string | null) => {
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            disposals: prev.disposals.map((d) =>
              d.id === disposalId
                ? { ...d, legalActDate: date, legalActDateManual: date ? true : undefined }
                : d,
            ),
          }
        : prev,
    );
    setDownloaded(false);
  };

  const runCompare = async (caseInfo: ExtractedSource) => {
    if (!summary) return;
    const body: CompareRequest = { summary, sources: sentSources, caseInfo };
    const version = versionRef.current;
    setCompareBusy(true);
    setCompareError(null);
    const result = await postJson<{ compare: CaseCompare }>("/api/compare", body);
    setCompareBusy(false);
    // 그 사이 정리를 새로 했다면 옛 정리 결과로 만든 대조 결과이므로 버린다
    if (version !== versionRef.current) return;
    if (!result.ok) {
      setCompareError(result.message);
      return;
    }
    setCompare(result.data.compare);
    setDownloaded(false);
  };

  const makeDraft = async () => {
    if (!summary) return;
    if (draft && !downloaded && !window.confirm("고친 초안이 있어요. 다시 만들면 고친 내용이 지워져요. 계속할까요?")) return;
    const knownDate = input.cancellationKnownDate;
    const body: DraftRequest = { summary, cancellationKnownDate: knownDate || null, sources: sentSources };
    setBusy("draft");
    setFailure(null);
    const result = await postJson<{ draft: LawsuitDraft }>("/api/draft", body);
    setBusy(null);
    if (!result.ok) {
      setFailure({ step: "draft", message: result.message });
      return;
    }
    setDraft(result.data.draft);
    setDraftKnownDate(knownDate);
    setDraftDatesSig(datesSig);
    setDownloaded(false);
  };

  const remaining = draft && summary ? countNeedsCheck(draft, summary.disposals) : 0;

  /** summaryOnly: 초안이 있어도 담당자 참고용 정리 결과만 내려받는다 */
  const download = async (format: "html" | "hwpx" = "html", summaryOnly = false) => {
    if (!summary) return;
    const fileDraft = summaryOnly ? null : draft;
    // 낡은 결과 경고는 확인창에만 두지 않고 파일에도 담아, 파일을 받는 검토자도 알 수 있게 한다
    const staleNotices: string[] = [];
    if (draftStale) staleNotices.push("초안 4번(제척기간)이 지금 입력한 '취소원인을 안 날'과 다른 값으로 만들어졌어요.");
    if (inputStale) staleNotices.push("정리한 뒤에 입력(소송 유형·파일·이메일)이 바뀌었어요. 결과는 이전 입력 기준이에요.");
    const warnings: string[] = [];
    if (fileDraft && remaining > 0) warnings.push(`초안에 [확인 필요] 표시가 ${remaining}곳 남아 있어요.`);
    // 초안 파일에는 내부 경고를 담지 않으므로(OCR 한 줄 안내만 담음) 확인창에서 한 번 더 알린다
    if (fileDraft && summary.typeMismatchWarning) warnings.push(`소송 유형 경고가 있어요: ${summary.typeMismatchWarning}`);
    if (fileDraft && ocrFileNames.length > 0) warnings.push("OCR로 읽은 파일이 바탕이에요. 날짜·금액·이름·사건번호를 원본과 대조했는지 확인해 주세요.");
    warnings.push(...staleNotices);
    if (warnings.length > 0 && !window.confirm(`${warnings.join("\n")}\n그래도 내려받을까요?`)) return;
    const bundle = { createdAt: today, summary, deadlines, draft: fileDraft, compare, ocrFileNames, staleNotices };
    if (format === "hwpx") await downloadHwpx(bundle);
    else downloadHtml(bundle);
    setDownloaded(true);
  };

  const isOther = summary?.lawsuitType === "other";
  const needsCaseLabel = Boolean(summary?.identity.needsUserInput && !summary.identity.manualLabel);

  return (
    <div className="space-y-6">
      <InputPanel value={input} setValue={updateInput} onSubmit={summarize} busy={busy !== null} locked={compareBusy} today={today} />

      {failure?.step === "summarize" && <ErrorNotice message={failure.message} onRetry={summarize} busy={busy !== null} />}

      {summary && (
        <section className={SECTION}>
          <h2 className="step-title"><span className="step-no">2</span>정리 결과</h2>
          {ocrFileNames.length > 0 && (
            <p role="status" className="notice notice-info">
              ⓘ 스캔본이라 OCR(AI 글자 인식)로 읽은 파일이 있어요: {ocrFileNames.join(", ")}. 글자를 잘못 읽었을 수 있으니, 결과의 날짜·금액·이름·사건번호는 원본과 한 번 대조해 주세요.
            </p>
          )}
          {inputStale && (
            <p role="status" className="notice notice-warn font-semibold">
              ⚠ 정리한 뒤에 입력(소송 유형·파일·이메일)이 바뀌었어요. 아래 결과는 이전 입력으로 만든 거예요. [회신 정리하기]를 다시 눌러 주세요.
            </p>
          )}
          <CaseHeader
            summary={summary}
            onManualLabel={(manualLabel) => {
              setSummary((prev) => (prev ? { ...prev, identity: { ...prev.identity, manualLabel } } : prev));
              setDownloaded(false);
            }}
          />
          {summary.typeMismatchWarning && (
            <p className="notice notice-warn">
              ⚠ {summary.typeMismatchWarning} (고른 소송 유형은 바꾸지 않았어요)
            </p>
          )}
          {deadlines && <DeadlineTable deadlines={deadlines} disposals={summary.disposals} onSetLegalActDate={setLegalActDate} today={today} />}
          {summary.checklist && <ChecklistTable checklist={summary.checklist} />}
          <IssuesAndOpinion summary={summary} />
          <Glossary glossary={summary.glossary} />
          <CaseInfoCompare compare={compare} busy={compareBusy} error={compareError} onCompare={(c) => void runCompare(c)} />

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-5">
            {isOther ? (
              <>
                <span className="text-base muted">초안 양식은 사해행위취소 전용이에요. 정리 결과만 내려받을 수 있어요.</span>
                <button type="button" onClick={() => void download("html")} className={PRIMARY_BUTTON}>
                  정리 결과 HTML로 내려받기
                </button>
              </>
            ) : (
              <>
                {busy === "draft" && (
                  <span className="flex items-center gap-2 text-base font-semibold text-[var(--brand-strong)]">
                    <Mascot name="go" size={56} />
                    초안을 쓰고 있어요!
                  </span>
                )}
                {needsCaseLabel && <span className="text-base muted">사건 표시를 먼저 정해 주세요.</span>}
                {/* 담당자·검토자 참고용 정리 결과(점검표·제척기간·원문 위치)만 받고 싶을 때. 초안이 있어도 받을 수 있다 */}
                <button
                  type="button"
                  onClick={() => void download("html", true)}
                  className={SECONDARY_BUTTON}
                >
                  정리 결과만 HTML로 내려받기
                </button>
                <button type="button" onClick={makeDraft} disabled={busy !== null || needsCaseLabel} className={PRIMARY_BUTTON}>
                  {busy === "draft" ? "초안 만드는 중… (30초 안팎)" : draft ? "초안 다시 만들기" : "초안 만들기"}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {failure?.step === "draft" && <ErrorNotice message={failure.message} onRetry={makeDraft} busy={busy !== null} />}

      {summary && draft && (
        <section className={SECTION}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="step-title mb-0 flex-1"><span className="step-no">3</span>소송 의뢰 초안</h2>
            {remaining > 0 && (
              <span className="chip chip-warn">
                [확인 필요] {remaining}곳 남음 ⚠
              </span>
            )}
          </div>
          {draftStale && (
            <p role="status" className="notice notice-warn font-semibold">
              ⚠ &apos;취소원인을 안 날&apos;을 바꿨어요. 초안 4번(제척기간 검토)은 이전 값으로 만든 거라 위의 제척기간 표와 다를 수 있어요. [초안 다시 만들기]로 맞출 수 있어요.
            </p>
          )}
          <DraftEditor
            draft={draft}
            disposals={summary.disposals}
            onChange={(next) => {
              setDraft(next);
              setDownloaded(false);
            }}
          />
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--line)] pt-5">
            {downloaded && (
              <span className="flex items-center gap-2 text-base font-semibold text-[var(--ok-fg)]">
                <Mascot name="thanks" size={56} />✓ 내려받았어요. 수고하셨어요!
              </span>
            )}
            <button
              type="button"
              onClick={() => void download("hwpx")}
              className={SECONDARY_BUTTON}
            >
              한글(.hwpx)로 내려받기
            </button>
            <button type="button" onClick={() => void download("html")} className={PRIMARY_BUTTON}>
              HTML로 내려받기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
