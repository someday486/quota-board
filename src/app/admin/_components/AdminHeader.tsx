'use client';

import { ghostBtn } from '../styles';
import { useIsMobile } from '@/hooks/useIsMobile';

type AdminHeaderProps = {
  adminName: string;
  todayLabel: string;
  onGoHr: () => void;
  onLogout: () => void;
  onGoDashboard?: () => void;
  onGoPeople?: () => void;
  activePage?: 'dashboard' | 'people';
};

export default function AdminHeader({
  adminName,
  todayLabel,
  onGoHr,
  onLogout,
  onGoDashboard,
  onGoPeople,
  activePage = 'dashboard',
}: AdminHeaderProps) {
  const isMobile = useIsMobile();

  const tabBtn = (active: boolean) => ({
    ...ghostBtn,
    ...(isMobile ? { width: '100%', justifyContent: 'center' as const } : {}),
    ...(active ? { background: '#111', color: '#fff', borderColor: '#111' } : {}),
  });

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.2px' }}>관리자 대시보드</div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
          현재 접속 관리자: <b style={{ color: '#111827' }}>{adminName}</b>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: isMobile ? 'stretch' : 'flex-end',
          width: isMobile ? '100%' : 'auto',
        }}
      >
        <div style={{ fontSize: 12, color: '#6b7280', width: isMobile ? '100%' : 'auto' }}>{todayLabel}</div>
        {onGoDashboard && (
          <button onClick={onGoDashboard} style={tabBtn(activePage === 'dashboard')}>
            대시보드
          </button>
        )}
        {onGoPeople && (
          <button onClick={onGoPeople} style={tabBtn(activePage === 'people')}>
            인원 관리
          </button>
        )}
        <button onClick={onGoHr} style={{ ...ghostBtn, ...(isMobile ? { width: '100%' } : {}) }}>
          휴가 신청
        </button>
        <button onClick={onLogout} style={{ ...ghostBtn, ...(isMobile ? { width: '100%' } : {}) }}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
