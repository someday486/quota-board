'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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

type LiveApplyRow = {
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
  leader_group?: number | null;
};

type LeaderDashRow = {
  user_id: string;
  display_name: string;
  today_count: number;
  is_exempt: boolean;
  leader_group: number | null;
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

export default function AdminPage() {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftTOCardRef = useRef<HTMLDivElement | null>(null);
  const [leftTOCardHeight, setLeftTOCardHeight] = useState<number | null>(null);
  const [adminUserId, setAdminUserId] = useState<string>('');

  // 녹취(업로드/재생/검수) - applications_live.id 기준 1:1
  const [recordingsByAppId, setRecordingsByAppId] = useState<Record<string, CallRecordingRow | null>>({});
  const [uploadingByAppId, setUploadingByAppId] = useState<Record<string, boolean>>({});
  const [audioUrlByAppId, setAudioUrlByAppId] = useState<Record<string, string>>({});
  const [dragOverAppId, setDragOverAppId] = useState<string | null>(null);
  const [openPlayerAppId, setOpenPlayerAppId] = useState<string | null>(null);


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

  // 지원 목록
  const [applies, setApplies] = useState<LiveApplyRow[]>([]);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

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


const loadRecordings = async (appIds: string[]) => {
  // appIds가 일부만 넘어와도 기존 맵을 날리지 않고, 해당 id들만 갱신합니다.
  if (!appIds || appIds.length === 0) {
    setRecordingsByAppId({});
    return;
  }

  const { data, error } = await supabase
    .from('call_recordings')
    .select('id, application_id, file_path, file_name, content_type, size_bytes, uploaded_at, reviewed, reviewed_at, reviewed_by')
    .in('application_id', appIds);

  if (error) {
    // 녹취는 “부가 기능”이라 치명 오류로 막지 말고 경고만
    console.warn('[loadRecordings] error:', error.message);
    return;
  }

  const map: Record<string, CallRecordingRow | null> = {};
  for (const id of appIds) map[id] = null;

  for (const r of (data as CallRecordingRow[]) ?? []) {
    map[r.application_id] = r;
  }

  setRecordingsByAppId((prev) => ({ ...prev, ...map }));
};



  const loadApplies = async () => {
    // applications_live에는 region_name이 없으니, regionsMap으로 표시
    const { data, error } = await supabase
      .from('applications_live')
      .select('id, created_at, region_id, leader_name, company_name')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    const list = (data as LiveApplyRow[]) ?? [];
    setApplies(list);

    // ✅ 녹취(부가 기능)도 같이 로드
    await loadRecordings(list.map((x) => x.id));
  };


const pickExt = (name: string) => {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  const ext = name.slice(i).toLowerCase();
  if (!/^\.[a-z0-9]{1,8}$/.test(ext)) return '';
  return ext;
};

const handleUploadRecording = async (applicationId: string, file: File) => {
  if (!file) return;

  // 너무 큰 파일 방지(현장 운영 기준: 200MB)
  const maxMB = 200;
  if (file.size > maxMB * 1024 * 1024) {
    alert(`파일이 너무 큽니다. (${maxMB}MB 이하로 업로드해주세요)`);
    return;
  }

  setUploadingByAppId((p) => ({ ...p, [applicationId]: true }));

  try {
    const ext = pickExt(file.name);
    const path = `applications_live/${applicationId}/recording${ext || ''}`;

    const up = await supabase.storage
      .from('call_recordings')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (up.error) {
      alert(`업로드 실패: ${up.error.message}`);
      return;
    }

    // 1지원(=applications_live 1건)당 1녹취: application_id UNIQUE로 upsert
    const { error: upsertErr } = await supabase
      .from('call_recordings')
      .upsert(
        {
          application_id: applicationId,
          file_path: path,
          file_name: file.name,
          content_type: file.type,
          size_bytes: file.size,
          reviewed: false,
          reviewed_at: null,
          reviewed_by: null,
        },
        { onConflict: 'application_id' },
      );

    if (upsertErr) {
      alert(`DB 저장 실패: ${upsertErr.message}`);
      return;
    }

    // 기존 재생 URL이 있으면 만료될 수 있으니 제거
    setAudioUrlByAppId((p) => {
      const next = { ...p };
      delete next[applicationId];
      return next;
    });

    await loadRecordings([applicationId]);
    pushToast('success', '녹취 업로드 완료');
  } finally {
    setUploadingByAppId((p) => ({ ...p, [applicationId]: false }));
  }
};

const handlePlayRecording = async (applicationId: string) => {
  const rec = recordingsByAppId[applicationId];
  if (!rec) return;

  // 같은 항목에서 다시 누르면 접기
  if (openPlayerAppId === applicationId) {
    setOpenPlayerAppId(null);
    return;
  }

  setOpenPlayerAppId(applicationId);

  // 이미 signed url이 있으면 그대로 사용
  if (audioUrlByAppId[applicationId]) return;

  const { data, error } = await supabase.storage
    .from('call_recordings')
    .createSignedUrl(rec.file_path, 60 * 30); // 30분

  if (error || !data?.signedUrl) {
    alert(`재생 URL 생성 실패: ${error?.message ?? 'unknown'}`);
    return;
  }

  setAudioUrlByAppId((p) => ({ ...p, [applicationId]: data.signedUrl }));
};

const handleDeleteRecording = async (applicationId: string) => {
  const rec = recordingsByAppId[applicationId];
  if (!rec) return;

  const ok = confirm('이 지원 건의 녹취 파일을 삭제할까요? (되돌릴 수 없습니다)');
  if (!ok) return;

  try {
    // 1) Storage 파일 삭제
    const rm = await supabase.storage.from('call_recordings').remove([rec.file_path]);
    if (rm.error) {
      alert(`스토리지 삭제 실패: ${rm.error.message}`);
      return;
    }

    // 2) DB row 삭제
    const { error } = await supabase.from('call_recordings').delete().eq('id', rec.id);
    if (error) {
      alert(`DB 삭제 실패: ${error.message}`);
      return;
    }

    // 로컬 상태 정리
    setRecordingsByAppId((p) => ({ ...p, [applicationId]: null }));
    setAudioUrlByAppId((p) => {
      const next = { ...p };
      delete next[applicationId];
      return next;
    });
    if (openPlayerAppId === applicationId) setOpenPlayerAppId(null);

    pushToast('success', '녹취 삭제 완료');
  } catch (e: any) {
    alert(`삭제 중 오류: ${e?.message ?? String(e)}`);
  }
};

const handleToggleReviewed = async (applicationId: string, checked: boolean) => {
  const rec = recordingsByAppId[applicationId];
  if (!rec) {
    alert('먼저 녹취 파일을 업로드해주세요.');
    return;
  }

  const payload = checked
    ? { reviewed: true, reviewed_at: new Date().toISOString(), reviewed_by: adminUserId }
    : { reviewed: false, reviewed_at: null, reviewed_by: null };

  const { error } = await supabase.from('call_recordings').update(payload).eq('id', rec.id);

  if (error) {
    alert(`검수 상태 저장 실패: ${error.message}`);
    return;
  }

  setRecordingsByAppId((p) => ({
    ...p,
    [applicationId]: { ...rec, ...payload } as CallRecordingRow,
  }));

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

  const deleteApply = async (id: string) => {
    pushToast('info', '');
    if (busyDelete) return;

    setBusyDelete(id);

    const { error } = await supabase.from('applications_live').delete().eq('id', id);

    if (error) {
      setErrorMsg(`삭제 실패: ${error.message}`);
      setBusyDelete(null);
      return;
    }

    setBusyDelete(null);
    pushToast('success', '삭제 완료');
    await loadApplies();
    await loadStatus();
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

    await loadApplies(); // 화면 즉시 반영
  };

  const loadApplyLimit = async () => {
    // app_settings(key='apply_limit_per_user_per_day')에서 공통 한도 로드
    const { data, error } = await supabase
      .from('app_settings')
      .select('value_int')
      .eq('key', 'apply_limit_per_user_per_day')
      .maybeSingle();

    if (error) {
      const code = (error as any)?.code;
      // 테이블이 아직 없을 수도 있으므로, 이 경우에는 메시지로만 안내
      if (code === '42P01') {
        setErrorMsg('app_settings 테이블이 없어 1인당 하루 한도 설정을 불러올 수 없습니다. (DB에 app_settings 생성 필요)');
        return;
      }
      setErrorMsg(`한도 불러오기 실패: ${error.message}`);
      return;
    }

    const v = Number((data as any)?.value_int ?? 0);
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
      const code = (error as any)?.code;
      if (code === '42P01') return; // app_settings 없음
      setErrorMsg(`예외 목록 불러오기 실패: ${error.message}`);
      return;
    }

    const raw = (data as any)?.value_json;
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
      const code = (error as any)?.code;
      if (code === '42P01') return; // app_settings 없음
      setErrorMsg(`오늘 지원 조 불러오기 실패: ${error.message}`);
      return;
    }

    const v = Number((data as any)?.value_int ?? 0);
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
    // 팀장 목록: profiles에서 is_admin=false 기준
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, role, is_admin, leader_group')
      .eq('is_admin', false)
      .order('display_name', { ascending: true });

    if (error) {
      setErrorMsg(`팀장 목록 불러오기 실패: ${error.message}`);
      return;
    }
    setLeaders((data as ProfileRow[]) ?? []);
  };

  const loadTodayCounts = async () => {
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
      setErrorMsg(`오늘 지원 집계 실패: ${error.message}`);
      return;
    }

    const counts: Record<string, number> = {};
    for (const row of (data as any[]) ?? []) {
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
        { key: 'apply_limit_per_user_per_day', value_int: parsed },
        { onConflict: 'key' },
      );

    if (error) {
      const code = (error as any)?.code;
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

    const ok = confirm('초기화하면 모든 지역 총 TO가 0이 되고, 지원 목록/녹취 파일이 전부 삭제됩니다. 진행할까요?');
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

      const paths = (recs as any[] | null)?.map((r) => String(r.file_path ?? '')).filter(Boolean) ?? [];

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

      // 3) 로컬 오디오 URL 정리(메모리 누수 방지)
      setAudioUrlByAppId((prev) => {
        for (const url of Object.values(prev)) {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
        return {};
      });

      pushToast('success', '초기화 완료');
      await loadStatus();
      await loadApplies();
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
    const rowH = 90;

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

    // 공통 폰트
    const font = (w: number) => `normal ${w} 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;
    const fontBold = (w: number) => `normal ${w} 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", Arial`;

    // 색
    const border = '#e6e6e6';
    const text = '#111';
    const subText = '#333';
    const dash = '#bbb';
    const white = '#ffffff';
    const grid = '#d9d9d9';       // 내부 그리드(연하지만 존재감)
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
          ctx.fillText(item.leader_name ?? '', cellX + colW / 2, cellY + 34);
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
          ctx.fillText(fitted, cellX + colW / 2, cellY + 60);
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

    if (navigator.clipboard && 'write' in navigator.clipboard && (window as any).ClipboardItem) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ClipboardItemCtor: any = (window as any).ClipboardItem;

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
  } catch (e: any) {
    setErrorMsg(`이미지 복사 실패: ${e?.message ?? String(e)}`);
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
    const asc = applies.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));

    const m = new Map<string, LiveApplyRow[]>();
    for (const a of asc) {
      if (!m.has(a.region_id)) m.set(a.region_id, []);
      m.get(a.region_id)!.push(a);
    }
    return m;
  }, [applies]);

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
          leader_group: (p as any).leader_group ?? null,
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
      if (regionId && a.region_id !== regionId) return false;
      if (!q) return true;
      const leader = (a.leader_name ?? '').toLowerCase();
      const company = (a.company_name ?? '').toLowerCase();
      return leader.includes(q) || company.includes(q);
    });
  }, [applies, applyQuery, applyRegionFilter]);

  // 로그인 + role 체크 + 초기 로드 + realtime
  useEffect(() => {
    let alive = true;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    const boot = async () => {
      // 로그인 체크
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userRes?.user) {
        router.replace('/login');
        return;
      }

      const uid = userRes.user.id;
      setAdminUserId(uid);

      // 관리자 권한 체크(프로젝트마다 다를 수 있어서 role/is_admin 둘 다 대응)
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('user_id, display_name, role, is_admin, leader_group')
        .eq('user_id', uid)
        .maybeSingle();

      if (!alive) return;

      if (profErr || !prof) {
        router.replace('/login');
        return;
      }

      const p = prof as ProfileRow;
      const isAdmin = p.role === 'admin' || Boolean(p.is_admin);

      if (!isAdmin) {
        router.replace('/login');
        return;
      }

      setAdminName(p.display_name ?? '관리자');

      // 데이터 로드
      await loadRegions();
      await Promise.all([
        loadStatus(),
        loadApplies(),
        loadApplyLimit(),
        loadLeaders(),
        loadExemptUserIds(),
        loadTodayCounts(),
        loadActiveGroup(),
      ]);

      if (!alive) return;

      // realtime: region_totals / applications_live / regions / app_settings 변화 즉시 반영
      ch = supabase
        .channel('admin-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'region_totals' }, () => {
          loadStatus();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'applications_live' }, () => {
          loadApplies();
          loadStatus();
          loadTodayCounts();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'call_recordings' }, () => {
          // 녹취 업로드/검수 변경 즉시 반영
          loadApplies();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'regions' }, () => {
          loadRegions();
          loadStatus();
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.apply_limit_per_user_per_day' },
          (payload) => {
            const row = (payload.new ?? payload.old) as any;
            const v = Number(row?.value_int ?? 0);
            const safe = Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
            setApplyLimit(safe);
            setApplyLimitInput(String(safe));
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${EXEMPT_KEY}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as any;
            const raw = row?.value_json;
            const arr = Array.isArray(raw) ? raw : [];
            setExemptUserIds(arr.map(String));
          }
        )
        
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${GROUP_SETTING_KEY}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as any;
            const v = Number(row?.value_int ?? 0);
            const safe = Number.isFinite(v) ? Math.max(0, Math.min(2, Math.trunc(v))) : 0;
            setActiveGroup(safe);
          }
        )
