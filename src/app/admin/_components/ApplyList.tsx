'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  dangerMiniBtn,
  input,
  rowBtn,
  tdSmall,
  thSmall,
} from '../styles';
import RecordingsCell from './RecordingsCell';
import { useIsMobile } from '@/hooks/useIsMobile';

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
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
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

type IntranetCheckStatus =
  | 'registered'
  | 'missing'
  | 'date_mismatch'
  | 'multiple'
  | 'similar'
  | 'error';

type IntranetCheckMatch = {
  companyName?: string;
  apDate?: string;
  apTime?: string;
  castDate?: string;
  castMember?: string;
  pmName?: string;
  region1?: string;
  region2?: string;
  dbRoute?: string;
  dbState?: string;
  contractCheck?: string;
  businessNumber?: string;
};

type IntranetCheckResult = {
  applicationId: string;
  status: IntranetCheckStatus;
  expectedApDate?: string;
  appliedDate?: string;
  matchCount?: number;
  matches?: IntranetCheckMatch[];
  reason?: string;
};

type ApplyListProps = {
  filteredApplies: LiveApplyRow[];
  totalApplies: number;
  hasAnyApplies: boolean;
  regionsMap: Map<string, RegionRow>;
  applyRegionFilter: string;
  setApplyRegionFilter: (value: string) => void;
  applyQuery: string;
  setApplyQuery: (value: string) => void;
  applyPage: number;
  applyPageCount: number;
  onApplyPageChange: (value: number) => void;
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
  onSyncToSheet: () => void;
  busySyncToSheet: boolean;
  intranetStatusByAppId: Record<string, IntranetCheckResult>;
  onCheckIntranetRegistration: () => void;
  busyIntranetCheck: boolean;
  formatDateTime: (value?: string | null) => string;
};

function intranetStatusLabel(status?: IntranetCheckStatus) {
  if (status === 'registered') return '등록완료';
  if (status === 'missing') return '미등록';
  if (status === 'date_mismatch') return '날짜확인';
  if (status === 'multiple') return '중복확인';
  if (status === 'similar') return '유사확인';
  if (status === 'error') return '오류';
  return '미확인';
}

function intranetStatusStyle(status?: IntranetCheckStatus) {
  if (status === 'registered') {
    return { border: '#bbf7d0', background: '#f0fdf4', color: '#166534' };
  }
  if (status === 'missing' || status === 'error') {
    return { border: '#fecaca', background: '#fef2f2', color: '#b91c1c' };
  }
  if (status === 'date_mismatch' || status === 'multiple' || status === 'similar') {
    return { border: '#fde68a', background: '#fffbeb', color: '#92400e' };
  }
  return { border: '#e5e7eb', background: '#f8fafc', color: '#64748b' };
}

function intranetStatusTitle(result?: IntranetCheckResult) {
  if (!result) return '인트라넷 등록확인 버튼을 눌러 확인하세요.';
  const lines = [
    `상태: ${intranetStatusLabel(result.status)}`,
    result.expectedApDate ? `예상 미팅일: ${result.expectedApDate}` : '',
    result.appliedDate ? `신청일: ${result.appliedDate}` : '',
  ].filter(Boolean);
  for (const match of result.matches ?? []) {
    lines.push(
      [
        match.companyName,
        match.apDate ? `AP ${match.apDate}${match.apTime ? ` ${match.apTime}` : ''}` : '',
        match.castMember ? `섭외자 ${match.castMember}` : '',
        match.region1 || match.region2 ? `지역 ${[match.region1, match.region2].filter(Boolean).join(' ')}` : '',
        match.dbRoute ? `경로 ${match.dbRoute}` : '',
      ]
        .filter(Boolean)
        .join(' / '),
    );
  }
  return lines.join('\n');
}

