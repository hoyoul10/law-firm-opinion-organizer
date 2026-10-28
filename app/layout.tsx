import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로펌 의견 정리기",
  description: "법무법인 검토회신을 정리하고 소송 의뢰 초안을 만드는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
