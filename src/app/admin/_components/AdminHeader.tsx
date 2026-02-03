'use client';

import { ghostBtn } from '../styles';

type AdminHeaderProps = {
  adminName: string;
  todayLabel: string;
  onGoHr: () => void;
  onLogout: () => void;
};

export default function AdminHeader({ adminName, todayLabel, onGoHr, onLogout }: AdminHeaderProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.2px' }}>관리자 대시보드</div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
          현재 접속 관리자: <b style={{ color: '#111827' }}>{adminName}</b>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{todayLabel}</div>
        {/* 휴가 신청(캘린더 페이지 이동 버튼) */}
        <button onClick={onGoHr} style={ghostBtn}>
          휴가 신청
        </button>
        <button onClick={onLogout} style={ghostBtn}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
