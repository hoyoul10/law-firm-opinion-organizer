// Design Ref: §3 — 주소 하나, 한 페이지에서 ①②③ 단계를 위에서 아래로

import Image from "next/image";
import Mascot from "@/components/Mascot";
import ReplyOrganizer from "@/components/ReplyOrganizer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="site-header">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4">
          {/* 공식 로고는 흰 바탕 그림이라 흰 판 위에 그대로 둔다 (색·비율을 바꾸지 않는다) */}
          <div className="rounded-xl bg-white px-3 py-1.5">
            <Image src="/brand/kamco-logo.gif" alt="한국자산관리공사 캠코" width={500} height={330} unoptimized priority className="h-16 w-auto" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium tracking-wide text-white/80">새출발채권관리2처 소송업무</p>
            <h1 className="text-2xl font-bold sm:text-3xl">로펌 의견 정리기</h1>
            <p className="mt-1 text-sm text-white/85">법무법인 검토회신을 올리면 쟁점·점검 항목을 정리하고, 소송 의뢰 초안을 만들어 드려요.</p>
            <p className="mt-2 inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-medium">ⓘ 실제 회신 대신 가명 문서만 쓰세요</p>
          </div>
          <div className="hidden shrink-0 items-end gap-2 sm:flex" aria-hidden="true">
            <Mascot name="wave" size={96} className="drop-shadow" />
            <p className="mb-3 hidden whitespace-nowrap rounded-2xl rounded-bl-none bg-white px-3 py-1.5 text-sm font-bold text-[var(--kamco-blue)] lg:block">안녕하세요! 오늘도 힘내요 🙂</p>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <ReplyOrganizer />
      </main>
    </div>
  );
}
