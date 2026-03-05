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
  is_reserve: boolean;
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
  leader_group?: number | null;
  invalid_call_count?: number | null;
  participation_restricted_until?: string | null;
  participation_restriction_note?: string | null;
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
const GROUP_SETTING_KEY = 'active_leader_group'; // 0=전체, 1=1조, 2=2조
const ACTIVE_GROUP_KEY = 'active_leader_group';

function getLocalDayRangeISO() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

type ToastType = 'success' | 'info';
type ToastState = { type: ToastType; text: string } | null;
type SupportLogPayload = {
  event_type: 'APPLY' | 'RESERVE_APPLY' | 'DELETE' | 'EXCEPTION_ON' | 'EXCEPTION_OFF';
  applied_at?: string | null;
  application_id?: string | null;
  leader_name?: string | null;
  region_id?: string | null;
  region_name?: string | null;
  company_name?: string | null;
  is_reserve?: boolean | null;
  is_excluded?: boolean | null;
  note?: string | null;
};

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

  // 예비 등록(대기열)
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveRegionId, setReserveRegionId] = useState<string>('');
  const [reserveCompany, setReserveCompany] = useState<string>('');
  const [busyReserve, setBusyReserve] = useState<boolean>(false);

  // 공통 1인당 하루 한도(0이면 무제한)
  const [perPersonLimit, setPerPersonLimit] = useState<number>(0);
  // 오늘 내 지원 건수(정확한 count)
  const [myTodayCount, setMyTodayCount] = useState<number>(0);
  // 개별 예외(한도 무시)
  const [exemptUserIds, setExemptUserIds] = useState<string[]>([]);

  // 오늘 지원 가능 조(0=전체,1=1조,2=2조) + 내 소속 조
  const [activeGroup, setActiveGroup] = useState<number>(0);
  const [myGroup, setMyGroup] = useState<number | null>(null);
  const [invalidCallCount, setInvalidCallCount] = useState<number>(0);
  const [restrictedUntil, setRestrictedUntil] = useState<string | null>(null);

  // 가이드(사용 방법) 접기/펼치기: 기본=펼침, 사용자 선택 저장
  const GUIDE_KEY = "qb_leader_guide_open";
  const [guideOpen, setGuideOpen] = useState<boolean>(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(GUIDE_KEY);
      if (saved === "0") setGuideOpen(false);
      if (saved === "1") setGuideOpen(true);
    } catch {}
  }, []);

  const toggleGuide = () => {
    setGuideOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GUIDE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const showToast = (type: ToastType, text: string) => {
    setToast({ type, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  };

  const clearError = () => setErrorMsg('');

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token ?? undefined;
    }
    return token ?? null;
  };

  const appendSupportLog = async (payload: SupportLogPayload) => {
    try {
      const token = await getAccessToken();
      if (!token) return;

      await fetch('/api/support-log', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn('[support-log] append failed:', e);
    }
  };

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
      .select('id, created_at, region_id, leader_name, company_name, is_reserve')
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

  const loadActiveGroup = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value_int')
      .eq('key', GROUP_SETTING_KEY)
      .maybeSingle();

    if (error) {
      console.warn('[loadActiveGroup] error:', error.message);
      return;
    }

    if (!data) {
      setActiveGroup(0);
      return;
    }

    const row = data as AppSettingRow;
    const v = Number(row.value_int ?? 0);
    const safe = Number.isFinite(v) ? Math.max(0, Math.min(2, Math.trunc(v))) : 0;
    setActiveGroup(safe);
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

  const loadMyProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, leader_group, invalid_call_count, participation_restricted_until')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    if (!data) return;

    const row = data as Pick<
      ProfileRow,
      'display_name' | 'leader_group' | 'invalid_call_count' | 'participation_restricted_until'
    >;
    setLeaderName(row.display_name ?? '팀장');
    setMyGroup(row.leader_group ?? null);
    setInvalidCallCount(Number(row.invalid_call_count ?? 0));
    setRestrictedUntil(row.participation_restricted_until ?? null);
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

  const activeGroupLabel = useMemo(() => {
    if (activeGroup === 1) return '1조';
    if (activeGroup === 2) return '2조';
    return '전체';
  }, [activeGroup]);

  const myGroupLabel = useMemo(() => {
    if (myGroup === 1) return '1조';
    if (myGroup === 2) return '2조';
    return '미지정';
  }, [myGroup]);

  const groupBlocked = useMemo(() => {
    if (activeGroup === 0) return false;
    if (!myGroup) return true;
    return myGroup !== activeGroup;
  }, [activeGroup, myGroup]);

  // 상태 요약 카드 톤(정상/제한) — 외곽은 아주 연한 경고, 내부 카드는 흰 배경 + 경고 테두리로 조화
  const restrictionBlocked = useMemo(() => {
    if (!restrictedUntil) return false;
    const end = new Date(restrictedUntil).getTime();
    if (Number.isNaN(end)) return false;
    return end > Date.now();
  }, [restrictedUntil]);

  const restrictionMessage = useMemo(() => {
    if (!restrictionBlocked || !restrictedUntil) return '';
    const label = new Date(restrictedUntil).toLocaleString('ko-KR');
    return `참여 제한 중입니다. 제한 종료: ${label}`;
  }, [restrictionBlocked, restrictedUntil]);

  const isAlert = groupBlocked || limitBlocked || restrictionBlocked;
  const wrapBg = isAlert ? '#fff7f7' : '#ffffff';
  const wrapBorder = isAlert ? '#fecaca' : '#e5e7eb';
  const innerBg = isAlert ? '#ffffff' : '#f8fafc';
  const innerBorder = isAlert ? '#fecaca' : '#eef2f7';

  const apply = async (regionId: string) => {
    clearError();
    if (busyRegionId) return;

    if (restrictionBlocked) {
      setErrorMsg(restrictionMessage || '참여 제한 중입니다.');
      return;
    }

    const blocked = !isExempt && perPersonLimit > 0 && myTodayCount >= perPersonLimit;
    if (blocked) {
      setErrorMsg('오늘 지원 가능 횟수가 0명입니다. (공통 1인당 하루 한도 도달)');
      return;
    }

    if (groupBlocked) {
      setErrorMsg(`오늘은 ${activeGroupLabel}만 지원 가능합니다. (내 소속: ${myGroupLabel})`);
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

      let newApplicationId: string | null = null;
      let newAppliedAt: string | null = null;
      if (myUserId) {
        const { data: latest } = await supabase
          .from('applications_live')
          .select('id, created_at')
          .eq('user_id', myUserId)
          .eq('region_id', regionId)
          .eq('company_name', c)
          .eq('is_reserve', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        newApplicationId = (latest as { id: string } | null)?.id ?? null;
        newAppliedAt = (latest as { created_at?: string | null } | null)?.created_at ?? null;
      }

      await appendSupportLog({
        event_type: 'APPLY',
        applied_at: newAppliedAt,
        application_id: newApplicationId,
        leader_name: leaderName,
        region_id: regionId,
        region_name: regionsMap.get(regionId)?.region_name ?? regionId,
        company_name: c,
        is_reserve: false,
        is_excluded: false,
        note: 'team_apply',
      });

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

  const closedRegions = useMemo(() => {
    return (statusRows ?? []).filter((r) => (r.capacity_total ?? 0) > 0 && Boolean(r.is_closed));
  }, [statusRows]);

  const openReserveModal = () => {
    clearError();
    const first = closedRegions[0]?.region_id ?? '';
    setReserveRegionId(first);
    setReserveCompany('');
    setReserveOpen(true);
  };

  const submitReserve = async () => {
    clearError();
    if (busyReserve) return;

    if (restrictionBlocked) {
      setErrorMsg(restrictionMessage || '참여 제한 중입니다.');
      return;
    }

    if (limitBlocked) {
      setErrorMsg('오늘 지원 가능 횟수가 0명입니다. (공통 1인당 하루 한도 도달)');
      return;
    }
    if (groupBlocked) {
      setErrorMsg(`오늘은 ${activeGroupLabel}만 지원 가능합니다. (내 소속: ${myGroupLabel})`);
      return;
    }

    const rid = reserveRegionId;
    if (!rid) {
      setErrorMsg('마감된 지역을 선택하세요.');
      return;
    }
    const r = closedRegions.find((x) => x.region_id === rid);
    if (!r) {
      setErrorMsg('마감된 지역만 예비 등록이 가능합니다.');
      return;
    }

    const c = (reserveCompany ?? '').trim();
    if (!c) {
      setErrorMsg('기업명을 입력하세요.');
      return;
    }

    if (!myUserId) {
      router.replace('/login');
      return;
    }

    setBusyReserve(true);
    try {
      const { data: inserted, error } = await supabase
        .from('applications_live')
        .insert({
          user_id: myUserId,
          leader_name: leaderName,
          region_id: rid,
          company_name: c,
          is_reserve: true,
          is_excluded: false,
        } as any)
        .select('id, created_at')
        .maybeSingle();

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      await appendSupportLog({
        event_type: 'RESERVE_APPLY',
        applied_at: (inserted as { created_at?: string | null } | null)?.created_at ?? null,
        application_id: (inserted as { id: string } | null)?.id ?? null,
        leader_name: leaderName,
        region_id: rid,
        region_name: regionsMap.get(rid)?.region_name ?? rid,
        company_name: c,
        is_reserve: true,
        is_excluded: false,
        note: 'team_reserve_apply',
      });

      showToast('success', '예비 등록 완료');
      setReserveOpen(false);
      setReserveCompany('');
      await Promise.all([loadMyApplies(myUserId), loadMyTodayCount(myUserId)]);
    } finally {
      setBusyReserve(false);
    }
  };

  // 로그인 + role 체크 + 초기 로드 + realtime
  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    // Realtime 끊김(절전/네트워크 전환 등) 대비: 재구독 타이머 + 현재 uid 보관
    let retryTimer: number | null = null;
    let pollTimer: number | null = null;
    let uidRef: string | null = null;
    let onVis: (() => void) | null = null;

    const boot = async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userRes?.user) {
        router.replace('/login');
        return;
      }

      const uid = userRes.user.id;
      setMyUserId(uid);
      uidRef = uid;

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, display_name, role, is_admin, leader_group, invalid_call_count, participation_restricted_until')
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
      setMyGroup(p.leader_group ?? null);
      setInvalidCallCount(Number(p.invalid_call_count ?? 0));
      setRestrictedUntil(p.participation_restricted_until ?? null);

      await loadRegions();
      await Promise.all([loadLimit(), loadExempt(), loadActiveGroup(), loadStatus(), loadMyApplies(uid), loadMyTodayCount(uid), loadMyProfile(uid)]);

      if (!alive) return;

      const resubscribe = () => {
        if (!alive || !uidRef) return;

        // 기존 채널 정리
        if (ch) supabase.removeChannel(ch);

        ch = supabase
          // 재구독 시 채널명 충돌 방지
          .channel(`leader-live-${Date.now()}`)

          .on('postgres_changes', { event: '*', schema: 'public', table: 'region_totals' }, () => {
            loadStatus();
          })

          .on('postgres_changes', { event: '*', schema: 'public', table: 'applications_live' }, () => {
            loadStatus();
            loadMyApplies(uidRef!);
            loadMyTodayCount(uidRef!);
          })

          .on('postgres_changes', { event: '*', schema: 'public', table: 'regions' }, () => {
            loadRegions();
            loadStatus();
          })

          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${uidRef}` },
            () => {
              loadMyProfile(uidRef!);
            },
          )

          // ✅ app_settings 구독은 "한 번만" 둡니다 (아래 중복 구독은 삭제할 예정)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
            const nk = (payload?.new as any)?.key;
            const ok = (payload?.old as any)?.key;

            if (nk === LIMIT_SETTING_KEY || ok === LIMIT_SETTING_KEY) loadLimit();
            if (nk === EXEMPT_SETTING_KEY || ok === EXEMPT_SETTING_KEY) loadExempt();
            if (nk === GROUP_SETTING_KEY || ok === GROUP_SETTING_KEY) loadActiveGroup();
          })

          .subscribe((status) => {
            // 정상 상태
            if (status === 'SUBSCRIBED') return;

            // 끊김/에러면 자동 재구독
            if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
              if (retryTimer) window.clearTimeout(retryTimer);
              retryTimer = window.setTimeout(() => {
                // 놓친 이벤트 보정: 재구독 직후 한번 강제 동기화
                loadLimit();
                loadExempt();
                loadActiveGroup();
                loadStatus();
                loadMyApplies(uidRef!);
                loadMyTodayCount(uidRef!);
                loadMyProfile(uidRef!);

                resubscribe();
              }, 1000);
            }
          });
      };

      // 최초 1회 구독
      resubscribe();

      // 탭이 오래 백그라운드/절전이었다가 돌아오는 경우 놓친 변경 보정
      onVis = () => {
        if (!alive) return;
        if (document.visibilityState === 'visible') {
          loadLimit();
          loadExempt();
          loadActiveGroup();
          loadStatus();
          if (uidRef) {
            loadMyApplies(uidRef);
            loadMyTodayCount(uidRef);
            loadMyProfile(uidRef);
          }
        }
      };
      if (onVis) document.addEventListener('visibilitychange', onVis);

      // Realtime이 잠깐 죽어도 정합성 유지용 백업 폴링(30초)
      pollTimer = window.setInterval(() => {
        if (!alive) return;
        loadLimit();
        loadExempt();
        loadActiveGroup();
        loadStatus();
        if (uidRef) {
          loadMyApplies(uidRef);
          loadMyTodayCount(uidRef);
          loadMyProfile(uidRef);
        }
      }, 30000);

      setChecking(false);

    };

    boot();

    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (pollTimer) window.clearInterval(pollTimer);
      if (onVis) document.removeEventListener('visibilitychange', onVis);
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
      <main lang="ko-KR" style={{ minHeight: '100vh', background: '#f3f4f6', padding: 24 }}>
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
    <main lang="ko-KR" style={{ minHeight: '100vh', background: '#f3f4f6', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* 헤더 */}
        <div style={headerCard}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>팀장 대시보드</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
              현재 사용자: <b style={{ color: '#0f172a' }}>{leaderName}</b>
            </div>
          </div>

          {/* 하단 로그아웃(보조) */}
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10, // ← 여기만 추가
            }}
          >
            <button onClick={() => router.push('/hr/calendar')} style={btnOutline}>
              휴가신청
            </button>
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

        {/* 사용 방법(가이드) 카드: 기본=펼침, 접기 가능 */}
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 950 }}>사용 방법</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                지역 선택 → 기업명 입력 → Enter(또는 지원 버튼)
              </div>
              <div style={{ marginTop: 4, fontSize: 14, color: '#475569', fontWeight: 850, lineHeight: 1.6 }}>
                오늘 지원 가능한 조 / 하루 지원 가능 횟수에 따라 지원이 제한될 수 있습니다.
              </div>
            </div>

            <button
              type="button"
              onClick={toggleGuide}
              aria-expanded={guideOpen}
              style={guideToggleBtn}
            >
              {guideOpen ? '접기 ▲' : '펼치기 ▼'}
            </button>
          </div>

          {guideOpen && (
            <div style={{ marginTop: 12, fontSize: 15, color: '#0f172a', fontWeight: 850, lineHeight: 1.7 }}>
              <div style={{ marginBottom: 8 }}>
                <b>1)</b> 아래 표에서 <b>지역</b>을 확인하고, <b>기업명</b>을 입력합니다.
              </div>
              <div style={{ marginBottom: 8 }}>
                <b>2)</b> 키보드 <b>Enter</b>를 누르거나 오른쪽 <b>지원</b> 버튼을 누릅니다.
              </div>
              <div style={{ marginBottom: 10 }}>
                <b>3)</b> 지원이 완료되면 아래 <b>내 지원 목록</b>에 바로 표시됩니다.
              </div>

            </div>
          )}
        </div>

        {/* 오늘 상태 요약 카드 (조 + 하루 한도 통합) */}
        <div
          style={{
            ...card,
            marginTop: 16,
            borderColor: wrapBorder,
            background: wrapBg,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 950 }}>오늘 상태 요약</div>
              <div style={{ marginTop: 6, fontSize: 20, fontWeight: 950, letterSpacing: -0.2 }}>
                {groupBlocked || limitBlocked || restrictionBlocked ? '현재 지원이 제한되어 있습니다.' : '현재 지원 가능합니다.'}
              </div>
            </div>

            {groupBlocked || limitBlocked || restrictionBlocked ? <div style={badgeDanger}>지원 제한</div> : <div style={badgeInfo}>정상</div>}
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {/* 오늘 지원 가능 조 (1줄 압축) */}
            <div style={{ ...subCard, background: innerBg, borderColor: innerBorder }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 950 }}>오늘 지원 가능 조</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                  오늘 지원 가능 조: <b>{activeGroupLabel}</b>
                  <span style={{ marginLeft: 6, fontSize: 15, color: '#475569', fontWeight: 850 }}>
                    (내 소속: <b style={{ color: '#0f172a' }}>{myGroupLabel}</b>)
                  </span>
                </div>
                {groupBlocked ? <span style={pillDangerInline}>지원 불가</span> : <span style={pillInfoInline}>지원 가능</span>}
              </div>
            </div>

            {/* 하루 지원 가능 횟수 (1줄 압축) */}
            <div style={{ ...subCard, background: innerBg, borderColor: innerBorder }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 950 }}>하루 지원 가능 횟수</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                  오늘 지원 가능: <b>{remainingTodayLabel}</b>
                  <span style={{ marginLeft: 6, fontSize: 15, color: '#475569', fontWeight: 850 }}>
                    (
                    {isExempt ? (
                      <>
                        예외 · 오늘 사용 <b>{myTodayCount}</b>
                      </>
                    ) : perPersonLimit > 0 ? (
                      <>
                        오늘 사용 <b>{myTodayCount}</b> / 한도 <b>{perPersonLimit}</b>
                      </>
                    ) : (
                      <>무제한</>
                    )}
                    )
                  </span>
                </div>
                {limitBlocked ? (
                  <span style={pillDangerInline}>한도 도달</span>
                ) : isExempt ? (
                  <span style={pillWarnInline}>예외</span>
                ) : (
                  <span style={pillInfoInline}>{perPersonLimit > 0 ? '정상' : '무제한'}</span>
                )}
              </div>
            </div>

            <div style={{ ...subCard, background: innerBg, borderColor: innerBorder }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 950 }}>패널티 상태</div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                  무효콜 누적 <b>{invalidCallCount}</b>회
                </div>
                {restrictionBlocked ? (
                  <span style={pillDangerInline}>참여 제한 중</span>
                ) : (
                  <span style={pillInfoInline}>정상</span>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: restrictionBlocked ? '#b91c1c' : '#475569', fontWeight: 800 }}>
                {restrictionBlocked
                  ? restrictionMessage
                  : invalidCallCount >= 5
                    ? '규정상 1개월 제한 대상'
                    : invalidCallCount >= 3
                      ? '규정상 1주 제한 대상'
                      : '규정상 제한 없음'}
              </div>
            </div>
          </div>
        </div>

        {/* 지역별 TO 카드 */}
        <div style={{ ...card, marginTop: 16, padding: 0, overflow: 'hidden' }}>
          <div style={cardHeader}>
            <div>
              <div style={cardTitle}>지역별 배정 가능 수량(TO)</div>
              <div style={cardSubTitle}>실시간 현황 · 기업명 입력 후 지원</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={openReserveModal}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 12,
                  border: '1px solid #0f172a',
                  background: '#0f172a',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
                disabled={closedRegions.length === 0 || limitBlocked || groupBlocked || restrictionBlocked}
                title={closedRegions.length === 0 ? '마감된 지역이 없어서 예비 등록이 필요 없습니다.' : '마감된 지역에 예비 등록합니다.'}
              >
                예비등록
              </button>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 800 }}>Enter로 빠른 지원</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...thBig, textAlign: 'center' }}>지역</th>
                <th style={{ ...th, textAlign: 'right' }}>총 배정(TO)</th>
                <th style={{ ...th, textAlign: 'right' }}>남은 수량</th>
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
                const disabled = closed || isBusy || limitBlocked || groupBlocked || restrictionBlocked;
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
                        lang="ko"
                        inputMode="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
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
                          closed
                            ? '마감'
                            : groupBlocked
                              ? `오늘은 ${activeGroupLabel}만 지원 가능`
                              : limitBlocked
                                ? '오늘 한도 도달'
                                : '기업명 입력 (Enter 지원)'
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
                        {isBusy ? '처리중…' : restrictionBlocked ? '제한' : groupBlocked ? '불가' : limitBlocked ? '한도' : closed ? '마감' : '지원'}
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
                    <td style={tdSmall}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {a.is_reserve ? (
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
                        ) : null}
                        <span style={{ fontWeight: 900 }}>{a.company_name}</span>
                      </span>
                    </td>
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

        {/* 예비 등록 모달 */}
        {reserveOpen && (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              zIndex: 50,
            }}
            onMouseDown={(e) => {
              // 바깥 클릭으로 닫기
              if (e.target === e.currentTarget) setReserveOpen(false);
            }}
          >
            <div
              style={{
                width: 'min(520px, 100%)',
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 950, color: '#0f172a' }}>예비 등록</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                    마감된 지역만 선택할 수 있습니다. (TO에는 미반영, 개인 한도에는 포함)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReserveOpen(false)}
                  style={{
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  닫기
                </button>
              </div>

              <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 900, marginBottom: 6 }}>마감된 지역 선택</div>
                  <select
                    value={reserveRegionId}
                    onChange={(e) => setReserveRegionId(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                      padding: '0 10px',
                      fontWeight: 900,
                    }}
                  >
                    {closedRegions.length === 0 ? (
                      <option value="">마감된 지역이 없습니다</option>
                    ) : (
                      closedRegions.map((r) => (
                        <option key={r.region_id} value={r.region_id}>
                          {r.region_name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 900, marginBottom: 6 }}>기업명</div>
                  <input
                    lang="ko"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={reserveCompany}
                    onChange={(e) => setReserveCompany(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!busyReserve) submitReserve();
                      }
                    }}
                    placeholder="기업명을 입력하세요"
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                      padding: '0 10px',
                      fontWeight: 900,
                    }}
                  />
                </div>
              </div>

              <div style={{ padding: 16, borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setReserveOpen(false)} style={btnOutline} disabled={busyReserve}>
                  취소
                </button>
                <button
                  type="button"
                  onClick={submitReserve}
                  style={{ ...btnPrimary, height: 38, minWidth: 120 }}
                  disabled={busyReserve || closedRegions.length === 0 || limitBlocked || groupBlocked || restrictionBlocked}
                >
                  {busyReserve ? '등록중…' : '예비 등록'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 하단 로그아웃(보조) */}
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10, // ← 여기만 추가
          }}
        >
          <button onClick={() => router.push('/hr/calendar')} style={btnOutline}>
            휴가신청
          </button>
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

const guideToggleBtn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#ffffff',
  borderRadius: 999,
  padding: '10px 14px',
  fontWeight: 950,
  cursor: 'pointer',
  fontSize: 14,
  color: '#0f172a',
  whiteSpace: 'nowrap',
};

const guideNoteBox: React.CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 14,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  color: '#0f172a',
};

const subCard: React.CSSProperties = {
  border: '1px solid #eef2f7',
  borderRadius: 16,
  padding: 12,
  background: '#f8fafc',
};

const pillInfoInline: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #bae6fd',
  background: '#f0f9ff',
  color: '#0c4a6e',
  fontWeight: 950,
  fontSize: 12,
};

const pillWarnInline: React.CSSProperties = {
  display: 'inline-block',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #fde68a',
  background: '#fffbeb',
  color: '#92400e',
  fontWeight: 950,
  fontSize: 12,
};

const pillDangerInline: React.CSSProperties = {
  display: 'inline-block',
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
