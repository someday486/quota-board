'use client';

import { alertBox, xBtn } from '../styles';

type ErrorAlertProps = {
  message: string;
  onClose: () => void;
};

export default function ErrorAlert({ message, onClose }: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div
      style={{
        ...alertBox,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ lineHeight: 1.5 }}>{message}</div>
      <button onClick={onClose} style={xBtn} aria-label="?リ린">
        횞
      </button>
    </div>
  );
}
