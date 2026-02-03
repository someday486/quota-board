'use client';

import { ReactNode } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';

type AuthGateProps = {
  children: ReactNode;
  requiredRole?: 'admin' | 'leader';
};

export default function AuthGate({ children, requiredRole }: AuthGateProps) {
  const { checking } = useRequireAuth({ requiredRole });

  if (checking) {
    return (
      <div
        style={{
          minHeight: '40vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontWeight: 700,
        }}
      >
        Checking session...
      </div>
    );
  }

  return <>{children}</>;
}
