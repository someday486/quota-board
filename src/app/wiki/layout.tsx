import { ReactNode } from 'react';
import type { Metadata } from 'next';
import AuthGate from '@/components/AuthGate';

export const metadata: Metadata = {
  title: '업무 위키',
  description: '섭외센터 업무 매뉴얼과 상품 지식을 검색하고 열람합니다.',
};

export default function WikiLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
