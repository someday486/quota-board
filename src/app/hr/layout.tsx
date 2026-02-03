import { ReactNode } from 'react';
import AuthGate from '@/components/AuthGate';

export default function HrLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
