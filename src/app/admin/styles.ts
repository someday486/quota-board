import type { CSSProperties } from 'react';

export const alertBox: CSSProperties = {
  marginTop: 10,
  padding: '10px 12px',
  border: '1px solid #f1c0c0',
  background: '#fff5f5',
  color: '#b40000',
  borderRadius: 8,
};

export const th: CSSProperties = {
  padding: '12px 12px',
  textAlign: 'left',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
};

export const td: CSSProperties = {
  padding: '12px 12px',
  verticalAlign: 'middle',
};

export const thSmall: CSSProperties = {
  padding: '10px 10px',
  textAlign: 'left',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
};

export const tdSmall: CSSProperties = {
  padding: '10px 10px',
};

export const thTiny: CSSProperties = {
  padding: '8px 8px',
  textAlign: 'center',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
  whiteSpace: 'nowrap',
};

export const tdTiny: CSSProperties = {
  padding: '8px 8px',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  verticalAlign: 'middle',
};

export const input: CSSProperties = {
  width: 90,
  height: 36,
  padding: '0 10px',
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 8,
  textAlign: 'right',
};

export const pillOpen: CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #cfe9d6',
  background: '#f0fff4',
  fontWeight: 800,
  fontSize: 12,
};

export const pillClosed: CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #f0c3c3',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  fontSize: 12,
};

export const primaryBtn: CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

export const dangerBtn: CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
};

export const ghostBtn: CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

export const helpBox: CSSProperties = {
  marginTop: 18,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: '12px 14px',
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
};

export const xBtn: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 900,
  lineHeight: '26px',
  textAlign: 'center',
  color: '#6b7280',
};

export const miniInput: CSSProperties = {
  height: 28,
  width: 90,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 13,
};

export const miniBtn: CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 13,
};

export const miniPrimaryBtn: CSSProperties = {
  height: 30,
  padding: '0 10px',
  minWidth: 54,
  borderRadius: 10,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
  fontSize: 13,
};

export const miniDangerBtn: CSSProperties = {
  height: 30,
  padding: '0 10px',
  minWidth: 54,
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
  fontSize: 13,
};

export const rowBtn: CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  maxWidth: '100%',
  whiteSpace: 'nowrap',
};

export const dangerMiniBtn: CSSProperties = {
  height: 32,
  padding: '0 10px',
  minWidth: 54,
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
};

// 지역별 지원 보드 색상
export const REGION_BOARD_COLOR: Record<string, string> = {
  부산: '#CFE8C5',
  대구: '#FFD6F0',
  대전: '#E3ECF9',
  전북: '#FFF200',
  광주: '#FFD9B3',
  제주: '#E0E0E0',
  원주: '#00F5F5',
};
