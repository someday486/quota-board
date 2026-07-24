'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminHeader from './_components/AdminHeader';
import HelpBox from './_components/HelpBox';
import Toasts from './_components/Toasts';
import ErrorAlert from './_components/ErrorAlert';
import ApplyList from './_components/ApplyList';
import ReserveList from './_components/ReserveList';
import IntranetRegionalUnmatchedList, {
  type RegionalUnmatchedMeta,
  type RegionalUnmatchedRow,
} from './_components/IntranetRegionalUnmatchedList';
import QuotaBoard from './_components/QuotaBoard';
import { useAdminPage } from './_hooks/useAdminPage';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  input,
  miniDangerBtn,
  miniPrimaryBtn,
  pillClosed,
  pillOpen,
  REGION_BOARD_COLOR,
  rowBtn,
  td,
} from './styles';

type RegionStatusRow = {
  region_id: string;
  region_name: string;
  sort_order: number;
  capacity_total: number;
  applied_count: number;
  capacity_remaining: number;
  is_closed: boolean;
};

type LiveApplyRow = {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string;
  company_name: string;
  meeting_time_slot: MeetingTimeSlot | null;
  is_excluded: boolean;
  is_reserve: boolean;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type MeetingTimeSlot = 'am' | 'pm';

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

type IntranetCheckStatus =
  | 'registered'
  | 'missing'
  | 'date_mismatch'
  | 'time_mismatch'
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
  address?: string;
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
  expectedTimeSlot?: MeetingTimeSlot;
  matchedTimeSlot?: MeetingTimeSlot;
  matchCount?: number;
  matches?: IntranetCheckMatch[];
  reason?: string;
};

type IntranetCheckResponse = {
  result?: boolean;
  results?: IntranetCheckResult[];
  error?: string;
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
};

type LeaderDashRow = {
  user_id: string;
  display_name: string;
  today_count: number;
  is_exempt: boolean;
  leader_group: number | null;
};

