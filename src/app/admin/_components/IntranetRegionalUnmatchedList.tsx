'use client';

import { rowBtn, tdSmall, thSmall } from '../styles';
import { useIsMobile } from '@/hooks/useIsMobile';

type RegionalQuotaCandidate = {
  id?: string;
  leaderName?: string;
  companyName?: string;
  isReserve?: boolean;
  isExcluded?: boolean;
};

export type RegionalUnmatchedRow = {
  id?: string;
  companyName?: string;
  apDate?: string;
  apTime?: string;
  castDate?: string;
  castMember?: string;
  pmName?: string;
  region1?: string;
  region2?: string;
  address?: string;
  dbRoute?: string;
  dbState?: string;
  contractCheck?: string;
  businessNumber?: string;
  missingReason?: string;
  quotaCandidates?: RegionalQuotaCandidate[];
};

export type RegionalUnmatchedMeta = {
  baseDate?: string;
  targetDate?: string;
  quotaCount?: number;
  intranetRegionalCount?: number;
  unmatchedCount?: number;
};

type Props = {
  rows: RegionalUnmatchedRow[];
  meta: RegionalUnmatchedMeta | null;
  busy: boolean;
  onCheck: () => void;
};

function reasonLabel(reason?: string) {
  if (reason === 'company_duplicate_person_mismatch') return '섭외자 불일치';
  if (reason === 'company_not_found') return '쿼터보드 없음';
  return '확인필요';
}

function candidateText(candidates?: RegionalQuotaCandidate[]) {
  const list = candidates ?? [];
  if (list.length === 0) return '';
  return list
    .map((candidate) =>
      [
        candidate.companyName,
        candidate.leaderName ? `팀장 ${candidate.leaderName}` : '',
        candidate.isReserve ? '예비' : '',
        candidate.isExcluded ? '제외' : '',
      ]
        .filter(Boolean)
        .join(' / '),
    )
    .join('\n');
}

export default function IntranetRegionalUnmatchedList({ rows, meta, busy, onCheck }: Props) {
  const isMobile = useIsMobile();

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
          <div style={{ fontSize: 15, fontWeight: 900 }}>인트라넷 지방 누락</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {meta ? (
              <>
                AP <b style={{ color: '#374151' }}>{meta.targetDate || '-'}</b> · 인트라넷 지방 <b style={{ color: '#374151' }}>{meta.intranetRegionalCount ?? 0}</b>건 · 쿼터보드 <b style={{ color: '#374151' }}>{meta.quotaCount ?? 0}</b>건 · 누락 <b style={{ color: '#b91c1c' }}>{meta.unmatchedCount ?? rows.length}</b>건
              </>
            ) : (
              <>조회 전</>
            )}
          </div>
        </div>

        <button
          onClick={onCheck}
          style={{
            ...rowBtn,
            height: 34,
            padding: '0 10px',
            opacity: busy ? 0.6 : 1,
            width: isMobile ? '100%' : 'auto',
          }}
          disabled={busy}
          title="인트라넷에 등록된 지방 DB 중 쿼터보드 오늘 등록 목록에 없는 건 조회"
        >
          {busy ? '조회중...' : '지방 누락 조회'}
        </button>
      </div>

      {meta && (
        <div style={{ padding: 12 }}>
          <div style={{ maxHeight: 300, overflowY: 'auto', overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: isMobile ? 13 : 14,
                tableLayout: 'fixed',
                width: '100%',
                minWidth: 980,
              }}
            >
              <thead>
                <tr style={{ background: '#f6f7f9', borderBottom: '1px solid #eee' }}>
                  <th style={{ ...thSmall, width: 120, textAlign: 'center' }}>AP</th>
                  <th style={{ ...thSmall, width: 82, textAlign: 'center' }}>지역</th>
                  <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>섭외자</th>
                  <th style={{ ...thSmall }}>업체명</th>
                  <th style={{ ...thSmall, width: 170 }}>주소</th>
                  <th style={{ ...thSmall, width: 92, textAlign: 'center' }}>DB상태</th>
                  <th style={{ ...thSmall, width: 120, textAlign: 'center' }}>사유</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const address = row.address || [row.region1, row.region2].filter(Boolean).join(' ');
                  const candidates = candidateText(row.quotaCandidates);
                  return (
                    <tr key={`${row.id || row.companyName || 'row'}_${index}`} style={{ borderTop: '1px solid #eee', background: '#ffffff' }}>
                      <td style={{ ...tdSmall, width: 120, textAlign: 'center' }}>
                        <div style={{ fontWeight: 900 }}>{row.apDate || '-'}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{row.apTime || ''}</div>
                      </td>
                      <td style={{ ...tdSmall, width: 82, textAlign: 'center' }}>{[row.region1, row.region2].filter(Boolean).join(' ') || '-'}</td>
                      <td style={{ ...tdSmall, width: 90, textAlign: 'center', fontWeight: 900 }}>{row.castMember || '-'}</td>
                      <td style={{ ...tdSmall, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.companyName || ''}>
                        {row.companyName || '-'}
                      </td>
                      <td style={{ ...tdSmall, width: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={address}>
                        {address || '-'}
                      </td>
                      <td style={{ ...tdSmall, width: 92, textAlign: 'center' }}>{row.dbState || '-'}</td>
                      <td style={{ ...tdSmall, width: 120, textAlign: 'center' }} title={candidates}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 82,
                            height: 24,
                            padding: '0 8px',
                            borderRadius: 999,
                            border: '1px solid #fecaca',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {reasonLabel(row.missingReason)}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
                      누락된 지방 DB가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