.subscribe();

      setChecking(false);
    };

    boot();

    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <main style={{ padding: 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
        <h1 style={{ margin: 0 }}>관리자 페이지</h1>
        <p style={{ marginTop: 8, color: '#444' }}>로그인/권한 확인 중...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: '14px 16px',
            boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.2px' }}>관리자 대시보드</div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
              현재 운영 관리자: <b style={{ color: '#111827' }}>{adminName}</b>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{todayLabel}</div>
            <button onClick={doLogout} style={ghostBtn}>로그아웃</button>
          </div>
        </div>

        {showHelp && (
          <div style={helpBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                <b>운영 안내:</b> 총 TO 입력 후 저장하면 즉시 반영됩니다. <b>초기화</b>는 전체 TO를 0으로 만들고 현재 지원 목록을 모두 삭제합니다.
                1인당 하루 한도는 공통 제한이며, 팀장 현황에서 <b>예외</b>를 켜면 해당 팀장은 한도 적용을 받지 않습니다. 1인당 하루 한도를 0으로 적용하면 한도가 사라집니다. 오늘 지원조를 설정하면 해당 조만 지원할 수 있게 적용됩니다.
              </div>
              <button onClick={() => setShowHelp(false)} style={xBtn} aria-label="닫기">
                ×
              </button>
            </div>
          </div>
        )}

        
        {/* Toasts (success/info) */}
        <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                pointerEvents: 'auto',
                minWidth: 220,
                maxWidth: 360,
                background: t.type === 'success' ? '#ecfdf5' : '#eff6ff',
                border: `1px solid ${t.type === 'success' ? '#a7f3d0' : '#bfdbfe'}`,
                color: '#111827',
                borderRadius: 12,
                padding: '10px 12px',
                boxShadow: '0 12px 30px rgba(17, 24, 39, 0.12)',
                fontSize: 13,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ lineHeight: 1.4 }}>{t.text}</div>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{ ...xBtn, pointerEvents: 'auto' }}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Error alert (only errors) */}
        {errorMsg && (
          <div
            style={{
              ...alertBox,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <div style={{ lineHeight: 1.5 }}>{errorMsg}</div>
            <button onClick={() => setErrorMsg('')} style={xBtn} aria-label="닫기">
              ×
            </button>
          </div>
        )}

        {/* 지역별 TO + 팀장 현황 (헤더 내부에 액션 배치) */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          marginTop: 18,
          width: '100%',
          maxWidth: 1100,
        }}
      >
        {/* 좌측: 지역별 TO 테이블 */}
        <div ref={leftTOCardRef} style={{ flex: 1, minWidth: 585, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 10px 30px rgba(17, 24, 39, 0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap' }}>지역별 TO</div>
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>입력 · 저장</div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={saveAllTotals} style={miniPrimaryBtn} disabled={busySave === '__ALL__'}>
                {busySave === '__ALL__' ? '저장중...' : '전체 저장'}
              </button>
              <button onClick={resetAll} style={miniDangerBtn} disabled={busyReset}>
                {busyReset ? '초기화중...' : '초기화'}
              </button>
            </div>
          </div>
          <div style={{ padding: 12 }}>
          <table
            className="border-collapse"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              border: 'none',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ width: 90, padding: '10px 8px', textAlign: 'center' }}>지역</th>
              <th style={{ width: 140, padding: '10px 8px', textAlign: 'center' }}>총 TO(편집)</th>
              <th style={{ width: 80, padding: '10px 8px', textAlign: 'center' }}>지원수</th>
              <th style={{ width: 80, padding: '10px 8px', textAlign: 'center' }}>잔여</th>
              <th style={{ width: 90, padding: '10px 8px', textAlign: 'center' }}>상태</th>
              <th style={{ width: 90, padding: '10px 8px', textAlign: 'center' }}>저장</th>
            </tr>
          </thead>

          <tbody>
            {regionsStatus.map((r) => {
              const total = totalByRegionId[r.region_id] ?? r.capacity_total ?? 0;
              const closed = r.is_closed;

              return (
                <tr key={r.region_id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ ...td, textAlign: 'center' }}>{r.region_name}</td>

                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
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
            width: 500,
            height: leftTOCardHeight ?? 557,
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
              padding: '10px 12px',
              background: 'linear-gradient(180deg, #f9fafb 0%, #f3f4f6 100%)',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 900 }}>팀장 현황</div>

            {/* 우측 컨트롤 영역 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* 1인당 하루 한도 입력 + 적용 (복구) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 10,
                  borderLeft: '1px solid #e5e7eb',
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
                    width: 56,
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
                    padding: '0 12px',
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
                  paddingLeft: 10,
                  borderLeft: '1px solid #e5e7eb',
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
            <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={leaderQuery}
                onChange={(e) => setLeaderQuery(e.target.value)}
                placeholder="이름 검색"
                style={{
                  ...input,
                  height: 34,
                  flex: 1,
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
                }}
                disabled={!leaderQuery}
              >
                초기화
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
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
                      padding: '6px 8px',
                      background: isBlocked ? '#fff0f0' : p.is_exempt ? '#fff9e6' : '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
                            한도 도달
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

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
                  팀장 목록이 없습니다. (profiles.is_admin=false 확인)
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#777' }}>
              예외 ON: 해당 팀장은 1인당 하루 한도 제한을 받지 않습니다(프론트 기준).
            </div>
          </div>
        </div>
      </div>

      {/* 팀장 지원 목록(현재 / 삭제 가능) */}
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
              style={{ ...input, height: 34, padding: '0 10px', width: 75 }}
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
              placeholder="팀장/기업명 검색"
              style={{ ...input, height: 34, padding: '0 10px', width: 140 }}
            />

            <button
              onClick={() => {
                setApplyQuery('');
                setApplyRegionFilter('');
              }}
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
                  <th style={{ ...thSmall, width: 170, textAlign: 'center' }}>시간</th>
                  <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>지역</th>
                  <th style={{ ...thSmall, width: 110, textAlign: 'center' }}>팀장</th>
                  <th style={{ ...thSmall }}>기업명</th>
                  <th style={{ ...thSmall, width: 330, textAlign: 'center' }}>녹취</th>
                  <th style={{ ...thSmall, width: 110, textAlign: 'center' }}>검수</th>
                  <th style={{ ...thSmall, width: 90, textAlign: 'center' }}>삭제</th>
                </tr>
              </thead>

              <tbody>
                {filteredApplies.map((a) => {
                  const rn = regionsMap.get(a.region_id)?.region_name ?? a.region_id;
                  return (
                    <tr key={a.id} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ ...tdSmall, width: 170, textAlign: 'center' }}>{new Date(a.created_at).toLocaleString()}</td>
                      <td style={{ ...tdSmall, width: 90, textAlign: 'center' }}>{rn}</td>
                      <td style={{ ...tdSmall, width: 110, textAlign: 'center' }}>
                        <b>{a.leader_name}</b>
                      </td>
                      <td
                        style={{
                          ...tdSmall,
                          minWidth: 320,
                          ...(editingCompanyId === a.id
                            ? { whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'clip' }
                            : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                        }}
                        title={a.company_name}
                      >
                        {editingCompanyId === a.id ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            <input
                              value={companyInputById[a.id] ?? a.company_name ?? ''}
                              onChange={(e) => setCompanyInputById((p) => ({ ...p, [a.id]: e.target.value }))}
                              onCompositionStart={() =>
                                setIsComposingCompanyById((p) => ({ ...p, [a.id]: true }))
                              }
                              onCompositionEnd={(e) => {
                                setIsComposingCompanyById((p) => ({ ...p, [a.id]: false }));
                                // 조합 완료 시 최종 값을 확정 저장
                                setCompanyInputById((p) => ({ ...p, [a.id]: (e.target as HTMLInputElement).value }));
                              }}
                              style={{
                                ...input,
                                height: 32,
                                width: '100%',
                                flex: '1 1 260px',
                                minWidth: 0,
                                maxWidth: 520,
                                textAlign: 'left',
                              }}
                              placeholder="기업명 수정"
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
                                minWidth: 0,              // 중요: 말줄임이 동작하려면 필요
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
                              style={{ ...rowBtn, flex: '0 0 auto' }} // 버튼은 줄어들지 않게
                            >
                              수정
                            </button>
                          </div>
                        )}
                      </td>

                      {/* ✅ 녹취 업로드/재생 */}
                      <td style={{ ...tdSmall, width: 330 }}>
                        {(() => {
                          const rec = recordingsByAppId[a.id];
                          const uploading = !!uploadingByAppId[a.id];
                          const dragOn = dragOverAppId === a.id;
                          const audioUrl = audioUrlByAppId[a.id];
                          const isOpen = openPlayerAppId === a.id;

                          return (
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverAppId(a.id);
                              }}
                              onDragLeave={() => setDragOverAppId(null)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverAppId(null);
                                const file = e.dataTransfer.files?.[0];
                                if (file) handleUploadRecording(a.id, file);
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
                                    {rec ? '등록됨' : '미등록'}
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
                                    title={rec?.file_name ?? ''}
                                  >
                                    {rec?.file_name ?? '여기로 파일을 끌어다 놓거나 업로드 버튼을 누르세요'}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                  <input
                                    id={`rec-${a.id}`}
                                    type="file"
                                    accept="audio/*"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleUploadRecording(a.id, f);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={uploading}
                                    onClick={() => (document.getElementById(`rec-${a.id}`) as HTMLInputElement | null)?.click()}
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
                                    disabled={!rec}
                                    onClick={() => handlePlayRecording(a.id)}
                                    style={{
                                      height: 30,
                                      padding: '0 10px',
                                      borderRadius: 8,
                                      border: '1px solid #333',
                                      background: '#fff',
                                      fontWeight: 900,
                                      cursor: rec ? 'pointer' : 'not-allowed',
                                      fontSize: 12,
                                      opacity: rec ? 1 : 0.5,
                                    }}
                                  >
                                    {isOpen ? '접기' : '재생'}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={!rec || uploading}
                                    onClick={() => handleDeleteRecording(a.id)}
                                    style={{
                                      height: 30,
                                      padding: '0 10px',
                                      borderRadius: 8,
                                      border: '1px solid #b91c1c',
                                      background: '#fff0f0',
                                      color: '#b91c1c',
                                      fontWeight: 900,
                                      cursor: !rec || uploading ? 'not-allowed' : 'pointer',
                                      fontSize: 12,
                                      opacity: !rec || uploading ? 0.5 : 1,
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
                          );
                        })()}
                      </td>

                      {/* ✅ 검수 완료 체크 */}
                      <td style={{ ...tdSmall, width: 110, textAlign: 'center' }}>
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

                      <td style={{ ...tdSmall, width: 90, textAlign: 'center' }}>
                        <button onClick={() => deleteApply(a.id)} style={dangerMiniBtn} disabled={busyDelete === a.id}>
                          {busyDelete === a.id ? '삭제중...' : '삭제'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredApplies.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 12, color: '#666', textAlign: 'center' }}>
                      표시할 지원 내역이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ✅ 지역별 지원 보드(캡쳐형) 헤더 */}
      <div
        style={{
          marginTop: 26,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10, // 제목-버튼 간격
        }}
      >
        <h2 style={{ margin: 0 }}>지역별 지원 보드(현재)</h2>

        <button
          onClick={copyBoardAsImage}
          style={rowBtn}
          disabled={busyCopyBoard}
        >
          {busyCopyBoard ? '복사중...' : '보드 이미지 복사'}
        </button>
      </div>
      <div ref={boardRef}>
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
                  <th style={{ ...thTiny}}>지역 / 건수</th>
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
                          padding: '6px 8px',
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
          </div>
</main>
  );
}

/* styles */
const alertBox: React.CSSProperties = {
  marginTop: 10,
  padding: '10px 12px',
  border: '1px solid #f1c0c0',
  background: '#fff5f5',
  color: '#b40000',
  borderRadius: 8,
};

const th: React.CSSProperties = {
  padding: '12px 12px',
  textAlign: 'left',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
};

const td: React.CSSProperties = {
  padding: '12px 12px',
  verticalAlign: 'middle',
};

const thSmall: React.CSSProperties = {
  padding: '10px 10px',
  textAlign: 'left',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
};

const tdSmall: React.CSSProperties = {
  padding: '10px 10px',
};

const thTiny: React.CSSProperties = {
  padding: '8px 8px',
  textAlign: 'center',
  fontWeight: 800,
  borderBottom: '1px solid #e6e6e6',
  whiteSpace: 'nowrap',
};

const tdTiny: React.CSSProperties = {
  padding: '8px 8px',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  verticalAlign: 'middle',
};

const input: React.CSSProperties = {
  width: 90,
  height: 36,
  padding: '0 10px',
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 8,
  textAlign: 'right',
};

const pillOpen: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #cfe9d6',
  background: '#f0fff4',
  fontWeight: 800,
  fontSize: 12,
};

const pillClosed: React.CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #f0c3c3',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  height: 40,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const helpBox: React.CSSProperties = {
  marginTop: 18,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: '12px 14px',
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
};

const xBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  fontWeight: 900,
  lineHeight: '26px',
  textAlign: 'center',
  color: '#6b7280',
};


const miniInput: React.CSSProperties = {
  height: 28,
  width: 90,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: 13,
};

const miniBtn: React.CSSProperties = {
  height: 28,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 13,
};


const miniPrimaryBtn: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
  fontSize: 13,
};

const miniDangerBtn: React.CSSProperties = {
  height: 30,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
  fontSize: 13,
};


const rowBtn: React.CSSProperties = {
  height: 36,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};

const dangerMiniBtn: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid #b40000',
  background: '#fff0f0',
  color: '#b40000',
  fontWeight: 900,
  cursor: 'pointer',
};

// 지역별 보드 색상 (캡쳐용)
const REGION_BOARD_COLOR: Record<string, string> = {
  '부산': '#CFE8C5', // 연녹색
  '대구': '#FFD6F0', // 연핑크
  '대전': '#E3ECF9', // 연블루
  '전북': '#FFF200', // 노랑
  '광주': '#FFD9B3', // 살구
  '원주': '#00F5F5', // 민트
  '제주': '#E0E0E0', // 회색
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
