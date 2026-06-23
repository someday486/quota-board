'use client';

import { useIsMobile } from '@/hooks/useIsMobile';
import { dangerMiniBtn, rowBtn, tdSmall, thSmall } from '../styles';

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

type ReserveListProps = {
  reserveApplies: LiveApplyRow[];
  regionsMap: Map<string, RegionRow>;
  promoteReserveApply: (row: LiveApplyRow) => void;
  toggleExcludeApply: (row: LiveApplyRow) => void;
  deleteApply: (row: LiveApplyRow) => void;
  busyDelete: string | null;
  intranetStatusByAppId: Record<string, IntranetCheckResult>;
  onCheckReserveIntranetRegistration: () => void;
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

function reserveIntranetStatusStyle(status?: IntranetCheckStatus) {
  if (status === 'missing') {
    return { border: '#bbf7d0', background: '#f0fdf4', color: '#166534' };
  }
  if (status === 'registered' || status === 'multiple' || status === 'error') {
    return { border: '#fecaca', background: '#fef2f2', color: '#b91c1c' };
  }
  if (status === 'date_mismatch' || status === 'similar') {
    return { border: '#fde68a', background: '#fffbeb', color: '#92400e' };
  }
  return { border: '#e5e7eb', background: '#f8fafc', color: '#64748b' };
}

function intranetStatusTitle(result?: IntranetCheckResult) {
  if (!result) return '예비 등록 인트라넷 확인 버튼을 눌러 확인하세요.';
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

function ReserveIntranetBadge({ result }: { result?: IntranetCheckResult }) {
  const colors = reserveIntranetStatusStyle(result?.status);
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

export default function ReserveList({
  reserveApplies,
  regionsMap,
  promoteReserveApply,
  toggleExcludeApply,
  deleteApply,
  busyDelete,
  intranetStatusByAppId,
  onCheckReserveIntranetRegistration,
  busyIntranetCheck,
  formatDateTime,
}: ReserveListProps) {
  const isMobile = useIsMobile();

  return (
    <div style={{ marginTop: 26 }}>
      <div
        style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'baseline',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>예비 등록 목록</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>총 {reserveApplies.length}건</div>
          <button
            onClick={onCheckReserveIntranetRegistration}
            style={{
              ...rowBtn,
              height: 34,
              padding: '0 10px',
              opacity: reserveApplies.length > 0 && !busyIntranetCheck ? 1 : 0.6,
            }}
            disabled={reserveApplies.length === 0 || busyIntranetCheck}
            title="예비 등록 목록이 인트라넷에 등록되어 있는지 확인"
          >
            {busyIntranetCheck ? '등록 확인중...' : '예비 인트라넷 확인'}
          </button>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 10,
          overflowX: 'auto',
          overflowY: 'hidden',
          maxWidth: 1100,
          background: '#fff',
        }}
      >
        <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', fontSize: isMobile ? 13 : 14 }}>
          <thead>
            <tr style={{ background: '#f6f7f9' }}>
              <th style={{ ...thSmall, width: 140 }}>시간</th>
              <th style={{ ...thSmall, width: 70 }}>지역</th>
              <th style={{ ...thSmall, width: 90 }}>팀장</th>
              <th style={thSmall}>기업명</th>
              <th style={{ ...thSmall, width: 118, textAlign: 'center' }}>인트라넷</th>
              <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>등록</th>
              <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>제외</th>
              <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {reserveApplies.map((a) => {
              const rn = regionsMap.get(a.region_id)?.region_name ?? a.region_id;
              const intranet = intranetStatusByAppId[a.id];
              const isRegisteredIntranet = intranet?.status === 'registered' || intranet?.status === 'multiple';

              return (
                <tr key={a.id} style={{ borderTop: '1px solid #eee', background: isRegisteredIntranet ? '#fff1f2' : a.is_excluded ? '#f8fafc' : '#ffffff' }}>
                  <td style={{ ...tdSmall, width: 140, whiteSpace: 'nowrap' }}>{formatDateTime(a.created_at)}</td>
                  <td style={{ ...tdSmall, width: 70, whiteSpace: 'nowrap' }}>{rn}</td>
                  <td style={{ ...tdSmall, width: 90, whiteSpace: 'nowrap', fontWeight: 900 }}>{a.leader_name}</td>
                  <td style={tdSmall}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 900,
                          background: '#fff7ed',
                          border: '1px solid #fdba74',
                          color: '#9a3412',
                        }}
                      >
                        예비
                      </span>
                      <span style={{ fontWeight: 900 }}>{a.company_name}</span>
                    </span>
                  </td>

                  <td style={{ ...tdSmall, width: 118, textAlign: 'center' }}>
                    <ReserveIntranetBadge result={intranet} />
                  </td>

                  <td style={{ ...tdSmall, width: 70, textAlign: 'center' }}>
                    <button
                      onClick={() => promoteReserveApply(a)}
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
                      title="예비 등록을 정식으로 등록"
                    >
                      등록
                    </button>
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
                      {busyDelete === a.id ? '삭제중..' : '삭제'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {reserveApplies.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
                  예비 등록 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