type ApplicationLiveDbRow = {
  id: string;
  created_at: string;
  region_id: string;
  leader_name: string | null;
  company_name: string | null;
  meeting_time_slot: MeetingTimeSlot | null;
  is_excluded: boolean | null;
  is_reserve: boolean | null;
  reviewed: boolean | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type AppSettingsIntRow = {
  value_int: number | null;
};

type AppSettingsJsonRow = {
  value_json: unknown;
};

type TodayCountRow = {
  user_id: string | null;
  created_at: string;
};

type RecordingPathRow = {
  file_path: string | null;
};

type RecordingDeleteRow = {
  id: string;
  file_path: string | null;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
const APPLY_PAGE_SIZE = 100;
const APPLY_LIMIT_SETTING_KEY = 'apply_limit_per_user_per_day';
const RESET_APPLY_LIMIT_PER_USER_PER_DAY = 3;
const fmtDT = (v?: string | null) => {
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const fmtKstYmd = (v?: string | null) => {
  const d = v ? new Date(v) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(safe);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  return `${byType.get('year') ?? '0000'}-${byType.get('month') ?? '01'}-${byType.get('day') ?? '01'}`;
};

const timeSlotLabel = (slot?: MeetingTimeSlot | null) => {
  if (slot === 'am') return '오전';
  if (slot === 'pm') return '오후';
  return '-';
};

export default function AdminPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftTOCardRef = useRef<HTMLDivElement | null>(null);
  const [leftTOCardHeight, setLeftTOCardHeight] = useState<number | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');

  useEffect(() => {
    const el = leftTOCardRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      setLeftTOCardHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    // 초기 1회
    setLeftTOCardHeight(el.getBoundingClientRect().height);

    return () => ro.disconnect();
  }, []);

  const [busyCopyBoard, setBusyCopyBoard] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState('관리자');
  const [errorMsg, setErrorMsg] = useState('');
  type ToastType = 'success' | 'info';
  type Toast = { id: string; type: ToastType; text: string };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = (type: ToastType, text: string) => {
    // 빈 토스트는 무시(운영 화면 깔끔하게)
    if (!text || !text.trim()) return;
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    // auto-dismiss
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  };
  const [showHelp, setShowHelp] = useState(true);

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    } catch {
      return '';
    }
  }, []);

  const doLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

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


  // 1인당 하루 지원 한도(공통)
  const [applyLimit, setApplyLimit] = useState<number>(0); // 0 = 무제한
  const [applyLimitInput, setApplyLimitInput] = useState<string>('0');
  const [busyApplyLimit, setBusyApplyLimit] = useState(false);

  // 개별 예외(한도 무시) - user_id 목록
  const EXEMPT_KEY = 'apply_limit_exempt_user_ids';
  const [exemptUserIds, setExemptUserIds] = useState<string[]>([]);

  // 오늘 지원 가능 조(0=전체, 1=1조, 2=2조)
  const GROUP_SETTING_KEY = 'active_leader_group';
  const [activeGroup, setActiveGroup] = useState<number>(0);
  const [busyActiveGroup, setBusyActiveGroup] = useState(false);

  // 팀장별 소속 조(1/2/null) 변경
  const [leaders, setLeaders] = useState<ProfileRow[]>([]);
  const [todayCountsByUserId, setTodayCountsByUserId] = useState<Record<string, number>>({});
  const [busyToggleExempt, setBusyToggleExempt] = useState<string | null>(null);
  const [leaderQuery, setLeaderQuery] = useState<string>('');

  // 팀장 지원 목록 필터
  const [applyQuery, setApplyQuery] = useState<string>('');
  const [applyRegionFilter, setApplyRegionFilter] = useState<string>('');

  // 기업명 인라인 수정
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyInputById, setCompanyInputById] = useState<Record<string, string>>({});
  const [busyUpdateCompanyId, setBusyUpdateCompanyId] = useState<string | null>(null);
  const [isComposingCompanyById, setIsComposingCompanyById] = useState<Record<string, boolean>>({});



  const [regionsStatus, setRegionsStatus] = useState<RegionStatusRow[]>([]);
  const [regionsMap, setRegionsMap] = useState<Map<string, RegionRow>>(new Map());

  // 입력값(총 TO) - region_id 기준
  const [totalByRegionId, setTotalByRegionId] = useState<Record<string, number>>({});
  const [busySave, setBusySave] = useState<string | null>(null);
  const [busyReset, setBusyReset] = useState(false);
  const [applyPage, setApplyPage] = useState(1);
  const [totalApplyCount, setTotalApplyCount] = useState(0);
  const didInitApplyPagingRef = useRef(false);
  const applyPageRef = useRef(1);
  const applyRegionFilterRef = useRef('');

  // 지원 목록
  const [applies, setApplies] = useState<LiveApplyRow[]>([]);
  const [boardApplies, setBoardApplies] = useState<LiveApplyRow[]>([]);
  // 예비 등록 목록(별도 표시)
  const [reserveApplies, setReserveApplies] = useState<LiveApplyRow[]>([]);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [busyIntranetCheck, setBusyIntranetCheck] = useState(false);
  const [intranetStatusByAppId, setIntranetStatusByAppId] = useState<Record<string, IntranetCheckResult>>({});
  const [busyRegionalUnmatchedCheck, setBusyRegionalUnmatchedCheck] = useState(false);
  const [regionalUnmatchedRows, setRegionalUnmatchedRows] = useState<RegionalUnmatchedRow[]>([]);
  const [regionalUnmatchedMeta, setRegionalUnmatchedMeta] = useState<RegionalUnmatchedMeta | null>(null);
  const totalAppliedCount = useMemo(
    () => regionsStatus.reduce((sum, row) => sum + Number(row.applied_count ?? 0), 0),
    [regionsStatus],
  );
  const applyPageCount = useMemo(
    () => Math.max(1, Math.ceil(totalApplyCount / APPLY_PAGE_SIZE)),
    [totalApplyCount],
  );

  const isTransientFetchFailure = (message: string) => {
    const normalized = message.trim().toLowerCase();
    return normalized.includes('failed to fetch') || normalized.includes('load failed');
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
      .select(
        'region_id, region_name, sort_order, capacity_total, applied_count, capacity_remaining, is_closed',
      )
      .order('sort_order', { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const list = (data as RegionStatusRow[]) ?? [];
    setRegionsStatus(list);

    // 입력값 초기화/동기화
    setTotalByRegionId((prev) => {
      const next = { ...prev };
      for (const row of list) {
        if (next[row.region_id] === undefined) next[row.region_id] = row.capacity_total ?? 0;
      }
      return next;
    });
  };

  const loadApplies = async () => {
    // applications_live에는 region_name이 없으니, regionsMap으로 표시
    const page = Math.max(1, applyPageRef.current);
    const from = (page - 1) * APPLY_PAGE_SIZE;
    const to = from + APPLY_PAGE_SIZE - 1;

    let appliesQuery = supabase
      .from('applications_live')
      .select(
        'id, created_at, region_id, leader_name, company_name, meeting_time_slot, is_excluded, is_reserve, reviewed, reviewed_at, reviewed_by',
        { count: 'exact' },
      )
      .eq('is_reserve', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (applyRegionFilterRef.current) {
      appliesQuery = appliesQuery.eq('region_id', applyRegionFilterRef.current);
    }

    const reserveQuery = supabase
      .from('applications_live')
      .select('id, created_at, region_id, leader_name, company_name, meeting_time_slot, is_excluded, is_reserve, reviewed, reviewed_at, reviewed_by')
      .eq('is_reserve', true)
      .order('created_at', { ascending: false })
      .limit(200);

    const boardQuery = supabase
      .from('applications_live')
      .select('id, created_at, region_id, leader_name, company_name, meeting_time_slot, is_excluded, is_reserve')
      .eq('is_reserve', false)
      .order('created_at', { ascending: false });

    const [
      { data, error, count },
      { data: reserveData, error: reserveError },
      { data: boardData, error: boardError },
    ] = await Promise.all([
      appliesQuery,
      reserveQuery,
      boardQuery,
    ]);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    if (reserveError) {
      setErrorMsg(reserveError.message);
      return;
    }

    if (boardError) {
      setErrorMsg(boardError.message);
      return;
    }

    const total = Number(count ?? 0);
    const maxPage = Math.max(1, Math.ceil(total / APPLY_PAGE_SIZE));
    setTotalApplyCount(total);

    if (page > maxPage) {
      setApplyPage(maxPage);
      return;
    }

    const normals: LiveApplyRow[] = ((data as ApplicationLiveDbRow[]) ?? []).map((x) => ({
      id: String(x.id),
      created_at: String(x.created_at),
      region_id: String(x.region_id),
      leader_name: String(x.leader_name ?? ''),
      company_name: String(x.company_name ?? ''),
      meeting_time_slot: x.meeting_time_slot === 'am' || x.meeting_time_slot === 'pm' ? x.meeting_time_slot : null,
      is_excluded: Boolean(x.is_excluded),
      is_reserve: Boolean(x.is_reserve),
      reviewed: Boolean(x.reviewed),
      reviewed_at: x.reviewed_at ?? null,
      reviewed_by: x.reviewed_by ?? null,
    }));

    const reserves: LiveApplyRow[] = ((reserveData as ApplicationLiveDbRow[]) ?? []).map((x) => ({
      id: String(x.id),
      created_at: String(x.created_at),
      region_id: String(x.region_id),
      leader_name: String(x.leader_name ?? ''),
      company_name: String(x.company_name ?? ''),
      meeting_time_slot: x.meeting_time_slot === 'am' || x.meeting_time_slot === 'pm' ? x.meeting_time_slot : null,
      is_excluded: Boolean(x.is_excluded),
      is_reserve: Boolean(x.is_reserve),
      reviewed: Boolean(x.reviewed),
      reviewed_at: x.reviewed_at ?? null,
      reviewed_by: x.reviewed_by ?? null,
    }));

    const boardRows: LiveApplyRow[] = ((boardData as ApplicationLiveDbRow[]) ?? []).map((x) => ({
      id: String(x.id),
      created_at: String(x.created_at),
      region_id: String(x.region_id),
      leader_name: String(x.leader_name ?? ''),
      company_name: String(x.company_name ?? ''),
      meeting_time_slot: x.meeting_time_slot === 'am' || x.meeting_time_slot === 'pm' ? x.meeting_time_slot : null,
      is_excluded: Boolean(x.is_excluded),
      is_reserve: Boolean(x.is_reserve),
      reviewed: Boolean(x.reviewed),
      reviewed_at: x.reviewed_at ?? null,
      reviewed_by: x.reviewed_by ?? null,
    }));

    setApplies(normals);
    setBoardApplies(boardRows);
    setReserveApplies(reserves);
  };

const handleToggleReviewed = async (applicationId: string, checked: boolean) => {
  const payload = checked
    ? { reviewed: true, reviewed_at: new Date().toISOString(), reviewed_by: adminUserId }
    : { reviewed: false, reviewed_at: null, reviewed_by: null };

  const { error } = await supabase.from('applications_live').update(payload).eq('id', applicationId);

  if (error) {
    alert(`검수 상태 저장 실패: ${error.message}`);
    return;
  }

  setApplies((prev) =>
    prev.map((item) => (item.id === applicationId ? { ...item, ...payload } : item))
  );
  setReserveApplies((prev) =>
    prev.map((item) => (item.id === applicationId ? { ...item, ...payload } : item))
  );

  pushToast('success', checked ? '검수 완료로 표시했습니다.' : '검수 완료 표시를 해제했습니다.');
};
  const saveOneTotal = async (regionId: string) => {
    pushToast('info', '');
    const v = Number(totalByRegionId[regionId] ?? 0);
    if (!Number.isFinite(v) || v < 0) {
      pushToast('info', '총 TO는 0 이상의 숫자만 가능합니다.');
      return;
    }

    setBusySave(regionId);

    // upsert: region_totals는 region_id가 PK
    const { error } = await supabase
      .from('region_totals')
      .upsert({ region_id: regionId, capacity_total: v }, { onConflict: 'region_id' });

    if (error) {
      setErrorMsg(error.message);
      setBusySave(null);
      return;
    }

    pushToast('success', '저장 완료');
    setBusySave(null);

    // 바로 재조회(보통 realtime으로도 오지만 UX 안정화)
    await loadStatus();
  };

  const saveAllTotals = async () => {
    pushToast('info', '');
    const payload = Object.entries(totalByRegionId).map(([region_id, capacity_total]) => ({
      region_id,
      capacity_total: Math.max(0, Number(capacity_total ?? 0)),
    }));

    if (payload.length === 0) {
      pushToast('info', '저장할 데이터가 없습니다.');
      return;
    }

    setBusySave('__ALL__');

    const { error } = await supabase.from('region_totals').upsert(payload, { onConflict: 'region_id' });

    if (error) {
      setErrorMsg(error.message);
      setBusySave(null);
      return;
    }

    pushToast('success', '전체 저장 완료');
    setBusySave(null);
    await loadStatus();
  };

  const deleteApply = async (row: LiveApplyRow) => {
    pushToast('info', '');
    if (busyDelete) return;

    const rn = regionsMap.get(row.region_id)?.region_name ?? row.region_id;
    const cn = (row.company_name ?? '').trim();

    const ok = window.confirm(
      [
        '정말 삭제하시겠습니까?',
        '',
        `- 지역: ${rn}`,
        `- 기업명: ${cn || '(미입력)'}`,
        '',
        '※ 삭제 후 복구할 수 없습니다.',
        '※ 연결된 녹취가 있으면 함께 삭제됩니다.',
      ].join('')
    );
    if (!ok) return;

    setBusyDelete(row.id);

    try {
      // ✅ 연결된 녹취가 있으면 같이 삭제(스토리지 → DB 순)
      const { data: recs, error: recLookupErr } = await supabase
        .from('call_recordings')
        .select('id, file_path')
        .eq('application_id', row.id);
      if (recLookupErr) throw new Error(`녹취 조회 실패: ${recLookupErr.message}`);

      const recordingRows = (recs as RecordingDeleteRow[] | null) ?? [];
      const recordingPaths = recordingRows.map((rec) => String(rec.file_path ?? '')).filter(Boolean);
      const recordingIds = recordingRows.map((rec) => String(rec.id ?? '')).filter(Boolean);
      if (recordingPaths.length > 0) {
        const rm = await supabase.storage.from('call_recordings').remove(recordingPaths);
        if (rm.error) throw new Error(`녹취 스토리지 삭제 실패: ${rm.error.message}`);
      }
      if (recordingIds.length > 0) {
        const { error: recDelErr } = await supabase.from('call_recordings').delete().in('id', recordingIds);
        if (recDelErr) throw new Error(`녹취 DB 삭제 실패: ${recDelErr.message}`);
      }

      // ✅ 지원 row 삭제
      const { error } = await supabase.from('applications_live').delete().eq('id', row.id);
      if (error) throw new Error(`delete failed: ${error.message}`);

      await appendSupportLog({
        event_type: 'DELETE',
        applied_at: row.created_at,
        application_id: row.id,
        leader_name: row.leader_name,
        region_id: row.region_id,
        region_name: rn,
        company_name: row.company_name,
        is_reserve: row.is_reserve,
        is_excluded: row.is_excluded,
        note: 'admin_delete',
      });

      pushToast('success', '?? ??');
      await loadApplies();
      await loadStatus();
      await loadTodayCounts();
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyDelete(null);
    }
  };

  const toggleExcludeApply = async (row: LiveApplyRow) => {
    pushToast('info', '');
    // busyDelete 재사용하면 UX가 꼬일 수 있어 별도 busy는 안 둠(클릭 연타는 버튼 disabled로 방지)
    const rn = regionsMap.get(row.region_id)?.region_name ?? row.region_id;
    const cn = (row.company_name ?? '').trim();
    const next = !row.is_excluded;

    const ok = window.confirm(
      [
        next ? '이 지원 건을 “제외” 처리할까요?' : '이 지원 건의 “제외”를 해제할까요?',
        '',
        `- 지역: ${rn}`,
        `- 기업명: ${cn || '(미입력)'}`,
        '',
        next
          ? '※ 지역별 TO/지역별 지원보드에서는 제외됩니다.'
          : '※ 지역별 TO/지역별 지원보드에 다시 포함됩니다.',
        '※ 팀장 개인 지원 수(하루 한도 카운트)는 그대로 유지됩니다.',
      ].join('\n')
    );
    if (!ok) return;

    // UI 즉시 반응(optimistic)
    setApplies((prev) => prev.map((x) => (x.id === row.id ? ({ ...x, is_excluded: next } as LiveApplyRow) : x)));
    setReserveApplies((prev) => prev.map((x) => (x.id === row.id ? ({ ...x, is_excluded: next } as LiveApplyRow) : x)));

    const { error } = await supabase.from('applications_live').update({ is_excluded: next }).eq('id', row.id);
    if (error) {
      // ??
      setApplies((prev) => prev.map((x) => (x.id === row.id ? ({ ...x, is_excluded: row.is_excluded } as LiveApplyRow) : x)));
      setReserveApplies((prev) => prev.map((x) => (x.id === row.id ? ({ ...x, is_excluded: row.is_excluded } as LiveApplyRow) : x)));
      setErrorMsg(`?? ?? ??: ${error.message}`);
      return;
    }

    await appendSupportLog({
      event_type: next ? 'EXCEPTION_ON' : 'EXCEPTION_OFF',
      applied_at: row.created_at,
      application_id: row.id,
      leader_name: row.leader_name,
      region_id: row.region_id,
      region_name: rn,
      company_name: row.company_name,
      is_reserve: row.is_reserve,
      is_excluded: next,
      note: next ? 'admin_exception_on' : 'admin_exception_off',
    });

    pushToast('success', next ? '?? ?? ??' : '?? ?? ??');
    if (next && !row.is_reserve) {
      let promoted = false;
      const { data: reservePick, error: reservePickErr } = await supabase
        .from('applications_live')
        .select('id')
        .eq('is_reserve', true)
        .eq('region_id', row.region_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (reservePickErr) {
        setErrorMsg(`예비 자동 선택 실패: ${reservePickErr.message}`);
      } else if (reservePick?.id) {
        const { error: promoteErr } = await supabase.rpc('promote_reserve', { p_application_id: reservePick.id });
        if (promoteErr) {
          setErrorMsg(`예비 자동 등록 실패: ${promoteErr.message}`);
        } else {
          promoted = true;
          pushToast('success', '예비 자동 등록 완료');
        }
      }

      if (promoted) {
        await Promise.all([loadApplies(), loadStatus(), loadTodayCounts()]);
        return;
      }
    }

    // region_status_view는 DB에서 집계하므로 재조회
    await loadStatus();
  };

  const bumpRegionCapacity = async (regionId: string) => {
    const status = regionsStatus.find((item) => item.region_id === regionId);
    const nextTotal = Math.max(0, Number(status?.capacity_total ?? totalByRegionId[regionId] ?? 0)) + 1;

    const { error } = await supabase
      .from('region_totals')
      .upsert({ region_id: regionId, capacity_total: nextTotal }, { onConflict: 'region_id' });

    if (error) {
      throw new Error(`한도 자동 증가 실패: ${error.message}`);
    }

    await loadStatus();
  };

  const promoteReserveApply = async (row: LiveApplyRow) => {
    pushToast('info', '');
    if (busyDelete) return; // 삭제/리셋 등 대형 작업 중에는 막기

    const rn = regionsMap.get(row.region_id)?.region_name ?? row.region_id;
    const cn = (row.company_name ?? '').trim();

    const ok = window.confirm(
      [
        '예비 등록을 정식 등록 하시겠습니까?',
        '',
        `- 지역: ${rn}`,
        `- 기업명: ${cn || '(미입력)'}`,
        '',
        '※ 해당 지역에 TO 잔여가 있을 때만 등록됩니다.',
      ].join('')
    );
    if (!ok) return;

    const status = regionsStatus.find((item) => item.region_id === row.region_id);
    if (status && (status.is_closed || Number(status.capacity_remaining ?? 0) <= 0)) {
      try {
        await bumpRegionCapacity(row.region_id);
        pushToast('info', `${rn} 한도를 1 늘린 뒤 등록을 진행했습니다.`);
      } catch (e: unknown) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    const { error } = await supabase.rpc('promote_reserve', { p_application_id: row.id });
    if (error) {
      // Supabase error message는 그대로 보여주는 게 가장 빠름
      setErrorMsg(`등록 실패: ${error.message}`);
      return;
    }

    pushToast('success', '등록 완료');
    await Promise.all([loadApplies(), loadStatus(), loadTodayCounts()]);
  };



  const updateCompanyName = async (id: string) => {
    pushToast('info', '');
    if (busyUpdateCompanyId) return;

    if (isComposingCompanyById[id]) {
      pushToast('info', '한글 입력이 완료된 후 저장해주세요.');
      return;
    }

    const nextName = (companyInputById[id] ?? '').trim();
    if (!nextName) {
      pushToast('info', '기업명을 입력해주세요.');
      return;
    }
    const targetRow =
      applies.find((row) => row.id === id) ??
      reserveApplies.find((row) => row.id === id) ??
      boardApplies.find((row) => row.id === id) ??
      null;

    setBusyUpdateCompanyId(id);

    const { error } = await supabase.from('applications_live').update({ company_name: nextName }).eq('id', id);

    if (error) {
      setErrorMsg(`기업명 수정 실패: ${error.message}`);
      setBusyUpdateCompanyId(null);
      return;
    }

    pushToast('success', '기업명 수정 완료');
    setEditingCompanyId(null);
    setBusyUpdateCompanyId(null);

    if (targetRow) {
      await appendSupportLog({
        event_type: targetRow.is_reserve ? 'RESERVE_APPLY' : 'APPLY',
        applied_at: targetRow.created_at,
        application_id: targetRow.id,
        leader_name: targetRow.leader_name,
        region_id: targetRow.region_id,
        region_name: regionsMap.get(targetRow.region_id)?.region_name ?? targetRow.region_id,
        company_name: nextName,
        is_reserve: targetRow.is_reserve,
        is_excluded: targetRow.is_excluded,
        note: 'admin_company_name_update',
      });
    }

    await loadApplies(); // 화면 즉시 반영
  };

  const checkIntranetRegistrationRows = async (
    targetRows: LiveApplyRow[],
    emptyMessage: string,
    doneLabel: string,
  ) => {
    pushToast('info', '');
    if (busyIntranetCheck) return;

    if (targetRows.length === 0) {
      pushToast('info', emptyMessage);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰을 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }

    const rows = targetRows.map((a) => ({
      applicationId: a.id,
      appliedAt: a.created_at,
      appliedDate: fmtKstYmd(a.created_at),
      leaderName: a.leader_name ?? '',
      regionName: regionsMap.get(a.region_id)?.region_name ?? a.region_id,
      companyName: a.company_name ?? '',
      meetingTimeSlot: a.meeting_time_slot,
    }));

    setBusyIntranetCheck(true);
    try {
      const res = await fetch('/api/intranet-registration-check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows }),
      });

      const json = (await res.json().catch(() => null)) as IntranetCheckResponse | null;
      if (!res.ok) {
        throw new Error(json?.error || '인트라넷 등록 확인에 실패했습니다.');
      }

      const nextMap: Record<string, IntranetCheckResult> = {};
      for (const result of json?.results ?? []) {
        if (result.applicationId) nextMap[result.applicationId] = result;
      }

      const results = rows.map((row) => {
        const result = nextMap[row.applicationId];
        if (result) return result;
        return {
          applicationId: row.applicationId,
          status: 'missing' as IntranetCheckStatus,
          expectedApDate: row.appliedDate,
          appliedDate: row.appliedDate,
          expectedTimeSlot: row.meetingTimeSlot === 'am' || row.meetingTimeSlot === 'pm' ? row.meetingTimeSlot : undefined,
          matchCount: 0,
          matches: [],
          reason: 'not_found_in_latest_check',
        };
      });
      setIntranetStatusByAppId((prev) => {
        const next = { ...prev };
        for (const result of results) {
          next[result.applicationId] = result;
        }
        return next;
      });

      const registered = results.filter((r) => r.status === 'registered' || r.status === 'multiple').length;
      const missing = results.filter((r) => r.status === 'missing').length;
      const needsCheck = results.length - registered - missing;
      pushToast(
        'success',
        `${doneLabel} (등록 ${registered}건, 미등록 ${missing}건, 확인필요 ${needsCheck}건)`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '인트라넷 등록 확인 중 오류가 발생했습니다.';
      setErrorMsg(message);
    } finally {
      setBusyIntranetCheck(false);
    }
  };

  const checkIntranetRegistration = async () => {
    await checkIntranetRegistrationRows(
      filteredApplies,
      '확인할 지원 목록이 없습니다.',
      '인트라넷 등록 확인 완료',
    );
  };

  const checkReserveIntranetRegistration = async () => {
    await checkIntranetRegistrationRows(
      reserveApplies,
      '확인할 예비 등록 목록이 없습니다.',
      '예비 등록 인트라넷 확인 완료',
    );
  };

  const checkRegionalUnmatched = async () => {
    pushToast('info', '');
    if (busyRegionalUnmatchedCheck) return;

    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰을 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }

    setBusyRegionalUnmatchedCheck(true);
    try {
      const res = await fetch('/api/intranet-regional-unmatched', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as {
        result?: boolean;
        baseDate?: string;
        targetDate?: string;
        quotaCount?: number;
        intranetRegionalCount?: number;
        unmatchedCount?: number;
        rows?: RegionalUnmatchedRow[];
        error?: string;
      };
      if (!res.ok || json.result === false) {
        throw new Error(json.error || '인트라넷 지방 누락 조회에 실패했습니다.');
      }

      const rows = Array.isArray(json.rows) ? json.rows : [];
      setRegionalUnmatchedRows(rows);
      setRegionalUnmatchedMeta({
        baseDate: json.baseDate,
        targetDate: json.targetDate,
        quotaCount: json.quotaCount,
        intranetRegionalCount: json.intranetRegionalCount,
        unmatchedCount: json.unmatchedCount ?? rows.length,
      });
      pushToast('success', `지방 누락 조회 완료 (누락 ${json.unmatchedCount ?? rows.length}건)`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '인트라넷 지방 누락 조회 중 오류가 발생했습니다.';
      setErrorMsg(message);
    } finally {
      setBusyRegionalUnmatchedCheck(false);
    }
  };

  const loadApplyLimit = async () => {
    // app_settings(key='apply_limit_per_user_per_day')에서 공통 한도 로드
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_int')
      .eq('key', APPLY_LIMIT_SETTING_KEY)
      .maybeSingle();

    if (error) {
      const code = (error as SupabaseErrorLike)?.code;
      // 테이블이 아직 없을 수도 있으므로, 이 경우에는 메시지로만 안내
      if (code === '42P01') {
        setErrorMsg('app_settings 테이블이 없어 1인당 하루 한도 설정을 불러올 수 없습니다. (DB에 app_settings 생성 필요)');
        return;
      }
      setErrorMsg(`한도 불러오기 실패: ${error.message}`);
      return;
    }

    const v = Number((data as AppSettingsIntRow | null)?.value_int ?? 0);
    const safe = Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
    setApplyLimit(safe);
    setApplyLimitInput(String(safe));
  };

  const loadExemptUserIds = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_json')
      .eq('key', EXEMPT_KEY)
      .maybeSingle();

    if (error) {
      const code = (error as SupabaseErrorLike)?.code;
      if (code === '42P01') return; // app_settings 없음
      setErrorMsg(`예외 목록 불러오기 실패: ${error.message}`);
      return;
    }

    const raw = (data as AppSettingsJsonRow | null)?.value_json;
    const arr = Array.isArray(raw) ? raw : [];
    setExemptUserIds(arr.map(String));
  };

  
  const loadActiveGroup = async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_int')
      .eq('key', GROUP_SETTING_KEY)
      .maybeSingle();

    if (error) {
      const code = (error as SupabaseErrorLike)?.code;
      if (code === '42P01') return; // app_settings 없음
      setErrorMsg(`오늘 지원 조 불러오기 실패: ${error.message}`);
      return;
    }

    const v = Number((data as AppSettingsIntRow | null)?.value_int ?? 0);
    const safe = Number.isFinite(v) ? Math.max(0, Math.min(2, Math.trunc(v))) : 0;
    setActiveGroup(safe);
  };

  const saveActiveGroup = async (v: number) => {
    pushToast('info', '');
    if (busyActiveGroup) return;

    const safe = Math.max(0, Math.min(2, Math.trunc(Number(v) || 0)));
    setBusyActiveGroup(true);

    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: GROUP_SETTING_KEY, value_int: safe }, { onConflict: 'key' });

    if (error) {
      setErrorMsg(`오늘 지원 조 저장 실패: ${error.message}`);
      setBusyActiveGroup(false);
      return;
    }

    setActiveGroup(safe);
    pushToast('success', '오늘 지원 조 적용 완료');
    setBusyActiveGroup(false);
  };

const loadLeaders = async () => {
    // 팀장 목록: 퇴사 처리되지 않은 팀장 계정만 표시
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, role, is_admin, leader_group')
      .eq('is_admin', false)
      .eq('role', 'leader')
      .is('resigned_at', null)
      .order('display_name', { ascending: true });

    if (error) {
      setErrorMsg(`팀장 목록 불러오기 실패: ${error.message}`);
      return;
    }
    setLeaders((data as ProfileRow[]) ?? []);
  };

  const loadTodayCounts = async (attempt = 0) => {
    // 오늘(로컬) 기준: applications_live에서 created_at이 오늘인 row만 집계
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data, error } = await supabase
      .from('applications_live')
      .select('user_id, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());

    if (error) {
      if (isTransientFetchFailure(error.message)) {
        if (attempt === 0) {
          window.setTimeout(() => {
            void loadTodayCounts(1);
          }, 1200);
        } else {
          console.warn('[admin] loadTodayCounts transient fetch failure:', error.message);
        }
        return;
      }
      setErrorMsg(`오늘 지원 집계 실패: ${error.message}`);
      return;
    }

    const counts: Record<string, number> = {};
    for (const row of (data as TodayCountRow[]) ?? []) {
      const uid = String(row.user_id ?? '').trim();
      if (!uid) continue;
      counts[uid] = (counts[uid] ?? 0) + 1;
    }
    setTodayCountsByUserId(counts);
  };

  const toggleExempt = async (userId: string) => {
    if (busyToggleExempt) return;
    pushToast('info', '');
    setBusyToggleExempt(userId);

    const next = new Set(exemptUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);

    const arr = Array.from(next.values());

    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: EXEMPT_KEY, value_json: arr }, { onConflict: 'key' });

    if (error) {
      setErrorMsg(`예외 저장 실패: ${error.message}`);
      setBusyToggleExempt(null);
      return;
    }

    // optimistic update (realtime로도 곧 동기화)
    setExemptUserIds(arr);
    setBusyToggleExempt(null);
  };

  const saveApplyLimit = async () => {
    pushToast('info', '');
    if (busyApplyLimit) return;

    const parsed = Math.trunc(Number(applyLimitInput));
    if (!Number.isFinite(parsed) || parsed < 0) {
      pushToast('info', '1인당 하루 한도는 0 이상의 정수로 입력해주세요. (0 = 무제한)');
      return;
    }

    setBusyApplyLimit(true);

    const { error } = await supabase
      .from('app_settings')
      .upsert(
        { key: APPLY_LIMIT_SETTING_KEY, value_int: parsed },
        { onConflict: 'key' },
      );

    if (error) {
      const code = (error as SupabaseErrorLike)?.code;
      if (code === '42P01') {
        setErrorMsg('app_settings 테이블이 없어 1인당 하루 한도 설정을 저장할 수 없습니다. (DB에 app_settings 생성 필요)');
        setBusyApplyLimit(false);
        return;
      }
      setErrorMsg(`한도 저장 실패: ${error.message}`);
      setBusyApplyLimit(false);
      return;
    }

    setApplyLimit(parsed);
    setApplyLimitInput(String(parsed));
    pushToast('success', '1인당 하루 한도 적용 완료');
    setBusyApplyLimit(false);
  };

  const resetAll = async () => {
    pushToast('info', '');
    if (busyReset) return;

    const ok = confirm('초기화하면 모든 지역 총 TO가 0이 되고, 지원 목록/녹취 파일이 전부 삭제되며 1인당 하루 한도는 3으로 돌아갑니다. 진행할까요?');
    if (!ok) return;

    setBusyReset(true);

    try {
      // 1) 녹취 파일(Storage) 먼저 삭제
      const { data: recs, error: recErr } = await supabase
        .from('call_recordings')
        .select('file_path');

      if (recErr) {
        setErrorMsg(`녹취 목록 조회 실패: ${recErr.message}`);
        return;
      }

      const paths = (recs as RecordingPathRow[] | null)?.map((r) => String(r.file_path ?? '')).filter(Boolean) ?? [];

      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from('call_recordings').remove(paths);
        if (rmErr) {
          setErrorMsg(`녹취 파일 삭제 실패: ${rmErr.message}`);
          return;
        }
      }

      // 2) DB 초기화 (TO=0 + 지원목록 삭제 등)
      const { error } = await supabase.rpc('admin_reset_live');
      if (error) {
        setErrorMsg(`초기화 실패: ${error.message}`);
        return;
      }

      const { error: limitError } = await supabase
        .from('app_settings')
        .upsert(
          { key: APPLY_LIMIT_SETTING_KEY, value_int: RESET_APPLY_LIMIT_PER_USER_PER_DAY },
          { onConflict: 'key' },
        );

      if (limitError) {
        setErrorMsg(`초기화는 완료됐지만 1인당 하루 한도 복구 실패: ${limitError.message}`);
        await Promise.all([loadStatus(), loadApplies(), loadTodayCounts()]);
        return;
      }

      setApplyLimit(RESET_APPLY_LIMIT_PER_USER_PER_DAY);
      setApplyLimitInput(String(RESET_APPLY_LIMIT_PER_USER_PER_DAY));
      pushToast('success', '초기화 완료 · 1인당 하루 한도 3명으로 복구');
      await Promise.all([loadStatus(), loadApplies(), loadTodayCounts()]);
    } finally {
      setBusyReset(false);
    }
  };
