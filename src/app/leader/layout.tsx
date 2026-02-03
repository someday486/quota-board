import { ReactNode } from 'react';
import type { Metadata } from "next";
import AuthGate from '@/components/AuthGate';

export const metadata: Metadata = {
  title: "팀장",
  description:
    "지역별 잔여 T/O 확인 및 지원 현황을 조회하고, 조건에 따라 지원을 진행합니다.",
};
export default function LeaderLayout({ children }: { children: ReactNode }) {
  return <AuthGate requiredRole="leader">{children}</AuthGate>;
}
