'use client';

import { dangerMiniBtn, tdSmall, thSmall } from '../styles';
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
};

type ReserveListProps = {
  reserveApplies: LiveApplyRow[];
  regionsMap: Map<string, RegionRow>;
  promoteReserveApply: (row: LiveApplyRow) => void;
  deleteApply: (row: LiveApplyRow) => void;
  busyDelete: string | null;
  formatDateTime: (value?: string | null) => string;
};

export default function ReserveList({
  reserveApplies,
  regionsMap,
  promoteReserveApply,
  deleteApply,
  busyDelete,
  formatDateTime,
}: ReserveListProps) {
  const isMobile = useIsMobile();

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'baseline', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>예비 등록 목록</h2>
        <div style={{ fontSize: 12, color: '#64748b' }}>총 {reserveApplies.length}건</div>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, overflowX: 'auto', overflowY: 'hidden', maxWidth: 1100, background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: isMobile ? 13 : 14 }}>
          <thead>
            <tr style={{ background: '#f6f7f9' }}>
              <th style={{ ...thSmall, width: 140 }}>시간</th>
              <th style={{ ...thSmall, width: 70 }}>지점</th>
              <th style={{ ...thSmall, width: 90 }}>리더</th>
              <th style={thSmall}>기업명</th>
              <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>등록</th>
              <th style={{ ...thSmall, width: 70, textAlign: 'center' }}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {reserveApplies.map((a) => {
              const rn = regionsMap.get(a.region_id)?.region_name ?? a.region_id;
              return (
                <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ ...tdSmall, width: 140, whiteSpace: 'nowrap' }}>{formatDateTime(a.created_at)}</td>
                  <td style={{ ...tdSmall, width: 70, whiteSpace: 'nowrap' }}>{rn}</td>
                  <td style={{ ...tdSmall, width: 90, whiteSpace: 'nowrap', fontWeight: 900 }}>{a.leader_name}</td>
                  <td style={{ ...tdSmall }}>
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
                    <button onClick={() => deleteApply(a)} style={dangerMiniBtn} disabled={busyDelete === a.id}>
                      {busyDelete === a.id ? '삭제중..' : '삭제'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {reserveApplies.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
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
