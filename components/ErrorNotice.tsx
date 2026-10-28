// 실패 안내와 [다시 시도]. 올린 파일·입력한 날짜는 그대로 둔다 (Design Ref: §3.1 실패 안내)

interface Props {
  message: string;
  onRetry: () => void;
  busy: boolean;
}

export default function ErrorNotice({ message, onRetry, busy }: Props) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      <span>
        {message}
        <span className="block text-xs opacity-80">올린 파일과 입력한 내용은 그대로 있어요.</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="shrink-0 rounded-md border border-red-400 px-3 py-1 font-medium disabled:opacity-40"
      >
        {busy ? "다시 하는 중…" : "다시 시도"}
      </button>
    </div>
  );
}
