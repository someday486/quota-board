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
  onGoWiki?: () => void;
  onGoRecordings?: () => void;
  activePage?: 'dashboard' | 'people' | 'wiki' | 'recordings';
};

export default function AdminHeader({
  adminName,
  todayLabel,
  onGoHr,
  onLogout,
  onGoDashboard,
  onGoPeople,
  onGoWiki,
  onGoRecordings,
  activePage = 'dashboard',
}: AdminHeaderProps) {
  const isMobile = useIsMobile();

  const tabBtn = (active: boolean) => ({
    ...ghostBtn,
    ...(isMobile ? { width: '100%', justifyContent: 'center' as const } : {}),
    ...(active ? { background: '#111', color: '#fff', borderColor: '#111' } : {}),
  });

  const todayBadgeStyle = {
    alignSelf: isMobile ? ('flex-start' as const) : ('center' as const),
    padding: '7px 12px',
    borderRadius: 999,
    border: '1px solid #bfdbfe',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '-0.1px',
    whiteSpace: 'nowrap' as const,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
  };

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
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.2px' }}>관리자 대시보드</div>
          {todayLabel ? <div style={todayBadgeStyle}>오늘 {todayLabel}</div> : null}
        </div>
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
        {onGoWiki && (
          <button onClick={onGoWiki} style={tabBtn(activePage === 'wiki')}>
            업무 위키
          </button>
        )}
        {onGoRecordings && (
          <button onClick={onGoRecordings} style={tabBtn(activePage === 'recordings')}>
            녹취 아카이브
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
