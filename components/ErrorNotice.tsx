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
      className="notice notice-danger flex items-center justify-between gap-4 !p-4"
    >
      <span>
        {message}
        <span className="block text-sm opacity-90">올린 파일과 입력한 내용은 그대로 있어요.</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="btn btn-secondary btn-small shrink-0"
      >
        {busy ? "다시 하는 중…" : "다시 시도"}
      </button>
    </div>
  );
}
