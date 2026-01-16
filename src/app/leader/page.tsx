'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type RegionStatusRow = {
  region_id: string;
  region_name: string;
  sort_order: number;
  capacity_total: number;
  applied_count: number;
  capacity_remaining: number;
  is_closed: boolean;
};

type MyApplyRow = {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string;
  company_name: string;
};

type RegionRow = {
  id: string;
  region_name: string;
  sort_order: number;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  role?: string | null;
  is_admin?: boolean | null;
};

type AppSettingRow = {
  key: string;
  value_int: number;
};

const REGION_COLOR: Record<string, string> = {
  부산: '#cfe6c3',
  대구: '#f2c7f3',
  대전: '#d8e6f7',
  전북: '#ffef00',
  광주: '#f5cfb3',
  원주: '#1fe3ef',
  제주: '#d9d9d9',
};

const LIMIT_SETTING_KEY = 'apply_limit_per_user_per_day';
const EXEMPT_SETTING_KEY = 'apply_limit_exempt_user_ids';

function getLocalDayRangeISO() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

type ToastType = 'success' | 'info';
type ToastState = { type: ToastType; text: string } | null;

export default function LeaderPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [leaderName, setLeaderName] = useState('팀장');
  const [myUserId, setMyUserId] = useState<string>('');

  // 메시지 분리: 에러는 빨강 박스, 성공/안내는 토스트
  const [errorMsg, setErrorMsg] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [regionsMap, setRegionsMap] = useState<Map<string, RegionRow>>(new Map());
  const [statusRows, setStatusRows] = useState<RegionStatusRow[]>([]);
  const [companyByRegionId, setCompanyByRegionId] = useState<Record<string, string>>({});
  const [busyRegionId, setBusyRegionId] = useState<string | null>(null);

  const [myApplies, setMyApplies] = useState<MyApplyRow[]>([]);

  // 공통 1인당 하루 한도(0이면 무제한)
  const [perPersonLimit, setPerPersonLimit] = useState<number>(0);
  // 오늘 내 지원 건수(정확한 count)
  const [myTodayCount, setMyTodayCount] = useState<number>(0);
  // 개별 예외(한도 무시)
  const [exemptUserIds, setExemptUserIds] = useState<string[]>([]);

  const showToast = (type: ToastType, text: string) => {
    setToast({ type, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  };

  const clearError = () => setErrorMsg('');

  const loadRegions = async () => {
    const { data, error } = await supabase
      .from('regions')
      .select('id, region_name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    const map = new Map<string, RegionRow>();
    for (const r of (data as RegionRow[]) ?? []) map.set(r.id, r);
    setRegionsMap(map);
  };

  const loadStatus = async () => {
    const { data, error } = await supabase
      .from('region_status_view')
      .select('region_id, region_name, sort_order, capacity_total, applied_count, capacity_remaining, is_closed')
      .order('sort_order', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const list = (data as RegionStatusRow[]) ?? [];
    setStatusRows(list);

    // 입력칸 초기화
    setCompanyByRegionId((prev) => {
      const next = { ...prev };
      for (const r of list) if (next[r.region_id] === undefined) next[r.region_id] = '';
      return next;
    });
  };

  const loadMyApplies = async (uid: string) => {
    const { data, error } = await supabase
      .from('applications_live')
      .select('id, created_at, region_id, leader_name, company_name')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setMyApplies((data as MyApplyRow[]) ?? []);
  };

  const loadLimit = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value_int')
      .eq('key', LIMIT_SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.warn('[loadLimit] error:', error.message);
      return;
    }

    if (!data) {
      setPerPersonLimit(0);
      return;
    }

    const row = data as AppSettingRow;
    setPerPersonLimit(Number(row.value_int ?? 0));
  };

  const loadExempt = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_json')
      .eq('key', EXEMPT_SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.warn('[loadExempt] error:', error.message);
      return;
    }

    const raw = (data as any)?.value_json;
    const arr = Array.isArray(raw) ? raw : [];
    setExemptUserIds(arr.map(String));
  };

  const loadMyTodayCount = async (uid: string) => {
    const { startISO, endISO } = getLocalDayRangeISO();

    const { count, error } = await supabase
      .from('applications_live')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .gte('created_at', startISO)
      .lt('created_at', endISO);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setMyTodayCount(Number(count ?? 0));
  };

  const totalMyApplies = useMemo(() => myApplies.length, [myApplies]);

  const isExempt = useMemo(() => {
    if (!myUserId) return false;
    return exemptUserIds.includes(myUserId);
  }, [myUserId, exemptUserIds]);

  const remainingTodayLabel = useMemo(() => {
    if (isExempt) return '무제한(예외)';
    if (perPersonLimit <= 0) return '무제한';
    const rem = Math.max(perPersonLimit - myTodayCount, 0);
    return `${rem}명`;
  }, [perPersonLimit, myTodayCount, isExempt]);

  const limitBlocked = useMemo(() => {
    if (isExempt) return false;
    return perPersonLimit > 0 && myTodayCount >= perPersonLimit;
  }, [perPersonLimit, myTodayCount, isExempt]);

  const apply = async (regionId: string) => {
    clearError();
    if (busyRegionId) return;

    const blocked = !isExempt && perPersonLimit > 0 && myTodayCount >= perPersonLimit;
    if (blocked) {
      setErrorMsg('오늘 지원 가능 횟수가 0명입니다. (공통 1인당 하루 한도 도달)');
      return;
    }

    const c = (companyByRegionId[regionId] ?? '').trim();
    if (!c) {
      setErrorMsg('기업명을 입력하세요.');
      return;
    }

    setBusyRegionId(regionId);

    const { data, error } = await supabase.rpc('apply_live_region', {
      p_region_id: regionId,
      p_company_name: c,
    });

    if (error) {
      setErrorMsg(error.message);
      setBusyRegionId(null);
      return;
    }

    const result = String(data);

    if (result === 'SUCCESS') {
      showToast('success', '지원 완료');
      setCompanyByRegionId((prev) => ({ ...prev, [regionId]: '' }));

      await loadStatus();
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        await Promise.all([loadMyApplies(u.user.id), loadMyTodayCount(u.user.id)]);
      }
    } else if (result === 'CLOSED') {
      setErrorMsg('마감되었습니다.');
      await loadStatus();
    } else if (result === 'NO_NAME') {
      setErrorMsg('프로필 이름이 없습니다. (profiles.display_name 확인)');
    } else if (result === 'NOT_LOGGED_IN') {
      router.replace('/login');
      return;
    } else {
      setErrorMsg(`처리 결과: ${result}`);
    }

    setBusyRegionId(null);
  };

  // 로그인 + role 체크 + 초기 로드 + realtime
  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    const boot = async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userRes?.user) {
        router.replace('/login');
        return;
      }

      const uid = userRes.user.id;
      setMyUserId(uid);

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, display_name, role, is_admin')
        .eq('user_id', uid)
        .maybeSingle();

      if (!alive) return;

      if (profErr || !prof) {
        router.replace('/login');
        return;
      }

      const p = prof as ProfileRow;

      const admin = p.role === 'admin' || Boolean(p.is_admin);
      if (admin) {
        router.replace('/admin');
        return;
      }

      if (p.role && p.role !== 'leader') {
        router.replace('/login');
        return;
      }

      setLeaderName(p.display_name ?? '팀장');

      await loadRegions();
      await Promise.all([loadLimit(), loadExempt(), loadStatus(), loadMyApplies(uid), loadMyTodayCount(uid)]);

      if (!alive) return;

      ch = supabase
        .channel('leader-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'region_totals' }, () => {
          loadStatus();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'applications_live' }, () => {
          loadStatus();
          loadMyApplies(uid);
          loadMyTodayCount(uid);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'regions' }, () => {
          loadRegions();
          loadStatus();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
          const nk = (payload?.new as any)?.key;
          const ok = (payload?.old as any)?.key;
          if (nk === LIMIT_SETTING_KEY || ok === LIMIT_SETTING_KEY) loadLimit();
          if (nk === EXEMPT_SETTING_KEY || ok === EXEMPT_SETTING_KEY) loadExempt();
        })
        .subscribe();

      setChecking(false);
    };

    boot();

    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayText = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${yyyy}.${mm}.${dd}. (${day})`;
  }, []);

  if (checking) {
    return (
      <main style={{ minHeight: '100vh', background: '#f3f4f6', padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={headerCard}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>팀장 대시보드</div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                로그인/데이터 확인 중...
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f3f4f6', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={headerCard}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>팀장 대시보드</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
              현재 사용자: <b style={{ color: '#0f172a' }}>{leaderName}</b>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#475569', fontWeight: 800 }}>{todayText}</div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}
              style={btnOutline}
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 토스트 */}
        {toast && (
          <div
            style={{
              ...toastBox,
              borderColor: toast.type === 'success' ? '#bbf7d0' : '#bae6fd',
              background: toast.type === 'success' ? '#f0fdf4' : '#f0f9ff',
              color: toast.type === 'success' ? '#166534' : '#0c4a6e',
            }}
          >
            <div style={{ fontWeight: 900 }}>{toast.type === 'success' ? '완료' : '안내'}</div>
            <div style={{ fontWeight: 800 }}>{toast.text}</div>
            <button onClick={() => setToast(null)} style={toastCloseBtn} aria-label="닫기">
              ×
            </button>
          </div>
        )}

        {/* 에러 박스 */}
        {errorMsg && (
          <div style={errorBox}>
            <div style={{ fontWeight: 900 }}>오류</div>
            <div style={{ fontWeight: 700 }}>{errorMsg}</div>
            <button onClick={() => setErrorMsg('')} style={toastCloseBtn} aria-label="닫기">
              ×
            </button>
          </div>
        )}

        {/* 한도 카드 */}
        <div
          style={{
            ...card,
            marginTop: 16,
            borderColor: limitBlocked ? '#fecaca' : '#e5e7eb',
            background: limitBlocked ? '#fff1f2' : '#ffffff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 900 }}>공통 정책: 1인당 하루 지원 한도</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 950, letterSpacing: -0.3 }}>
                오늘 지원 가능: {remainingTodayLabel}
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#475569', fontWeight: 800 }}>
                {isExempt ? (
                  <span>
                    예외 적용 중 · 오늘 사용 <b>{myTodayCount}</b>
                  </span>
                ) : perPersonLimit > 0 ? (
                  <span>
                    오늘 사용 <b>{myTodayCount}</b> / 한도 <b>{perPersonLimit}</b>
                  </span>
                ) : (
                  <span>현재: 무제한</span>
                )}
              </div>
            </div>

            {limitBlocked ? (
              <div style={badgeDanger}>한도 도달</div>
            ) : isExempt ? (
              <div style={badgeWarning}>예외</div>
            ) : perPersonLimit > 0 ? (
              <div style={badgeInfo}>정상</div>
            ) : (
              <div style={badgeInfo}>무제한</div>
            )}
          </div>

          {limitBlocked && (
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 900, color: '#b91c1c' }}>
              오늘 한도에 도달했습니다. 추가 지원은 불가합니다.
            </div>
          )}
        </div>

        {/* 지역별 TO 카드 */}
        <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={cardHeader}>
            <div>
              <div style={cardTitle}>지역별 TO</div>
              <div style={cardSubTitle}>실시간 현황 · 기업명 입력 후 지원</div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>Enter로 빠른 지원</div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...thBig, textAlign: 'center' }}>지역</th>
                <th style={{ ...th, textAlign: 'right' }}>총 TO</th>
                <th style={{ ...th, textAlign: 'right' }}>잔여</th>
                <th style={{ ...th, textAlign: 'center' }}>상태</th>
                <th style={tdBig}>기업명</th>
                <th style={{ ...th, textAlign: 'center' }}>지원</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map((r) => {
                const bg = REGION_COLOR[r.region_name] ?? '#fff';
                const closed = r.is_closed || r.capacity_remaining <= 0 || r.capacity_total <= 0;
                const isBusy = busyRegionId === r.region_id;
                const disabled = closed || isBusy || limitBlocked;
                if (r.capacity_total === 0) return null;

                return (
                  <tr key={r.region_id} style={{ borderTop: '1px solid #eef2f7' }}>
                    <td style={{ ...tdBig, background: bg, fontWeight: 950, textAlign: 'center'  }}>{r.region_name}</td>

                    <td style={{ ...tdBig, textAlign: 'right', fontWeight: 900 }}>{r.capacity_total}</td>

                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontWeight: 950,
                        fontSize: 22,
                        color: closed ? '#b91c1c' : '#0f172a',
                      }}
                    >
                      {r.capacity_remaining}
                    </td>

                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={closed ? pillClosed : pillOpen}>{closed ? '마감' : '진행중'}</span>
                    </td>

                    <td style={td}>
                      <input
                        value={companyByRegionId[r.region_id] ?? ''}
                        onChange={(e) =>
                          setCompanyByRegionId((prev) => ({ ...prev, [r.region_id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!disabled) apply(r.region_id);
                          }
                        }}
                        placeholder={
                          closed ? '마감' : limitBlocked ? '오늘 한도 도달' : '기업명 입력 (Enter 지원)'
                        }
                        disabled={disabled}
                        style={{
                          width: '100%',
                          maxWidth: 360,
                          height: 38,
                          padding: '0 10px',
                          fontSize: 13,
                          borderRadius: 10,
                          border: '1px solid #d1d5db',
                          background: disabled ? '#f8fafc' : '#fff',
                          opacity: disabled ? 0.7 : 1,
                        }}
                      />
                    </td>

                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => apply(r.region_id)}
                        disabled={disabled}
                        style={{
                          ...btnPrimary,
                          height: 38,
                          minWidth: 88,
                          background: disabled ? '#f8fafc' : '#111827',
                          borderColor: disabled ? '#e5e7eb' : '#111827',
                          color: disabled ? '#94a3b8' : '#fff',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isBusy ? '처리중…' : limitBlocked ? '한도' : closed ? '마감' : '지원'}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {statusRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 14, color: '#64748b', fontWeight: 800 }}>
                    데이터가 없습니다. (region_status_view 확인)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 내 지원 목록 */}
        <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={cardHeader}>
            <div>
              <div style={cardTitle}>내 지원 목록</div>
              <div style={cardSubTitle}>
                현재 <b style={{ color: '#0f172a' }}>{totalMyApplies}</b>건
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={thSmall}>시간</th>
                <th style={thSmall}>지역</th>
                <th style={thSmall}>기업명</th>
              </tr>
            </thead>
            <tbody>
              {myApplies.map((a) => {
                const rn = regionsMap.get(a.region_id)?.region_name ?? a.region_id;
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid #eef2f7' }}>
                    <td style={tdSmall}>{new Date(a.created_at).toLocaleString()}</td>
                    <td style={tdSmall}>{rn}</td>
                    <td style={tdSmall}>{a.company_name}</td>
                  </tr>
                );
              })}

              {myApplies.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 12, color: '#64748b', fontWeight: 800 }}>
                    지원 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 하단 로그아웃(보조) */}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace('/login');
            }}
            style={btnOutline}
          >
            로그아웃
          </button>
        </div>
      </div>
    </main>
  );
}

/* ---- styles (관리자 톤과 동일 규칙) ---- */

const headerCard: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  background: '#ffffff',
  padding: '14px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
};

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  background: '#ffffff',
  padding: 14,
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
};

const cardHeader: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
  borderBottom: '1px solid #eef2f7',
};

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 950,
  color: '#0f172a',
};

const cardSubTitle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: 800,
  color: '#64748b',
};

const btnOutline: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 12,
  border: '1px solid #111827',
  background: '#fff',
  color: '#111827',
  fontWeight: 900,
  cursor: 'pointer',
};

const btnPrimary: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #111827',
  fontWeight: 950,
};

const toastBox: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid',
  position: 'relative',
  display: 'flex',
  gap: 10,
  alignItems: 'baseline',
};

const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#991b1b',
  position: 'relative',
  display: 'flex',
  gap: 10,
  alignItems: 'baseline',
};

const toastCloseBtn: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 10,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: '24px',
  fontWeight: 900,
  color: '#0f172a',
};

const badgeInfo: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #bae6fd',
  background: '#f0f9ff',
  color: '#0c4a6e',
  fontWeight: 950,
  fontSize: 12,
};

const badgeWarning: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #fde68a',
  background: '#fffbeb',
  color: '#92400e',
  fontWeight: 950,
  fontSize: 12,
};

const badgeDanger: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#991b1b',
  fontWeight: 950,
  fontSize: 12,
};

const th: React.CSSProperties = {
  padding: '12px 12px',
  textAlign: 'left',
  fontWeight: 900,
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
};

const td: React.CSSProperties = {
  padding: '12px 12px',
  verticalAlign: 'middle',
  color: '#0f172a',
};

const thSmall: React.CSSProperties = {
  padding: '10px 10px',
  textAlign: 'left',
  fontWeight: 900,
  borderBottom: '1px solid #eef2f7',
  fontSize: 12,
  color: '#0f172a',
};

const tdSmall: React.CSSProperties = {
  padding: '10px 10px',
  fontSize: 12,
  color: '#0f172a',
};

const pillOpen: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #bbf7d0',
  background: '#f0fdf4',
  fontWeight: 950,
  fontSize: 12,
  color: '#166534',
};

const pillClosed: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#991b1b',
  fontWeight: 950,
  fontSize: 12,
};

const thBig: React.CSSProperties = {
  ...th,
  padding: '14px 12px',
  fontSize: 18,
};

const tdBig: React.CSSProperties = {
  ...td,
  padding: '14px 12px',
  fontSize: 20,
};