function IntranetStatusBadge({ result }: { result?: IntranetCheckResult }) {
  const colors = intranetStatusStyle(result?.status);
  const match = result?.matches?.[0];
  const subText = result
    ? match?.apDate
      ? `${match.apDate}${match.apTime ? ` ${match.apTime}` : ''}`
      : result.expectedApDate ?? ''
    : '버튼 확인';

  return (
    <div title={intranetStatusTitle(result)} style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 70,
          height: 24,
          padding: '0 8px',
          borderRadius: 999,
          border: `1px solid ${colors.border}`,
          background: colors.background,
          color: colors.color,
          fontSize: 12,
          fontWeight: 900,
          whiteSpace: 'nowrap',
        }}
      >
        {intranetStatusLabel(result?.status)}
      </span>
      <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{subText}</span>
    </div>
  );
}

export default function ApplyList({
  filteredApplies,
  totalApplies,
  hasAnyApplies,
  regionsMap,
  applyRegionFilter,
  setApplyRegionFilter,
  applyQuery,
  setApplyQuery,
  applyPage,
  applyPageCount,
  onApplyPageChange,
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
  onSyncToSheet,
  busySyncToSheet,
  intranetStatusByAppId,
  onCheckIntranetRegistration,
  busyIntranetCheck,
  formatDateTime,
}: ApplyListProps) {
  const isMobile = useIsMobile();
  const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false);

  const displayedApplies = useMemo(() => {
    if (!showUnreviewedOnly) return filteredApplies;
    return filteredApplies.filter((a) => !a.reviewed);
  }, [filteredApplies, showUnreviewedOnly]);

  const handleDownloadExcel = async () => {
    if (displayedApplies.length === 0) return;

    const rows: string[][] = [
      ['신청시각', '지역', '팀장', '기업명', '인트라넷상태', '예상미팅일', '제외여부'],
      ...displayedApplies.map((a) => {
        const intranet = intranetStatusByAppId[a.id];
        return [
          formatDateTime(a.created_at),
          regionsMap.get(a.region_id)?.region_name ?? a.region_id,
          a.leader_name ?? '',
          a.company_name ?? '',
          intranetStatusLabel(intranet?.status),
          intranet?.expectedApDate ?? '',
          a.is_excluded ? '제외' : '정상',
        ];
      }),
    ];

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];

      XLSX.utils.book_append_sheet(wb, ws, '팀장지원목록');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      const blob = new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ymd = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `팀장지원목록_${ymd}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('엑셀 파일 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <div
      style={{
        marginTop: 18,
        width: '100%',
        maxWidth: 1400,
        border: '1px solid #e5e7eb',
        borderRadius: 14,
        overflowX: isMobile ? 'hidden' : 'auto',
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
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'baseline', flexDirection: isMobile ? 'column' : 'row', gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>팀장 지원 목록</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            총계 <b style={{ color: '#374151' }}>{totalApplies}</b>건 · 페이지 <b style={{ color: '#374151' }}>{applyPage}</b>/<b style={{ color: '#374151' }}>{applyPageCount}</b> · 표시 <b style={{ color: '#374151' }}>{displayedApplies.length}</b>건
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: isMobile ? 'stretch' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
          <select
            value={applyRegionFilter}
            onChange={(e) => setApplyRegionFilter(e.target.value)}
            style={{ ...input, height: 34, padding: '0 10px', width: isMobile ? 'calc(50% - 4px)' : 66, minWidth: isMobile ? 0 : 66 }}
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
            style={{ ...input, height: 34, padding: '0 10px', width: isMobile ? 'calc(50% - 4px)' : 150, minWidth: isMobile ? 0 : 150 }}
          />

          <button
            onClick={() => {
              onResetFilter();
              setShowUnreviewedOnly(false);
            }}
            style={{ ...rowBtn, height: 34, padding: '0 10px', opacity: applyQuery || applyRegionFilter || showUnreviewedOnly ? 1 : 0.6, width: isMobile ? 'calc(50% - 4px)' : 'auto' }}
            disabled={!applyQuery && !applyRegionFilter && !showUnreviewedOnly}
          >
            초기화
          </button>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 34,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#fff',
              fontSize: 12,
              fontWeight: 800,
              color: '#334155',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              width: isMobile ? 'calc(50% - 4px)' : 'auto',
              justifyContent: 'center',
            }}
          >
            <input
              type="checkbox"
              checked={showUnreviewedOnly}
              onChange={(e) => setShowUnreviewedOnly(e.target.checked)}
            />
            검수 미완료만
          </label>

          <button
            onClick={onCheckIntranetRegistration}
            style={{
              ...rowBtn,
              height: 34,
              padding: '0 10px',
              opacity: displayedApplies.length > 0 && !busyIntranetCheck ? 1 : 0.6,
              width: isMobile ? '100%' : 'auto',
            }}
            disabled={displayedApplies.length === 0 || busyIntranetCheck}
            title="현재 표시 중인 팀장 지원 목록이 인트라넷에 다음 영업일 미팅건으로 등록됐는지 확인"
          >
            {busyIntranetCheck ? '등록 확인중...' : '인트라넷 등록확인'}
          </button>

          <button
            onClick={handleDownloadExcel}
            style={{ ...rowBtn, height: 34, padding: '0 10px', opacity: displayedApplies.length > 0 ? 1 : 0.6, width: isMobile ? '100%' : 'auto' }}
            disabled={displayedApplies.length === 0}
            title="현재 필터된 팀장 지원 목록을 엑셀(.xlsx)로 다운로드"
          >
            팀장 지원 목록 다운로드
          </button>
          <button
            onClick={onSyncToSheet}
            style={{
              ...rowBtn,
              height: 34,
              padding: '0 10px',
              opacity: hasAnyApplies && !busySyncToSheet ? 1 : 0.6,
              width: isMobile ? '100%' : 'auto',
            }}
            disabled={!hasAnyApplies || busySyncToSheet}
            title="현재 전체 팀장지원목록을 시트에 반영(기존 데이터 유지, 신규만 추가)"
          >
            {busySyncToSheet ? '동기화중...' : '시트 동기화'}
          </button>
        </div>
      </div>

      <div style={{ padding: 12 }}>
        <div
          style={{
            marginBottom: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'center',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
            페이지 크기 100건
          </div>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={() => onApplyPageChange(Math.max(1, applyPage - 1))}
              style={{ ...rowBtn, height: 32, padding: '0 10px', opacity: applyPage > 1 ? 1 : 0.6, width: isMobile ? '50%' : 'auto' }}
              disabled={applyPage <= 1}
            >
              이전
            </button>
            <button
              onClick={() => onApplyPageChange(Math.min(applyPageCount, applyPage + 1))}
              style={{
                ...rowBtn,
                height: 32,
                padding: '0 10px',
                opacity: applyPage < applyPageCount ? 1 : 0.6,
                width: isMobile ? '50%' : 'auto',
              }}
              disabled={applyPage >= applyPageCount}
            >
              다음
            </button>
          </div>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: isMobile ? 13 : 14,
              tableLayout: 'fixed',
              width: '100%',
              minWidth: 1160,
            }}
          >
            <thead>
              <tr style={{ background: '#f6f7f9', borderBottom: '1px solid #eee' }}>
                <th style={{ ...thSmall, width: 140, textAlign: 'center' }}>시간</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>지역</th>
                <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>팀장</th>
                <th style={{ ...thSmall }}>기업명</th>
                <th style={{ ...thSmall, width: 118, textAlign: 'center' }}>인트라넷</th>
                <th style={{ ...thSmall, width: 310, textAlign: 'center' }}>녹취</th>
                <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>검수</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>제외</th>
                <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>삭제</th>
              </tr>
            </thead>

            <tbody>
              {displayedApplies.map((a) => {
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

                    <td style={{ ...tdSmall, width: 118, textAlign: 'center' }}>
                      <IntranetStatusBadge result={intranetStatusByAppId[a.id]} />
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
                        const checked = !!a.reviewed;

                        return (
                          <label
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
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

              {displayedApplies.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
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
