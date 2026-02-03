import { ReactNode } from 'react';
import type { Metadata } from "next";
import AuthGate from '@/components/AuthGate';

export const metadata: Metadata = {
  title: "관리자",
  description:
    "지역별 T/O(쿼터) 설정, 초기화/마감, 예외 처리 및 전체 지원 현황을 관리합니다.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AuthGate requiredRole="admin">{children}</AuthGate>;
}
