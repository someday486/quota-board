'use client';

import type { Dispatch, SetStateAction } from 'react';
import {
  dangerMiniBtn,
  input,
  rowBtn,
  tdSmall,
  thSmall,
} from '../styles';
import RecordingsCell from './RecordingsCell';

type RegionRow = {
  id: string;
  region_name: string;
  sort_order: number;
};

type LiveApplyRow = {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string;
  company_name: string;
  is_excluded: boolean;
  is_reserve: boolean;
};

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

type ApplyListProps = {
  filteredApplies: LiveApplyRow[];
  regionsMap: Map<string, RegionRow>;
  applyRegionFilter: string;
  setApplyRegionFilter: (value: string) => void;
  applyQuery: string;
  setApplyQuery: (value: string) => void;
  onResetFilter: () => void;
  editingCompanyId: string | null;
  setEditingCompanyId: (value: string | null) => void;
  companyInputById: Record<string, string>;
  setCompanyInputById: Dispatch<SetStateAction<Record<string, string>>>;
  isComposingCompanyById: Record<string, boolean>;
  setIsComposingCompanyById: Dispatch<SetStateAction<Record<string, boolean>>>;
  busyUpdateCompanyId: string | null;
  updateCompanyName: (id: string) => void;
  recordingsByAppId: Record<string, CallRecordingRow | null>;
  uploadingByAppId: Record<string, boolean>;
  dragOverAppId: string | null;
  setDragOverAppId: (value: string | null) => void;
  audioUrlByAppId: Record<string, string>;
  openPlayerAppId: string | null;
  handleUploadRecording: (applicationId: string, file: File) => void;
  handlePlayRecording: (applicationId: string) => void;
  handleDeleteRecording: (applicationId: string) => void;
  handleToggleReviewed: (applicationId: string, checked: boolean) => void;
  toggleExcludeApply: (row: LiveApplyRow) => void;
  deleteApply: (row: LiveApplyRow) => void;
  busyDelete: string | null;
  formatDateTime: (value?: string | null) => string;
};