const copyBoardAsImage = async () => {
  pushToast('info', '');
  if (busyCopyBoard) return;

  try {
    setBusyCopyBoard(true);

    // =========================
    // 1) 렌더링 데이터 준비
    // =========================
    const cols = boardMaxCols; // 1~N
    const regions = regionsOrdered
      .map((r) => {
        const cells = boardByRegionId.get(r.id) ?? [];
        return { ...r, cells, total: cells.length };
      })
      .filter((r) => r.total > 0); // 0건 행 숨김 유지

    if (regions.length === 0) {
      pushToast('info', '복사할 보드 데이터가 없습니다.');
      return;
    }

    // =========================
    // 2) Canvas 레이아웃 설정
    // =========================
    const dpr = Math.max(2, Math.floor(window.devicePixelRatio || 1)); // 선명도
    const padding = 18;

    const headerH = 46;
    const rowH = 100;

    // 열 너비: 첫 열(지역/건수)은 내용에 맞춰 좁게, 나머지는 고정
    const firstColW = 130; // 필요시 95~130 사이 조정
    const colW = 96;

    const tableW = firstColW + cols * colW;
    const tableH = headerH + regions.length * rowH;

    // 워터마크 영역 포함
    const watermarkH = 26;
    const canvasW = tableW + padding * 2;
    const canvasH = tableH + padding * 2 + watermarkH;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setErrorMsg('Canvas 컨텍스트를 생성하지 못했습니다.');
      return;
    }
    ctx.scale(dpr, dpr);

    // 색
    const border = '#e6e6e6';
    const text = '#111';
    const white = '#ffffff';
    const gridBold = '#333333';   // 구획선/외곽선(진하게)
    const headerBg = '#f2f2f2';   // 헤더 배경 (더 명확)

    // 배경
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 외곽 박스(테이블)
    const x0 = padding;
    const y0 = padding;

    // =========================
    // 3) 헤더 그리기
    // =========================
    // 헤더 배경
    ctx.fillStyle = headerBg;
    ctx.fillRect(x0, y0, tableW, headerH);

    // 헤더 텍스트
    ctx.fillStyle = text;
    ctx.font = `normal 800 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // 첫 헤더
    ctx.fillText('지역 / 건수', x0 + firstColW / 2, y0 + headerH / 2);

    // 1..N 헤더
    for (let c = 0; c < cols; c++) {
      const cx = x0 + firstColW + c * colW + colW / 2;
      ctx.fillText(String(c + 1), cx, y0 + headerH / 2);
    }

    // 헤더 하단 라인
    ctx.strokeStyle = gridBold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + headerH);
    ctx.lineTo(x0 + tableW, y0 + headerH);
    ctx.stroke();

    // =========================
    // 4) 행/셀 그리기
    // =========================
    for (let rIdx = 0; rIdx < regions.length; rIdx++) {
      const r = regions[rIdx];
      const ry = y0 + headerH + rIdx * rowH;

      // 행 구분선
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(x0, ry);
      ctx.lineTo(x0 + tableW, ry);
      ctx.stroke();

      // 첫 열 배경(지역 색)
      ctx.fillStyle = REGION_BOARD_COLOR[r.name] ?? '#fafafa';
      ctx.fillRect(x0, ry, firstColW, rowH);

      // 첫 열 텍스트(지역/건수)
      ctx.save();
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 지역명 / 건수 (아주 큼)
      ctx.font = `normal 900 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
      ctx.fillText(`${r.name} / ${r.total}`,
        x0 + firstColW / 2,
        ry + rowH / 2
      );
      ctx.restore();

      // 각 지원 셀
      for (let c = 0; c < cols; c++) {
        const cellX = x0 + firstColW + c * colW;
        const cellY = ry;

        // 셀 배경
        ctx.fillStyle = white;
        ctx.fillRect(cellX, cellY, colW, rowH);

        // 셀 텍스트
        const item = r.cells[c];
        ctx.textAlign = 'center';

        if (item) {
          // ✅ 팀장명: 항상 볼드/큰 글자 (매번 강제 세팅)
          ctx.save();
          ctx.fillStyle = '#111';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.font = `normal 900 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
          ctx.fillText(item.leader_name ?? '', cellX + colW / 2, cellY + 30);
          ctx.restore();

          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.font = `normal 900 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
          ctx.fillText(timeSlotLabel(item.meeting_time_slot), cellX + colW / 2, cellY + 50);
          ctx.restore();

          // ✅ 기업명: 항상 작은 글자 (매번 강제 세팅) + ... 유지
          ctx.save();
          ctx.fillStyle = '#222';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.font = `normal 400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;

          const maxWidth = colW - 12;
          const company = item.company_name ?? '';
          const fitted = fitText(ctx, company, maxWidth);
          ctx.fillText(fitted, cellX + colW / 2, cellY + 74);
          ctx.restore();
        } else {
          // ✅ 빈칸 표시도 매번 강제 세팅 (다음 셀에 영향 없게)
          ctx.save();
          ctx.fillStyle = '#c7c7c7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `normal 400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
          ctx.fillText('-', cellX + colW / 2, cellY + rowH / 2);
          ctx.restore();
        }


        // 세로 라인
        ctx.strokeStyle = border;
        ctx.beginPath();
        ctx.moveTo(cellX, cellY);
        ctx.lineTo(cellX, cellY + rowH);
        ctx.stroke();
      }

      // 첫 열 오른쪽 라인
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(x0 + firstColW, ry);
      ctx.lineTo(x0 + firstColW, ry + rowH);
      ctx.stroke();
    }

    // 마지막 하단 라인
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + headerH + regions.length * rowH);
    ctx.lineTo(x0 + tableW, y0 + headerH + regions.length * rowH);
    ctx.stroke();

    // 외곽 테두리
    ctx.strokeStyle = '#dcdcdc';
    ctx.strokeRect(x0, y0, tableW, tableH);

    // =========================
    // 5) 워터마크(날짜/시간)
    // =========================
    const wm = `${new Date().toLocaleString()} · 날씨: -`;
    ctx.fillStyle = '#666';
    ctx.font = `normal 400 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm, x0 + tableW, y0 + tableH + watermarkH / 2);

    // =========================
    // 6) 클립보드로 복사
    // =========================
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );

    if (!blob) {
      setErrorMsg('이미지 생성(toBlob) 실패');
      return;
    }

    const clipboardWindow = window as Window & { ClipboardItem?: ClipboardItemConstructor };
    if (navigator.clipboard && 'write' in navigator.clipboard && clipboardWindow.ClipboardItem) {
      const ClipboardItemCtor = clipboardWindow.ClipboardItem;

      await navigator.clipboard.write([
        new ClipboardItemCtor({
          'image/png': blob,
        }),
      ]);

      pushToast('info', '보드 이미지가 클립보드에 복사되었습니다. (Ctrl+V로 붙여넣기)');
    } else {
      // fallback: 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `지역별지원보드_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast('info', '클립보드 복사가 지원되지 않아 PNG 파일로 다운로드했습니다.');
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    setErrorMsg(`이미지 복사 실패: ${message}`);
  } finally {
    setBusyCopyBoard(false);
  }
};


  // =========================
  // ✅ 지역별 지원 보드(캡쳐형) - 프론트 계산
  // =========================
  const regionsOrdered = useMemo(() => {
    // status_view가 있으면 그 순서를 우선. 없으면 regionsMap sort_order 기반
    if (regionsStatus.length > 0) return regionsStatus.map((r) => ({ id: r.region_id, name: r.region_name, sort: r.sort_order }));
    const arr = Array.from(regionsMap.values()).map((r) => ({ id: r.id, name: r.region_name, sort: r.sort_order }));
    arr.sort((a, b) => a.sort - b.sort);
    return arr;
  }, [regionsStatus, regionsMap]);
  
  const boardByRegionId = useMemo(() => {
    // 보드는 “오래된 것 → 최신” 순으로 왼쪽부터 채워지는 게 캡쳐용으로 더 자연스러움
    // ✅ 제외(is_excluded=true)는 보드/지역 TO 집계에서 제외
    const asc = boardApplies
      .filter((x) => !x.is_excluded)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const m = new Map<string, LiveApplyRow[]>();
    for (const a of asc) {
      if (!m.has(a.region_id)) m.set(a.region_id, []);
      m.get(a.region_id)!.push(a);
    }
    return m;
  }, [boardApplies]);

  const boardMaxCols = useMemo(() => {
    let mx = 0;
    for (const r of regionsOrdered) {
      mx = Math.max(mx, (boardByRegionId.get(r.id) ?? []).length);
    }
    return Math.max(mx, 1);
  }, [regionsOrdered, boardByRegionId]);

  const leaderDashRows = useMemo<LeaderDashRow[]>(() => {
    const ex = new Set(exemptUserIds);
    const q = leaderQuery.trim().toLowerCase();
    const rows: LeaderDashRow[] = (leaders ?? [])
      .map((p) => {
        const name = (p.display_name ?? '').trim();
        return {
          user_id: p.user_id,
          display_name: name || p.user_id,
          today_count: todayCountsByUserId[p.user_id] ?? 0,
          is_exempt: ex.has(p.user_id),
          leader_group: p.leader_group ?? null,
        };
      })
      .filter((r) => {
        // 🔹 검색어 필터
        // ✅ 오늘 지원 조 필터 (0=전체)
        if (activeGroup !== 0) {
          const rg = Number(r.leader_group ?? 0); // 혹시 문자열로 오는 경우 대비
          if (rg !== activeGroup) return false;
        }

        // 기존 검색 필터
        if (!q) return true;
        return r.display_name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // 1) 한도 도달자(예외 제외) 상단 고정
        const aBlocked = applyLimit > 0 && !a.is_exempt && a.today_count >= applyLimit;
        const bBlocked = applyLimit > 0 && !b.is_exempt && b.today_count >= applyLimit;
        if (aBlocked !== bBlocked) return aBlocked ? -1 : 1;

        // 2) 예외 ON 우선
        if (a.is_exempt !== b.is_exempt) return a.is_exempt ? -1 : 1;

        // 3) 오늘 지원수 내림차순
        if (a.today_count !== b.today_count) return b.today_count - a.today_count;

        // 4) 이름 오름차순
        return a.display_name.localeCompare(b.display_name, 'ko');
      });
    return rows;
  }, [leaders, todayCountsByUserId, exemptUserIds, leaderQuery, applyLimit, activeGroup]);

  const filteredApplies = useMemo(() => {
    const q = applyQuery.trim().toLowerCase();
    const regionId = applyRegionFilter;

    return (applies ?? []).filter((a) => {
      // 지역 드롭다운 필터
      if (regionId && a.region_id !== regionId) return false;

      if (!q) return true;

      const leader = (a.leader_name ?? '').toLowerCase();
      const company = (a.company_name ?? '').toLowerCase();
      const regionName =
        (regionsMap.get(a.region_id)?.region_name ?? '').toLowerCase();

      return (
        leader.includes(q) ||
        company.includes(q) ||
        regionName.includes(q)
      );
    });
  }, [applies, applyQuery, applyRegionFilter, regionsMap]);

  const handleApplyRegionFilterChange = (value: string) => {
    setApplyRegionFilter(value);
    setApplyPage(1);
  };

  useEffect(() => {
    applyPageRef.current = applyPage;
  }, [applyPage]);

  useEffect(() => {
    applyRegionFilterRef.current = applyRegionFilter;
  }, [applyRegionFilter]);

  useEffect(() => {
    if (checking) return;
    if (!didInitApplyPagingRef.current) {
      didInitApplyPagingRef.current = true;
      return;
    }
    void loadApplies();
  }, [checking, applyPage, applyRegionFilter]);

  // 로그인 + role 체크 + 초기 로드 + realtime
  useAdminPage({
    setAdminUserId,
    setAdminName,
    setChecking,
    loadRegions,
    loadStatus,
    loadApplies,
    loadApplyLimit,
    loadLeaders,
    loadExemptUserIds,
    loadTodayCounts,
    loadActiveGroup,
    setApplyLimit,
    setApplyLimitInput,
    setExemptUserIds,
    setActiveGroup,
    exemptKey: EXEMPT_KEY,
    groupSettingKey: GROUP_SETTING_KEY,
  });


  if (checking) {
    return (
      <main lang="ko-KR" style={{ padding: isMobile ? 12 : 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
        <h1 style={{ margin: 0 }}>관리자 페이지</h1>
        <p style={{ marginTop: 8, color: '#444' }}>로그인/권한 확인 중...</p>
      </main>
    );
  }

  return (
    <main lang="ko-KR" style={{ padding: isMobile ? 12 : 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <AdminHeader
          adminName={adminName}
          todayLabel={todayLabel}
          activePage="dashboard"
          onGoDashboard={() => router.push('/admin')}
          onGoPeople={() => router.push('/admin/people')}
          onGoWiki={() => router.push('/wiki')}
          onGoRecordings={() => router.push('/admin/recordings')}
          onGoHr={() => router.push('/hr/calendar')}
          onLogout={doLogout}
        />
        {showHelp && <HelpBox onClose={() => setShowHelp(false)} />}
        <Toasts toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />

        {/* Error alert (only errors) */}
        <ErrorAlert message={errorMsg} onClose={() => setErrorMsg('')} />

        {/* 지역별 TO + 팀장 현황 (헤더 내부에 액션 배치) */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 14,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginTop: 18,
          width: '100%',
          maxWidth: 1100,
        }}
      >
        {/* 좌측: 지역별 TO 테이블 */}
        <div ref={leftTOCardRef} style={{ flex: 1, width: isMobile ? '100%' : undefined, minWidth: isMobile ? '100%' : 585, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)', overflow: 'hidden' }}>
          <div style={{ padding: isMobile ? '12px' : '10px 32px', borderBottom: '1px solid #eef2f7', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'baseline', flexDirection: isMobile ? 'column' : 'row', gap: 10, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>지역별 TO</div>
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                입력 · 저장 · 총 지원 {totalAppliedCount}건
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: isMobile ? 'stretch' : 'flex-end', width: isMobile ? '100%' : 'auto' }}>
              <button onClick={saveAllTotals} style={{ ...miniPrimaryBtn, ...(isMobile ? { width: 'calc(50% - 4px)' } : {}) }} disabled={busySave === '__ALL__'}>
                {busySave === '__ALL__' ? '저장중...' : '전체 저장'}
              </button>
              <button onClick={resetAll} style={{ ...miniDangerBtn, ...(isMobile ? { width: 'calc(50% - 4px)' } : {}) }} disabled={busyReset}>
                {busyReset ? '초기화중...' : '초기화'}
              </button>
            </div>
          </div>
          <div style={{ padding: isMobile ? 12 : 14, overflowX: 'auto' }}>
          <table
            className="border-collapse"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              minWidth: 540,
              border: 'none',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ width: 90, padding: '10px 12px', textAlign: 'center' }}>지역</th>
              <th style={{ width: 110, padding: '10px 12px', textAlign: 'center' }}>총 TO(편집)</th>
              <th style={{ width: 80, padding: '10px 12px', textAlign: 'center' }}>지원수</th>
              <th style={{ width: 80, padding: '10px 12px', textAlign: 'center' }}>잔여</th>
              <th style={{ width: 90, padding: '10px 12px', textAlign: 'center' }}>상태</th>
              <th style={{ width: 90, padding: '10px 12px', textAlign: 'center' }}>저장</th>
            </tr>
          </thead>

          <tbody>
            {regionsStatus.map((r) => {
              const total = totalByRegionId[r.region_id] ?? r.capacity_total ?? 0;
              const closed = r.is_closed;

              return (
                <tr key={r.region_id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ ...td, textAlign: 'center' }}>{r.region_name}</td>

                  <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                    <input
                      value={String(total)}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setTotalByRegionId((prev) => ({
                          ...prev,
                          [r.region_id]: Number.isFinite(n) ? n : 0,
                        }));
                      }}
                      style={{ ...input, width: 72, height: 32, textAlign: 'center' }}
                      type="number"
                      min={0}
                    />
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>{r.applied_count}</td>

                  <td style={{ ...td, textAlign: 'center', fontWeight: 900 }}>
                    {r.capacity_remaining}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={closed ? pillClosed : pillOpen}>
                      {closed ? '마감' : '진행중'}
                    </span>
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    <button
                      onClick={() => saveOneTotal(r.region_id)}
                      style={rowBtn}
                      disabled={busySave === r.region_id}
                    >
                      {busySave === r.region_id ? '저장중...' : '저장'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {regionsStatus.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 14, color: '#666', textAlign: 'center' }}>
                  region_status_view 데이터가 없습니다. (regions/is_active 확인)
                </td>
              </tr>
            )}
          </tbody>
          </table>
          </div>
        </div>

        {/* 우측: 팀장 대시보드(예외 토글 포함) */}
        <div
          style={{
            width: isMobile ? '100%' : 500,
            minWidth: isMobile ? '100%' : 0,
            height: isMobile ? 'auto' : (leftTOCardHeight ?? 557),
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            overflow: 'hidden',
            background: '#fff',
            boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: isMobile ? '12px' : '10px 12px',
              background: 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
              borderBottom: '1px solid #eee',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900 }}>팀장 현황</div>

            {/* 우측 컨트롤 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto' }}>
              {/* 1인당 하루 한도 입력 + 적용 (복구) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: isMobile ? 0 : 10,
                  borderLeft: isMobile ? 'none' : '1px solid #e5e7eb',
                  width: isMobile ? '100%' : 'auto',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>1인당 하루 한도</span>

                <input
                  type="number"
                  min={0}
                  value={applyLimitInput}
                  onChange={(e) => setApplyLimitInput(e.target.value)}
                  disabled={busyApplyLimit}
                  title="0 = 무제한"
                  style={{
                    width: isMobile ? 'calc(100% - 64px)' : 56,
                    height: 28,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 900,
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: busyApplyLimit ? '#f8fafc' : '#ffffff',
                  }}
                />

                <button
                  onClick={saveApplyLimit}
                  disabled={busyApplyLimit}
                  style={{
                    height: 28,
                    padding: '0 10px',
                            minWidth: 54,
                    borderRadius: 8,
                    border: '1px solid #111827',
                    background: busyApplyLimit ? '#f8fafc' : '#111827',
                    color: busyApplyLimit ? '#9ca3af' : '#ffffff',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: busyApplyLimit ? 'not-allowed' : 'pointer',
                  }}
                >
                  적용
                </button>
              </div>

              {/* 오늘 지원 조 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: isMobile ? 0 : 10,
                  borderLeft: isMobile ? 'none' : '1px solid #e5e7eb',
                  width: isMobile ? '100%' : 'auto',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>오늘 지원 조</span>

                <select
                  value={String(activeGroup)}
                  onChange={(e) => saveActiveGroup(Number(e.target.value))}
                  disabled={busyActiveGroup}
                  style={{
                    height: 28,
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 12,
                    fontWeight: 900,
                    padding: '0 8px',
                    background: busyActiveGroup ? '#f8fafc' : '#ffffff',
                    cursor: busyActiveGroup ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="0">전체</option>
                  <option value="1">1조</option>
                  <option value="2">2조</option>
                </select>
              </div>

            </div>
          </div>

          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* 검색 */}
            <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
              <input
                value={leaderQuery}
                onChange={(e) => setLeaderQuery(e.target.value)}
                placeholder="이름 검색"
                lang="ko"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  ...input,
                  height: 34,
                  flex: 1,
                  width: isMobile ? '100%' : undefined,
                  padding: '0 10px',
                }}
              />
              <button
                onClick={() => setLeaderQuery('')}
                style={{
                  ...rowBtn,
                  height: 34,
                  padding: '0 10px',
                  opacity: leaderQuery ? 1 : 0.6,
                  width: isMobile ? '100%' : 'auto',
                }}
                disabled={!leaderQuery}
              >
                초기화
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: 10,
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                paddingRight: 2,
              }}
            >
              {leaderDashRows.map((p) => {
                const disabled = busyToggleExempt === p.user_id;
                const isBlocked = applyLimit > 0 && !p.is_exempt && p.today_count >= applyLimit;
                return (
                  <div
                    key={p.user_id}
                    style={{
                      border: '1px solid #eee',
                      borderRadius: 10,
                      padding: '6px 12px',
                      background: isBlocked ? '#fff0f0' : p.is_exempt ? '#fff9e6' : '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        justifyContent: 'space-between',
                        alignItems: isMobile ? 'stretch' : 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: 13,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 140,
                          }}
                          title={p.display_name}
                        >
                          {p.display_name}
                        </div>

                        {p.is_exempt && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: '#ffe8a3',
                              border: '1px solid #f3d36a',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            예외
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: '#e0f2fe',
                            border: '1px solid #bae6fd',
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {p.leader_group === 1 ? '1조' : p.leader_group === 2 ? '2조' : '미지정'}
                        </span>

                        {isBlocked && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: '#ffd6d6',
                              border: '1px solid #ffb3b3',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            한도
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: isMobile ? 'space-between' : 'flex-start' }}>

                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #e6e6e6',
                            background: '#fafafa',
                            whiteSpace: 'nowrap',
                          }}
                          title={applyLimit === 0 ? '무제한(공통 한도 0)' : `공통 한도 ${applyLimit}명`}
                        >
                          {p.today_count}
                        </div>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={p.is_exempt}
                            disabled={disabled}
                            onChange={() => toggleExempt(p.user_id)}
                          />
                          예외
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}

              {leaderDashRows.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 10, color: '#666', textAlign: 'center' }}>
                  팀장 목록이 없습니다. (profiles.role=leader 확인)
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#777' }}>
              예외 ON: 해당 팀장은 1인당 하루 한도 제한을 받지 않습니다(프론트 기준).
            </div>
          </div>
        </div>
      </div>

      <ApplyList
        filteredApplies={filteredApplies}
        totalApplies={totalApplyCount}
        regionsMap={regionsMap}
        applyRegionFilter={applyRegionFilter}
        setApplyRegionFilter={handleApplyRegionFilterChange}
        applyQuery={applyQuery}
        setApplyQuery={setApplyQuery}
        applyPage={applyPage}
        applyPageCount={applyPageCount}
        onApplyPageChange={setApplyPage}
        onResetFilter={() => {
          setApplyQuery('');
          handleApplyRegionFilterChange('');
        }}
        editingCompanyId={editingCompanyId}
        setEditingCompanyId={setEditingCompanyId}
        companyInputById={companyInputById}
        setCompanyInputById={setCompanyInputById}
        isComposingCompanyById={isComposingCompanyById}
        setIsComposingCompanyById={setIsComposingCompanyById}
        busyUpdateCompanyId={busyUpdateCompanyId}
        updateCompanyName={updateCompanyName}
        handleToggleReviewed={handleToggleReviewed}
        toggleExcludeApply={toggleExcludeApply}
        deleteApply={deleteApply}
        busyDelete={busyDelete}
        intranetStatusByAppId={intranetStatusByAppId}
        onCheckIntranetRegistration={checkIntranetRegistration}
        busyIntranetCheck={busyIntranetCheck}
        formatDateTime={fmtDT}
      />

      <IntranetRegionalUnmatchedList
        rows={regionalUnmatchedRows}
        meta={regionalUnmatchedMeta}
        busy={busyRegionalUnmatchedCheck}
        onCheck={checkRegionalUnmatched}
      />

      <ReserveList
        reserveApplies={reserveApplies}
        regionsMap={regionsMap}
        promoteReserveApply={promoteReserveApply}
        toggleExcludeApply={toggleExcludeApply}
        deleteApply={deleteApply}
        busyDelete={busyDelete}
        intranetStatusByAppId={intranetStatusByAppId}
        onCheckReserveIntranetRegistration={checkReserveIntranetRegistration}
        busyIntranetCheck={busyIntranetCheck}
        formatDateTime={fmtDT}
      />

      <QuotaBoard
        boardRef={boardRef}
        busyCopyBoard={busyCopyBoard}
        copyBoardAsImage={copyBoardAsImage}
        boardMaxCols={boardMaxCols}
        regionsOrdered={regionsOrdered}
        boardByRegionId={boardByRegionId}
      />
    </div>
</main>
  );
};


function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;

  // 이진 탐색으로 최대 길이 찾기
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const cand = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(cand).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}
