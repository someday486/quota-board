'use client';

import { xBtn } from '../styles';

type Toast = {
  id: string;
  type: 'success' | 'info';
  text: string;
};

type ToastsProps = {
  toasts: Toast[];
  onClose: (id: string) => void;
};

export default function Toasts({ toasts, onClose }: ToastsProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            minWidth: 220,
            maxWidth: 360,
            background: t.type === 'success' ? '#ecfdf5' : '#eff6ff',
            border: `1px solid ${t.type === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
            color: '#111827',
            borderRadius: 12,
            padding: '10px 12px',
            boxShadow: '0 12px 30px rgba(17, 24, 39, 0.12)',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ lineHeight: 1.4 }}>{t.text}</div>
          <button onClick={() => onClose(t.id)} style={{ ...xBtn, pointerEvents: 'auto' }} aria-label="?リ린">
            횞
          </button>
        </div>
      ))}
    </div>
  );
}
