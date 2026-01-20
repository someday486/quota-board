import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "섭외센터 지역 TO 관리",
    template: "%s | 섭외센터 지역 TO 관리",
  },
  description:
    "섭외센터의 지역별 T/O를 실시간으로 관리하고 팀·팀장 지원 현황을 한눈에 확인하는 내부 운영 시스템입니다.",
  robots: {
    index: false,
    follow: false,
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* ✅ OS / 브라우저 다크모드 무시하고 라이트 고정 */}
        <meta name="color-scheme" content="light" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
