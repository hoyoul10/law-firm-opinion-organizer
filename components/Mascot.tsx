// 캠코 공식 마스코트 키우미 그림 (public/brand). 화면 꾸밈용이라 읽어 주지 않게(alt="") 한다.
// 소송 의뢰서(초안) 같은 내려받는 파일에는 넣지 않는다 (담당자 결정 2026-10-29)

import Image from "next/image";

const SRC = {
  wave: "/brand/kiumi-wave.png",
  go: "/brand/kiumi-go.png",
  thanks: "/brand/kiumi-thanks.png",
  basic: "/brand/kiumi-basic.png",
} as const;

export default function Mascot({ name, size = 72, className }: { name: keyof typeof SRC; size?: number; className?: string }) {
  return <Image src={SRC[name]} alt="" width={size} height={size} unoptimized aria-hidden="true" className={className} />;
}
