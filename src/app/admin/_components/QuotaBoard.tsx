'use client';

import type { RefObject } from 'react';
import { REGION_BOARD_COLOR, rowBtn, tdTiny, thTiny } from '../styles';
import { useIsMobile } from '@/hooks/useIsMobile';

type BoardCell = {
  leader_name: string;
  company_name: string;
};

type RegionOrderedRow = {
  id: string;
  name: string;
};

type QuotaBoardProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  busyCopyBoard: boolean;
  copyBoardAsImage: () => void;
  boardMaxCols: number;
  regionsOrdered: RegionOrderedRow[];
  boardByRegionId: Map<string, BoardCell[]>;
};

export default function QuotaBoard({
  boardRef,
  busyCopyBoard,
  copyBoardAsImage,
  boardMaxCols,
  regionsOrdered,
  boardByRegionId,
}: QuotaBoardProps) {
  const isMobile = useIsMobile();

  return (
    <>
      <div
        style={{
          marginTop: 26,
          marginBottom: 10,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>지역별 지원 보드(현재)</h2>

        <button onClick={copyBoardAsImage} style={{ ...rowBtn, ...(isMobile ? { width: '100%' } : {}) }} disabled={busyCopyBoard}>
          {busyCopyBoard ? '복사중..' : '보드 이미지 복사'}
        </button>
      </div>
      <div>
        <div style={{ overflowX: 'auto' }}>
          <div
            ref={boardRef}
            style={{
              display: 'inline-block',
              border: '1px solid #ddd',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <table style={{ borderCollapse: 'collapse', width: 'max-content', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f6f7f9' }}>
                  <th style={{ ...thTiny }}>지점/ 건수</th>
                  {Array.from({ length: boardMaxCols }).map((_, i) => (
                    <th key={i} style={{ ...thTiny, minWidth: 160, textAlign: 'center' }}>
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regionsOrdered.map((r) => {
                  const cells = boardByRegionId.get(r.id) ?? [];
                  const total = cells.length;
                  if (total === 0) return null;
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                      <td
                        style={{
                          ...tdTiny,
                          fontWeight: 900,
                          background: REGION_BOARD_COLOR[r.name] ?? '#fafafa',
                          borderRight: '1px solid #ddd',
                          width: '1%',
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                          padding: '6px 12px',
                          textAlign: 'center',
                        }}
                      >
                        {r.name} / {total}
                      </td>

                      {Array.from({ length: boardMaxCols }).map((_, idx) => {
                        const c = cells[idx];
                        return (
                          <td key={idx} style={{ ...tdTiny, verticalAlign: 'top' }}>
                            {c ? (
                              <div style={{ lineHeight: 1.35, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ fontWeight: 900 }}>{c.leader_name}</div>
                                <div style={{ color: '#333' }}>{c.company_name}</div>
                              </div>
                            ) : (
                              <div style={{ color: '#bbb' }}>-</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {regionsOrdered.length === 0 && (
                  <tr>
                    <td colSpan={boardMaxCols + 1} style={{ padding: 12, color: '#666' }}>
                      regions 데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
