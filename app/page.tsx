// Design Ref: §3 — 주소 하나, 한 페이지에서 ①②③ 단계를 위에서 아래로

import ReplyOrganizer from "@/components/ReplyOrganizer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="site-header">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3 px-4 py-5">
          <div>
            <p className="text-sm font-medium tracking-wide text-white/80">한국자산관리공사 · 새출발채권관리2처 소송업무</p>
            <h1 className="text-2xl font-bold sm:text-3xl">로펌 의견 정리기</h1>
            <p className="mt-1 text-sm text-white/80">법무법인 검토회신을 올리면 쟁점·점검 항목을 정리하고, 소송 의뢰 초안을 만들어 드려요.</p>
          </div>
          <p className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium">ⓘ 실제 회신 대신 가명 문서만 쓰세요</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <ReplyOrganizer />
      </main>
    </div>
  );
}
