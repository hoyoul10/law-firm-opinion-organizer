// Design Ref: §3 — 주소 하나, 한 페이지에서 ①②③ 단계를 위에서 아래로

import ReplyOrganizer from "@/components/ReplyOrganizer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4">
          <h1 className="text-xl font-bold">로펌 의견 정리기</h1>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            ⓘ 실제 회신 대신 가명 문서만 쓰세요
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <ReplyOrganizer />
      </main>
    </div>
  );
}