export default function ApplyList({
  filteredApplies,
  regionsMap,
  applyRegionFilter,
  setApplyRegionFilter,
  applyQuery,
  setApplyQuery,
  onResetFilter,
  editingCompanyId,
  setEditingCompanyId,
  companyInputById,
  setCompanyInputById,
  isComposingCompanyById,
  setIsComposingCompanyById,
  busyUpdateCompanyId,
  updateCompanyName,
  recordingsByAppId,
  uploadingByAppId,
  dragOverAppId,
  setDragOverAppId,
  audioUrlByAppId,
  openPlayerAppId,
  handleUploadRecording,
  handlePlayRecording,
  handleDeleteRecording,
  handleToggleReviewed,
  toggleExcludeApply,
  deleteApply,
  busyDelete,
  formatDateTime,
}: ApplyListProps) {
  return (
    <div
      style={{
        marginTop: 18,
        width: '100%',
        maxWidth: 1400,
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        overflowX: 'auto',
        overflowY: 'hidden',
        background: '#fff',
        boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          background: 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>팀장 지원 목록</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>현재 · 삭제 가능</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <select
            value={applyRegionFilter}
            onChange={(e) => setApplyRegionFilter(e.target.value)}
            style={{ ...input, height: 34, padding: '0 10px', width: 66 }}
          >
            <option value="">전체</option>
            {Array.from(regionsMap.values())
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.region_name}
                </option>
              ))}
          </select>

          <input
            value={applyQuery}
            onChange={(e) => setApplyQuery(e.target.value)}
            placeholder="지역·팀장·기업명 검색"
            lang="ko"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...input, height: 34, padding: '0 10px', width: 150 }}
          />

          <button
            onClick={onResetFilter}
            style={{ ...rowBtn, height: 34, padding: '0 10px', opacity: applyQuery || applyRegionFilter ? 1 : 0.6 }}
            disabled={!applyQuery && !applyRegionFilter}
          >
            초기화
          </button>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 14,
              tableLayout: 'fixed',
              width: '100%',
            }}
          >
            <thead>
              <tr style={{ background: '#f6f7f9', borderBottom: '1px solid #eee' }}>
                <th style={{ ...thSmall, width: 140, textAlign: 'center' }}>시간</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>지역</th>
                <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>팀장</th>
                <th style={{ ...thSmall }}>기업명</th>
                <th style={{ ...thSmall, width: 310, textAlign: 'center' }}>녹취</th>
                <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>검수</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>제외</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>

            <tbody>
              {filteredApplies.map((a) => {
                const rn = regionsMap.get(a.region_id)?.region_name ?? a.region_id;
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid #eee', background: a.is_excluded ? '#f8fafc' : '#ffffff' }}>
                    <td style={{ ...tdSmall, width: 140, textAlign: 'center' }}>{formatDateTime(a.created_at)}</td>
                    <td style={{ ...tdSmall, width: 70, textAlign: 'center' }}>{rn}</td>
                    <td style={{ ...tdSmall, width: 90, textAlign: 'center' }}>
                      <b>{a.leader_name}</b>
                    </td>
                    <td
                      style={{
                        ...tdSmall,
                        minWidth: 260,
                        ...(editingCompanyId === a.id
                          ? { whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'clip' }
                          : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                      }}
                      title={a.company_name}
                    >
                      {editingCompanyId === a.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
                          <input
                            value={companyInputById[a.id] ?? a.company_name ?? ''}
                            onChange={(e) => setCompanyInputById((p) => ({ ...p, [a.id]: e.target.value }))}
                            onCompositionStart={() => setIsComposingCompanyById((p) => ({ ...p, [a.id]: true }))}
                            onCompositionEnd={(e) => {
                              setIsComposingCompanyById((p) => ({ ...p, [a.id]: false }));
                              setCompanyInputById((p) => ({ ...p, [a.id]: (e.target as HTMLInputElement).value }));
                            }}
                            style={{
                              ...input,
                              height: 32,
                              width: 'auto',
                              flex: 1,
                              minWidth: 0,
                              maxWidth: 'none',
                              textAlign: 'left',
                            }}
                            placeholder="기업명 수정"
                            lang="ko"
                            inputMode="text"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                          />
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              onClick={() => updateCompanyName(a.id)}
                              style={rowBtn}
                              disabled={busyUpdateCompanyId === a.id || !!isComposingCompanyById[a.id]}
                            >
                              {busyUpdateCompanyId === a.id ? '저장중...' : '저장'}
                            </button>
                            <button onClick={() => setEditingCompanyId(null)} style={rowBtn}>
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                          <span
                            title={a.company_name ?? ''}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {a.company_name}
                          </span>

                          <button
                            onClick={() => {
                              setEditingCompanyId(a.id);
                              setCompanyInputById((p) => ({ ...p, [a.id]: a.company_name ?? '' }));
                            }}
                            style={{ ...rowBtn, flex: '0 0 auto' }}
                          >
                            수정
                          </button>
                        </div>
                      )}
                    </td>

                    {/* ✅ 녹취 업로드/재생 */}
                    <RecordingsCell
                      recording={recordingsByAppId[a.id]}
                      uploading={!!uploadingByAppId[a.id]}
                      dragOn={dragOverAppId === a.id}
                      audioUrl={audioUrlByAppId[a.id]}
                      isOpen={openPlayerAppId === a.id}
                      onDragOver={() => setDragOverAppId(a.id)}
                      onDragLeave={() => setDragOverAppId(null)}
                      onDrop={(file) => handleUploadRecording(a.id, file)}
                      onUpload={(file) => handleUploadRecording(a.id, file)}
                      onPlay={() => handlePlayRecording(a.id)}
                      onDelete={() => handleDeleteRecording(a.id)}
                    />

                    {/* ✅ 검수 완료 체크 */}
                    <td style={{ ...tdSmall, width: 90, textAlign: 'center' }}>
                      {(() => {
                        const rec = recordingsByAppId[a.id];
                        const checked = !!rec?.reviewed;

                        return (
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: rec ? 'pointer' : 'not-allowed',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!rec}
                              onChange={(e) => handleToggleReviewed(a.id, e.target.checked)}
                            />
                            <span style={{ fontSize: 13, fontWeight: 900, color: checked ? '#166534' : '#64748b' }}>
                              {checked ? '완료' : '미완료'}
                            </span>
                          </label>
                        );
                      })()}
                    </td>

                    <td style={{ ...tdSmall, width: 70, textAlign: 'center' }}>
                      <button
                        onClick={() => toggleExcludeApply(a)}
                        style={{
                          height: 32,
                          padding: '0 10px',
                          minWidth: 54,
                          borderRadius: 10,
                          border: a.is_excluded ? '1px solid #0f172a' : '1px solid #475569',
                          background: a.is_excluded ? '#0f172a' : '#ffffff',
                          color: a.is_excluded ? '#ffffff' : '#0f172a',
                          fontWeight: 900,
                          cursor: 'pointer',
                          opacity: busyDelete ? 0.6 : 1,
                        }}
                        disabled={!!busyDelete}
                        title={a.is_excluded ? '현재 제외 상태(클릭하면 해제)' : '클릭하면 제외 처리'}
                      >
                        {a.is_excluded ? '해제' : '제외'}
                      </button>
                    </td>

                    <td style={{ ...tdSmall, width: 70, textAlign: 'center' }}>
                      <button onClick={() => deleteApply(a)} style={dangerMiniBtn} disabled={busyDelete === a.id}>
                        {busyDelete === a.id ? '삭제중...' : '삭제'}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredApplies.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
                    표시할 지원 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
