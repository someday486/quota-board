'use client';

import { useId, useRef } from 'react';
import { tdSmall } from '../styles';

type CallRecordingRow = {
  id: string;
  application_id: string;
  file_path: string;
  file_name: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type RecordingsCellProps = {
  recording: CallRecordingRow | null;
  uploading: boolean;
  dragOn: boolean;
  audioUrl?: string;
  isOpen: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (file: File) => void;
  onUpload: (file: File) => void;
  onPlay: () => void;
  onDelete: () => void;
};

export default function RecordingsCell({
  recording,
  uploading,
  dragOn,
  audioUrl,
  isOpen,
  onDragOver,
  onDragLeave,
  onDrop,
  onUpload,
  onPlay,
  onDelete,
}: RecordingsCellProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <td style={{ ...tdSmall, width: 310 }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver();
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDragLeave();
          const file = e.dataTransfer.files?.[0];
          if (file) onDrop(file);
        }}
        style={{
          border: `1px dashed ${dragOn ? '#60a5fa' : '#cbd5e1'}`,
          background: dragOn ? '#eff6ff' : '#f8fafc',
          borderRadius: 10,
          padding: '8px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#0f172a' }}>
              {recording ? '등록됨' : '미등록'}
              {uploading ? ' · 업로드중…' : ''}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 12,
                color: '#475569',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 210,
              }}
              title={recording?.file_name ?? ''}
            >
              {recording?.file_name ?? '여기로 파일을 끌어다 놓거나 업로드 버튼을 누르세요'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#fff',
                fontWeight: 900,
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: 12,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? '업로드중' : '업로드'}
            </button>

            <button
              type="button"
              disabled={!recording}
              onClick={onPlay}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #333',
                background: '#fff',
                fontWeight: 900,
                cursor: recording ? 'pointer' : 'not-allowed',
                fontSize: 12,
                opacity: recording ? 1 : 0.5,
              }}
            >
              {isOpen ? '접기' : '재생'}
            </button>

            <button
              type="button"
              disabled={!recording || uploading}
              onClick={onDelete}
              style={{
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #b91c1c',
                background: '#fff0f0',
                color: '#b91c1c',
                fontWeight: 900,
                cursor: !recording || uploading ? 'not-allowed' : 'pointer',
                fontSize: 12,
                opacity: !recording || uploading ? 0.5 : 1,
              }}
            >
              삭제
            </button>
          </div>
        </div>

        {isOpen && audioUrl && (
          <div style={{ marginTop: 8 }}>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </td>
  );
}
