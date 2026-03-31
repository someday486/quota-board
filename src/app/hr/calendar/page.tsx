'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import KoreanLunarCalendar from 'korean-lunar-calendar';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/hooks/useIsMobile';

type LeaveType = 'annual' | 'half_am' | 'half_pm';
type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

type CalendarRow = {
  id: string;
  user_id: string;
  display_name: string;
  leave_type: LeaveType;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  days_count: number;
  status: LeaveStatus;
  reason: string | null;
};

type MyBalance = {
  earned_days: number;
  used_days: number;
  remaining_days: number;
};

type MyLeaveRow = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
};

type AdminBalanceRow = {
  user_id: string;
  display_name: string;
  earned_days: number;
  used_days: number;
  remaining_days: number;
};

type AdminUserRow = {
  user_id: string;
  display_name: string;
  role: string;
};

type WeeklyRow = {
  id: string;
  display_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
};

type ProfileSummaryRow = {
  user_id: string;
  role: string | null;
  display_name: string | null;
};

type BalanceRow = {
  earned_days: number | null;
  used_days: number | null;
  remaining_days: number | null;
};

type LeaveRequestRow = {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
};

type CenterEventCategory = 'birthday' | 'award' | 'dinner' | 'meeting' | 'notice';
type BirthdayCalendarType = 'solar' | 'lunar';

type CenterEventRow = {
  id: string;
  title: string;
  category: CenterEventCategory;
  start_date: string;
  end_date: string;
  description: string | null;
  recurs_annually: boolean;
  birthday_calendar_type: BirthdayCalendarType;
  birthday_is_intercalation: boolean;
};

type CalendarEntry =
  | { kind: 'leave'; data: CalendarRow }
  | { kind: 'center'; data: CenterEventRow };

type EventTone = {
  label: string;
  dot: string;
  background: string;
  border: string;
  text: string;
};

const leaveToneMap: Record<LeaveType, EventTone> = {
  annual: {
    label: '연차',
    dot: '#0b57d0',
    background: '#e8f0fe',
    border: '#aecbfa',
    text: '#0f3d91',
  },
  half_am: {
    label: '오전반차',
    dot: '#137333',
    background: '#e6f4ea',
    border: '#a8dab5',
    text: '#0d652d',
  },
  half_pm: {
    label: '오후반차',
    dot: '#b06000',
    background: '#fef7e0',
    border: '#f7cb4d',
    text: '#8a4b00',
  },
};

const centerToneMap: Record<CenterEventCategory, EventTone> = {
  birthday: {
    label: '생일',
    dot: '#a142f4',
    background: '#f3e8ff',
    border: '#d8b4fe',
    text: '#7c3aed',
  },
  award: {
    label: '우수섭외자 시상',
    dot: '#c5221f',
    background: '#fce8e6',
    border: '#f28b82',
    text: '#a50e0e',
  },
  dinner: {
    label: '회식',
    dot: '#e37400',
    background: '#fef0dc',
    border: '#fdc57a',
    text: '#b06000',
  },
  meeting: {
    label: '회의',
    dot: '#1a73e8',
    background: '#e8f0fe',
    border: '#aecbfa',
    text: '#185abc',
  },
  notice: {
    label: '센터 일정',
    dot: '#188038',
    background: '#e6f4ea',
    border: '#a8dab5',
    text: '#137333',
  },
};

// ---------- date utils (KST 밀림 방지) ----------
function formatYMDLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addOneDayLocal(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return formatYMDLocal(d);
}

function isWeekend(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return day === 0 || day === 6;
}

// 평일만 카운트
function weekdaysBetween(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return 0;

  let cnt = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) cnt++;
    cur.setDate(cur.getDate() + 1);
  }
  return cnt;
}

function daysBetweenInclusive(start: string, end: string) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return 0;

  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

function labelOf(t: LeaveType) {
  if (t === 'annual') return '연차';
  if (t === 'half_am') return '오전반차';
  return '오후반차';
}

function centerCategoryLabelOf(category: CenterEventCategory) {
  return centerToneMap[category].label;
}

function toneOfLeave(type: LeaveType) {
  return leaveToneMap[type];
}

function toneOfCenter(category: CenterEventCategory) {
  return centerToneMap[category];
}

function selectedTitleOf(entry: CalendarEntry) {
  if (entry.kind === 'leave') {
    return `${entry.data.display_name} · ${labelOf(entry.data.leave_type)}`;
  }

  return entry.data.title;
}

function isMissingCenterCalendarTableError(error: { code?: string; message?: string }) {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message?.includes('support_center_calendar_events') ||
    error.message?.includes('recurs_annually') ||
    error.message?.includes('birthday_calendar_type') ||
    error.message?.includes('birthday_is_intercalation')
  );
}

function buildAnnualDate(targetYear: number, originalDate: string) {
  const [, monthStr, dayStr] = originalDate.split('-');
  const month = Number(monthStr);
  const day = Number(dayStr);
  const lastDay = new Date(targetYear, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);

  return `${targetYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function convertLunarBirthdayToSolar(targetYear: number, originalDate: string, intercalation: boolean) {
  const [, monthStr, dayStr] = originalDate.split('-');
  const calendar = new KoreanLunarCalendar();
  const ok = calendar.setLunarDate(targetYear, Number(monthStr), Number(dayStr), intercalation);
  if (!ok) return null;

  const solar = calendar.getSolarCalendar();
  return `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`;
}

function buildRecurringCenterEventDates(targetYear: number, row: CenterEventRow) {
  if (row.category === 'birthday' && row.birthday_calendar_type === 'lunar') {
    const solarDate = convertLunarBirthdayToSolar(targetYear, row.start_date, row.birthday_is_intercalation);
    if (!solarDate) return null;
    return { start: solarDate, end: solarDate };
  }

  const start = buildAnnualDate(targetYear, row.start_date);
  const end = buildAnnualDate(targetYear, row.end_date);
  return { start, end: end < start ? start : end };
}

function ymRangeFor(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const start = formatYMDLocal(new Date(y, m, 1));
  const end = formatYMDLocal(new Date(y, m + 1, 0));
  return { start, end };
}

// ISO week key (이번 주 자동 선택용)
function getISOWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getISOWeekOptions(year: number) {
  const weeks: string[] = [];
  for (let w = 1; w <= 53; w++) weeks.push(`${year}-W${String(w).padStart(2, '0')}`);
  return weeks;
}

// --- 주차 라벨: 2026년 6주차(2/1~7) ---
function isoWeekStartEnd(isoYear: number, isoWeek: number) {
  // ISO week 기준 월요일~일요일 범위 계산 (UTC 기반)
  const simple = new Date(Date.UTC(isoYear, 0, 1 + (isoWeek - 1) * 7));
  const dow = simple.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const m1 = monday.getUTCMonth() + 1;
  const d1 = monday.getUTCDate();
  const m2 = sunday.getUTCMonth() + 1;
  const d2 = sunday.getUTCDate();

  return { m1, d1, m2, d2 };
}

function weekKeyToKoreanLabelWithRange(key: string) {
  const [y, w] = key.split('-W');
  const year = Number(y);
  const week = Number(w);
  if (!year || !week) return key;

  const { m1, d1, m2, d2 } = isoWeekStartEnd(year, week);
  return `${year}년 ${week}주차(${m1}/${d1}~${m2}/${d2})`;
}

// ---------- Page ----------
export default function Page() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [me, setMe] = useState<{ id: string; role: string; display_name: string } | null>(null);
  const isAdmin = me?.role === 'admin';

  // month range + calendar
  const [monthStart, setMonthStart] = useState('');
  const [monthEnd, setMonthEnd] = useState('');
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [centerEvents, setCenterEvents] = useState<CenterEventRow[]>([]);
  const [showLeaveEvents, setShowLeaveEvents] = useState(true);
  const [showCenterEvents, setShowCenterEvents] = useState(true);
  const [calendarClickMode, setCalendarClickMode] = useState<'leave' | 'center'>('leave');
  const [centerCalendarUnavailable, setCenterCalendarUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);

  // detail modal / destructive action
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEntry | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // request modal
  const [reqOpen, setReqOpen] = useState(false);
  const [reqType, setReqType] = useState<LeaveType>('annual');
  const [reqStart, setReqStart] = useState('');
  const [reqEnd, setReqEnd] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqUserId, setReqUserId] = useState<string>('');

  // center event modal
  const [centerEventOpen, setCenterEventOpen] = useState(false);
  const [centerEventTitle, setCenterEventTitle] = useState('');
  const [centerEventCategory, setCenterEventCategory] = useState<CenterEventCategory>('notice');
  const [centerEventStart, setCenterEventStart] = useState('');
  const [centerEventEnd, setCenterEventEnd] = useState('');
  const [centerEventDescription, setCenterEventDescription] = useState('');
  const [centerEventRepeatsAnnually, setCenterEventRepeatsAnnually] = useState(false);
  const [birthdayCalendarType, setBirthdayCalendarType] = useState<BirthdayCalendarType>('solar');
  const [birthdayIsIntercalation, setBirthdayIsIntercalation] = useState(false);
  const [centerEventSubmitting, setCenterEventSubmitting] = useState(false);

  // dashboard common
  const [myBalance, setMyBalance] = useState<MyBalance | null>(null);
  const [myLeaves, setMyLeaves] = useState<MyLeaveRow[]>([]);

  // admin dashboard
  const [adminBalances, setAdminBalances] = useState<AdminBalanceRow[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [weekKey, setWeekKey] = useState<string>(''); // e.g. 2026-W06
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([]);
  const [weekYear, setWeekYear] = useState<number>(new Date().getFullYear()); // 옵션 년도
  const weekOptions = useMemo(() => getISOWeekOptions(weekYear), [weekYear]);

  // -------- auth/profile --------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      const { data: p, error } = await supabase
        .from('profiles')
        .select('user_id, role, display_name')
        .eq('user_id', uid)
        .single();

      if (!error && p) {
        const profile = p as ProfileSummaryRow;
        setMe({
          id: uid,
          role: profile.role ?? 'leader',
          display_name: profile.display_name ?? '',
        });
      } else {
        setMe({ id: uid, role: 'leader', display_name: '' });
      }
    })();
  }, []);

  // -------- data fetchers --------
  async function fetchMonthLeaveRows(s: string, e: string) {
    let q = supabase
      .from('v_leave_calendar')
      .select('id,user_id,display_name,leave_type,start_date,end_date,days_count,status,reason')
      .lte('start_date', e)
      .gte('end_date', s)
      .neq('status', 'canceled'); // 취소 숨김

    if (!isAdmin && me?.id) {
      q = q.eq('user_id', me.id);
    }

    const { data, error } = await q;

    if (error) {
      console.error(error);
      throw error;
    }

    setRows((data ?? []) as CalendarRow[]);
  }

  async function fetchCenterEventRows(s: string, e: string) {
    const { data, error } = await supabase
      .from('support_center_calendar_events')
      .select('id,title,category,start_date,end_date,description,recurs_annually,birthday_calendar_type,birthday_is_intercalation')
      .order('start_date', { ascending: true });

    if (error) {
      if (isMissingCenterCalendarTableError(error)) {
        setCenterCalendarUnavailable(true);
        setCenterEvents([]);
        return;
      }

      console.error(error);
      throw error;
    }

    setCenterCalendarUnavailable(false);
    const year = Number(s.slice(0, 4));
    const visibleRows = ((data ?? []) as CenterEventRow[]).flatMap((row) => {
      if (!row.recurs_annually) {
        return rangesOverlap(row.start_date, row.end_date, s, e) ? [row] : [];
      }

      const recurringDates = buildRecurringCenterEventDates(year, row);
      if (!recurringDates) return [];

      const recurringRow: CenterEventRow = {
        ...row,
        start_date: recurringDates.start,
        end_date: recurringDates.end,
      };

      return rangesOverlap(recurringRow.start_date, recurringRow.end_date, s, e) ? [recurringRow] : [];
    });

    setCenterEvents(visibleRows);
  }

  async function fetchCalendarData(s: string, e: string) {
    setLoading(true);

    try {
      await Promise.all([fetchMonthLeaveRows(s, e), fetchCenterEventRows(s, e)]);
    } catch {
      alert('캘린더 데이터 조회 실패(콘솔 확인)');
      return;
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyBalance() {
    const { data, error } = await supabase.from('v_my_leave_balance_this_year').select('*').single();
    if (error) {
      console.error(error);
      setMyBalance(null);
      return;
    }
    const balance = data as BalanceRow;
    setMyBalance({
      earned_days: Number(balance.earned_days ?? 0),
      used_days: Number(balance.used_days ?? 0),
      remaining_days: Number(balance.remaining_days ?? 0),
    });
  }

  async function fetchMyLeaves() {
    const y = new Date().getFullYear();
    const start = `${y}-01-01`;
    const end = `${y}-12-31`;

    const { data, error } = await supabase
      .from('leave_requests')
      .select('id,leave_type,start_date,end_date,days_count,reason,status')
      .gte('start_date', start)
      .lte('start_date', end)
      .neq('status', 'canceled')
      .order('start_date', { ascending: false });

    if (error) {
      console.error(error);
      setMyLeaves([]);
      return;
    }

    setMyLeaves(
      ((data ?? []) as LeaveRequestRow[]).map((r) => ({
        id: r.id,
        leave_type: r.leave_type,
        start_date: r.start_date,
        end_date: r.end_date,
        days_count: Number(r.days_count),
        reason: r.reason ?? null,
      }))
    );
  }

  async function fetchAdminBalances() {
    const { data, error } = await supabase
      .from('v_leave_balance_admin_this_year')
      .select('user_id,display_name,earned_days,used_days,remaining_days')
      .order('display_name', { ascending: true });

    if (error) {
      console.error(error);
      setAdminBalances([]);
      return;
    }

    setAdminBalances((data ?? []) as AdminBalanceRow[]);
  }

  async function fetchAdminUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id,display_name,role')
      .order('display_name', { ascending: true });

    if (error) {
      console.error(error);
      setAdminUsers([]);
      return;
    }

    setAdminUsers((data ?? []) as AdminUserRow[]);
  }

  async function fetchWeeklyLeaves(key: string) {
    const [y, w] = key.split('-W');
    const iso_year = Number(y);
    const iso_week = Number(w);

    const { data, error } = await supabase
      .from('v_leave_weekly_admin')
      .select('id,display_name,leave_type,start_date,end_date,days_count,reason,iso_year,iso_week')
      .eq('iso_year', iso_year)
      .eq('iso_week', iso_week)
      .order('display_name', { ascending: true });

    if (error) {
      console.error(error);
      setWeeklyRows([]);
      return;
    }

    setWeeklyRows((data ?? []) as WeeklyRow[]);
  }

  async function refreshAll() {
    if (monthStart && monthEnd) await fetchCalendarData(monthStart, monthEnd);

    // ✅ 관리자일 때는 "내 현황/내 리스트" 아예 안 불러와도 됨 (쿼리 낭비 방지)
    if (!isAdmin) {
      await fetchMyBalance();
      await fetchMyLeaves();
    } else {
      setMyBalance(null);
      setMyLeaves([]);
    }

    if (isAdmin) {
      await fetchAdminBalances();
      await fetchAdminUsers();
      if (weekKey) await fetchWeeklyLeaves(weekKey);
    }
  }

  useEffect(() => {
    if (!me?.id) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.role]);

  useEffect(() => {
    if (isAdmin) return;
    setCalendarClickMode('leave');
  }, [isAdmin]);

  // 관리자: 이번 주 자동 선택
  useEffect(() => {
    if (!isAdmin) return;
    const thisWeek = getISOWeekKey();
    setWeekKey(thisWeek);
    setWeekYear(Number(thisWeek.split('-W')[0]));
  }, [isAdmin]);

  // weekKey 변경 시 주간 리스트 조회
  useEffect(() => {
    if (!isAdmin || !weekKey) return;
    fetchWeeklyLeaves(weekKey);
  }, [isAdmin, weekKey]);

  // -------- FullCalendar events --------
  const events = useMemo(() => {
    const leaveEntries = showLeaveEvents
      ? rows.map((r) => {
          const tone = toneOfLeave(r.leave_type);
          return {
            id: `leave-${r.id}`,
            title: `${r.display_name} · ${labelOf(r.leave_type)}`,
            start: r.start_date,
            end: addOneDayLocal(r.end_date),
            allDay: true,
            backgroundColor: tone.background,
            borderColor: tone.border,
            textColor: tone.text,
            classNames: ['calendar-entry', 'calendar-entry--leave'],
            extendedProps: {
              kind: 'leave' as const,
              data: r,
              dotColor: tone.dot,
              badgeLabel: tone.label,
            },
          };
        })
      : [];

    const centerEntries = showCenterEvents
      ? centerEvents.map((r) => {
          const tone = toneOfCenter(r.category);
          return {
            id: `center-${r.id}`,
            title: r.title,
            start: r.start_date,
            end: addOneDayLocal(r.end_date),
            allDay: true,
            backgroundColor: tone.background,
            borderColor: tone.border,
            textColor: tone.text,
            classNames: ['calendar-entry', 'calendar-entry--center'],
            extendedProps: {
              kind: 'center' as const,
              data: r,
              dotColor: tone.dot,
              badgeLabel: tone.label,
            },
          };
        })
      : [];

    return [...centerEntries, ...leaveEntries];
  }, [centerEvents, rows, showCenterEvents, showLeaveEvents]);

  // -------- request modal logic --------
  function openCenterEventModal(dateStr = formatYMDLocal(new Date())) {
    if (!isAdmin) return;
    if (centerCalendarUnavailable) {
      alert('센터 일정 테이블이 아직 준비되지 않았습니다. Supabase 마이그레이션을 먼저 적용해 주세요.');
      return;
    }

    setCenterEventTitle('');
    setCenterEventCategory('notice');
    setCenterEventStart(dateStr);
    setCenterEventEnd(dateStr);
    setCenterEventDescription('');
    setCenterEventRepeatsAnnually(false);
    setBirthdayCalendarType('solar');
    setBirthdayIsIntercalation(false);
    setCenterEventOpen(true);
  }

  function handleDateClick(dateStr: string) {
    if (isAdmin && calendarClickMode === 'center') {
      openCenterEventModal(dateStr);
      return;
    }

    openRequestModal(dateStr);
  }

  function openRequestModal(dateStr: string) {
    if (isAdmin && adminUsers.length === 0) {
      alert('사용자 목록이 없어 휴가를 등록할 수 없습니다.');
      return;
    }
    if (isWeekend(dateStr)) {
      alert('주말에는 신청할 수 없습니다.');
      return;
    }
    setReqType('annual');
    setReqStart(dateStr);
    setReqEnd(dateStr);
    setReqReason('');
    if (isAdmin) {
      const meRow = adminUsers.find((u) => u.user_id === me?.id);
      setReqUserId(meRow?.user_id ?? adminUsers[0]?.user_id ?? '');
    }
    setReqOpen(true);
  }

  function centerEventDaysPreview() {
    if (!centerEventStart || !centerEventEnd) return 0;
    return daysBetweenInclusive(centerEventStart, centerEventEnd);
  }

  function reqDaysPreview() {
    if (!reqStart || !reqEnd) return 0;
    if (reqType === 'half_am' || reqType === 'half_pm') return 0.5;
    return weekdaysBetween(reqStart, reqEnd);
  }

  async function submitAdminRequest() {
    if (!reqUserId) {
      alert('대상 사용자를 선택해 주세요.');
      return;
    }

    if (!reqStart || !reqEnd) {
      alert('날짜를 입력해 주세요.');
      return;
    }

    if (reqType !== 'annual') {
      if (reqStart !== reqEnd) {
        alert('반차는 하루만 선택 가능합니다.');
        return;
      }
      if (isWeekend(reqStart)) {
        alert('주말에는 반차를 등록할 수 없습니다.');
        return;
      }
    } else {
      if (weekdaysBetween(reqStart, reqEnd) <= 0) {
        alert('선택한 기간에 평일이 없습니다.');
        return;
      }
    }

    setReqSubmitting(true);

    const { error } = await supabase.rpc('request_leave_admin', {
      p_user_id: reqUserId,
      p_leave_type: reqType,
      p_start_date: reqStart,
      p_end_date: reqEnd,
      p_reason: reqReason || null,
    });

    setReqSubmitting(false);

    if (error) {
      console.error(error);
      alert(`등록 실패: ${error.message}`);
      return;
    }

    setReqOpen(false);
    await refreshAll();
  }

  async function submitRequest() {
    if (isAdmin) {
      await submitAdminRequest();
      return;
    }

    if (!reqStart || !reqEnd) {
      alert('날짜를 입력하세요.');
      return;
    }

    if (reqType !== 'annual') {
      if (reqStart !== reqEnd) {
        alert('반차는 하루만 선택 가능합니다.');
        return;
      }
      if (isWeekend(reqStart)) {
        alert('주말에는 반차 신청이 불가합니다.');
        return;
      }
    } else {
      if (weekdaysBetween(reqStart, reqEnd) <= 0) {
        alert('선택한 기간에 평일이 없습니다.');
        return;
      }
    }

    setReqSubmitting(true);

    const { error } = await supabase.rpc('request_leave', {
      p_leave_type: reqType,
      p_start_date: reqStart,
      p_end_date: reqEnd,
      p_reason: reqReason || null,
    });

    setReqSubmitting(false);

    if (error) {
      console.error(error);
      alert(`신청 실패: ${error.message}`);
      return;
    }

    setReqOpen(false);
    await refreshAll();
  }

  async function submitCenterEvent() {
    if (!isAdmin) return;

    if (centerCalendarUnavailable) {
      alert('센터 일정 테이블이 아직 준비되지 않았습니다. Supabase 마이그레이션을 먼저 적용해 주세요.');
      return;
    }

    if (!centerEventTitle.trim()) {
      alert('일정 제목을 입력해 주세요.');
      return;
    }

    if (!centerEventStart || (centerEventCategory !== 'birthday' && !centerEventEnd)) {
      alert('일정 날짜를 입력해 주세요.');
      return;
    }

    if (centerEventCategory !== 'birthday' && centerEventEnd < centerEventStart) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    setCenterEventSubmitting(true);

    const { error } = await supabase.from('support_center_calendar_events').insert({
      title: centerEventTitle.trim(),
      category: centerEventCategory,
      start_date: centerEventStart,
      end_date: centerEventCategory === 'birthday' ? centerEventStart : centerEventEnd,
      description: centerEventDescription.trim() || null,
      recurs_annually: centerEventCategory === 'birthday' ? true : centerEventRepeatsAnnually,
      birthday_calendar_type: centerEventCategory === 'birthday' ? birthdayCalendarType : 'solar',
      birthday_is_intercalation: centerEventCategory === 'birthday' ? birthdayIsIntercalation : false,
      created_by: me?.id ?? null,
    });

    setCenterEventSubmitting(false);

    if (error) {
      console.error(error);
      alert(`센터 일정 등록 실패: ${error.message}`);
      return;
    }

    setCenterEventOpen(false);
    await refreshAll();
  }

  async function doAdminCancel() {
    if (!selected || selected.kind !== 'leave') return;

    const { error } = await supabase.rpc('cancel_leave', { p_request_id: selected.data.id });
    if (error) {
      console.error(error);
      alert(`취소 실패: ${error.message}`);
      return;
    }

    setCancelConfirmOpen(false);
    setDetailOpen(false);
    await refreshAll();
  }

  async function deleteCenterEvent() {
    if (!selected || selected.kind !== 'center') return;

    const { error } = await supabase.from('support_center_calendar_events').delete().eq('id', selected.data.id);
    if (error) {
      console.error(error);
      alert(`센터 일정 삭제 실패: ${error.message}`);
      return;
    }

    setCancelConfirmOpen(false);
    setDetailOpen(false);
    await refreshAll();
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;

    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token ?? undefined;
    }

    return token ?? null;
  }

  async function downloadWeeklyCsv() {
    if (!weekKey) {
      alert('주차를 먼저 선택해 주세요.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      alert('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }

    const res = await fetch(`/api/hr/weekly-csv?week=${encodeURIComponent(weekKey)}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    // 인증 오류가 나면 상태/응답 본문을 함께 보여 준다.
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      alert(`다운로드 실패 (${res.status})
${txt}`);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly_leave_${weekKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  }


  // ---------- styles ----------
  const card = {
    borderRadius: 18,
    background: '#fff',
    boxShadow: '0 12px 28px rgba(17,24,39,0.08)',
    border: '1px solid #e5e7eb',
  } as const;

  const monthWorkdays = monthStart && monthEnd ? weekdaysBetween(monthStart, monthEnd) : 0;

  return (
    <div style={{ padding: isMobile ? 12 : 16 }}>
      <header
        style={{
          ...card,
          padding: isMobile ? '14px 14px' : '16px 18px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#111827' }}>휴가관리 캘린더</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#5f6368', marginTop: 6 }}>
            휴가와 섭외센터 일정을 한 화면에 모아 보고, 주말까지 포함해 확인하는 업무용 월간 캘린더입니다.
          </div>
        </div>
        <button
          onClick={() => router.push(isAdmin ? '/admin' : '/leader')}
          style={{
            height: 42,
            padding: '0 16px',
            borderRadius: 999,
            border: '1px solid #d2d6dc',
            background: '#ffffff',
            color: '#1f2937',
            fontSize: 14,
            fontWeight: 900,
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto',
          }}
        >
          돌아가기
        </button>
      </header>

      {loading && <div style={{ marginTop: 8, color: '#6b7280' }}>불러오는 중…</div>}

      {/* Calendar */}
      <div className="hr-calendar-shell" style={{ marginTop: 12, ...card, padding: isMobile ? 12 : 18 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'stretch' : 'flex-start',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'grid', gap: 10, flex: 1 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: '휴가 일정', value: rows.length, color: leaveToneMap.annual.dot },
                { label: '센터 일정', value: centerEvents.length, color: centerToneMap.notice.dot },
                { label: '이번 달 평일', value: monthWorkdays, color: '#5f6368' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    minWidth: isMobile ? '100%' : 154,
                    padding: '12px 14px',
                    borderRadius: 16,
                    border: '1px solid #e8eaed',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#5f6368', fontSize: 13, fontWeight: 800 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: item.color }} />
                    {item.label}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 24, lineHeight: 1, fontWeight: 900, color: '#111827' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setShowLeaveEvents((prev) => !prev)}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${showLeaveEvents ? leaveToneMap.annual.border : '#d2d6dc'}`,
                  background: showLeaveEvents ? leaveToneMap.annual.background : '#fff',
                  color: showLeaveEvents ? leaveToneMap.annual.text : '#5f6368',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                휴가 {showLeaveEvents ? '숨기기' : '보이기'}
              </button>
              <button
                onClick={() => setShowCenterEvents((prev) => !prev)}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${showCenterEvents ? centerToneMap.notice.border : '#d2d6dc'}`,
                  background: showCenterEvents ? centerToneMap.notice.background : '#fff',
                  color: showCenterEvents ? centerToneMap.notice.text : '#5f6368',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                센터 일정 {showCenterEvents ? '숨기기' : '보이기'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, minWidth: isMobile ? '100%' : 280 }}>
            {isAdmin && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: '1px solid #e8eaed',
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: '#5f6368', marginBottom: 8 }}>날짜 클릭 동작</div>
                <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                  {[
                    { mode: 'leave' as const, label: '휴가 등록' },
                    { mode: 'center' as const, label: '센터 일정 등록' },
                  ].map((item) => (
                    <button
                      key={item.mode}
                      onClick={() => setCalendarClickMode(item.mode)}
                      style={{
                        flex: 1,
                        height: 40,
                        borderRadius: 12,
                        border: calendarClickMode === item.mode ? '1px solid #1a73e8' : '1px solid #d2d6dc',
                        background: calendarClickMode === item.mode ? '#e8f0fe' : '#fff',
                        color: calendarClickMode === item.mode ? '#185abc' : '#374151',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                padding: '12px 14px',
                borderRadius: 16,
                border: '1px solid #e8eaed',
                background: '#fff',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 900, color: '#5f6368' }}>표시 범례</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[leaveToneMap.annual, centerToneMap.notice, centerToneMap.birthday, centerToneMap.dinner].map((tone) => (
                  <div
                    key={tone.label}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 999,
                      background: tone.background,
                      border: `1px solid ${tone.border}`,
                      color: tone.text,
                      fontSize: 13,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot }} />
                    {tone.label}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <button
                  onClick={() => openCenterEventModal()}
                  style={{
                    height: 42,
                    borderRadius: 12,
                    border: '1px solid #d2d6dc',
                    background: '#fff',
                    color: '#1f2937',
                    fontSize: 14,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  센터 일정 직접 추가
                </button>
              )}
            </div>
          </div>
        </div>

        {centerCalendarUnavailable && (
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid #fde68a',
              background: '#fffbeb',
              color: '#92400e',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            센터 일정 테이블이 아직 연결되지 않아 휴가만 표시 중입니다. 추가한 마이그레이션을 적용하면 센터 일정도 바로 함께 보입니다.
          </div>
        )}

        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          firstDay={1}
          weekends
          fixedWeekCount={false}
          dayMaxEventRows={3}
          moreLinkContent={(arg) => `+${arg.num}개 더보기`}
          locale={koLocale}
          buttonText={{ today: '오늘' }}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: '',
          }}
          titleFormat={{ year: 'numeric', month: 'long' }}
          dayHeaderFormat={{ weekday: 'short' }}
          events={events}
          dateClick={(arg) => {
            handleDateClick(arg.dateStr);
          }}
          eventClick={(info) => {
            const kind = info.event.extendedProps.kind as CalendarEntry['kind'];
            const data = info.event.extendedProps.data as CalendarRow | CenterEventRow;
            if (kind === 'leave') {
              setSelected({ kind, data: data as CalendarRow });
            } else {
              setSelected({ kind, data: data as CenterEventRow });
            }
            setDetailOpen(true);
          }}
          eventContent={(info) => (
            <div className="calendar-entry__inner">
              <span className="calendar-entry__dot" style={{ background: String(info.event.extendedProps.dotColor ?? '#1a73e8') }} />
              <span className="calendar-entry__text">{info.event.title}</span>
            </div>
          )}
          datesSet={(arg) => {
            const { start, end } = ymRangeFor(arg.view.currentStart);
            setMonthStart(start);
            setMonthEnd(end);
            fetchCalendarData(start, end);
          }}
        />
      </div>

      {/* Dashboards */}
      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {/* ✅ 관리자일 경우 "내 연차 현황" 숨김 */}
        {!isAdmin && (
          <section style={{ ...card, padding: isMobile ? 12 : 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 900 }}>내 연차 현황(올해)</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>부여 / 사용 / 잔여</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              {[
                { label: '부여', value: myBalance?.earned_days ?? '-' },
                { label: '사용', value: myBalance?.used_days ?? '-' },
                { label: '잔여', value: myBalance?.remaining_days ?? '-' },
              ].map((x) => (
                <div
                  key={x.label}
                  style={{ flex: 1, minWidth: isMobile ? '100%' : 150, border: '1px solid #eee', borderRadius: 14, padding: 14 }}
                >
                  <div style={{ fontSize: 14, color: '#6b7280' }}>{x.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginTop: 6 }}>{x.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ✅ 관리자일 경우 "내 휴가 사용 리스트" 숨김 */}
        {!isAdmin && (
          <section style={{ ...card, overflow: 'hidden' }}>
            <header style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 19, fontWeight: 900 }}>내 휴가 사용 리스트(올해)</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>최근 순</div>
            </header>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: isMobile ? 14 : 15 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>기간</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>유형</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>사용</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {myLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 18, color: '#6b7280', textAlign: 'center' }}>
                        아직 사용 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    myLeaves.map((r) => (
                      <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '14px 16px' }}>
                          {r.start_date} ~ {r.end_date}
                        </td>
                        <td style={{ padding: '14px 16px' }}>{labelOf(r.leave_type)}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900 }}>{r.days_count}</td>
                        <td
                          style={{
                            padding: '14px 16px',
                            maxWidth: 360,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#374151',
                          }}
                          title={r.reason ?? ''}
                        >
                          {r.reason ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Admin-only: balances */}
        {isAdmin && (
          <section style={{ ...card, overflow: 'hidden' }}>
            <header style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 19, fontWeight: 900 }}>팀장별 연차 잔여(올해)</div>
              <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>한눈에 확인</div>
            </header>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: isMobile ? 14 : 15 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>팀장</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>부여</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>사용</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>잔여</th>
                  </tr>
                </thead>
                <tbody>
                  {adminBalances.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 18, color: '#6b7280', textAlign: 'center' }}>
                        팀장 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    adminBalances.map((r) => (
                      <tr key={r.user_id} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 900 }}>{r.display_name}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{r.earned_days}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{r.used_days}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900 }}>{r.remaining_days}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Admin-only: weekly list + PDF download */}
        {isAdmin && (
          <section style={{ ...card, overflow: 'hidden' }}>
            <header
              style={{
                padding: isMobile ? '12px' : '16px 18px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 19, fontWeight: 900 }}>주간 연차 사용 현황</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                  선택한 주에 사용된 휴가 내역 · {weekKey ? weekKeyToKoreanLabelWithRange(weekKey) : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
                <select
                  value={weekYear}
                  onChange={(e) => setWeekYear(Number(e.target.value))}
                  style={{
                    height: 44,
                    width: isMobile ? '100%' : 'auto',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    padding: '0 12px',
                    fontSize: 15,
                    fontWeight: 800,
                    background: '#f9fafb',
                    cursor: 'pointer',
                  }}
                >
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>

                <select
                  value={weekKey}
                  onChange={(e) => setWeekKey(e.target.value)}
                  style={{
                    height: 44,
                    minWidth: isMobile ? 0 : 260,
                    width: isMobile ? '100%' : 'auto',
                    borderRadius: 12,
                    border: '1px solid #d1d5db',
                    padding: '0 14px',
                    fontSize: 15,
                    fontWeight: 800,
                    background: '#f9fafb',
                    cursor: 'pointer',
                  }}
                >
                  {weekOptions.map((w) => (
                    <option key={w} value={w}>
                      {weekKeyToKoreanLabelWithRange(w)}
                    </option>
                  ))}
                </select>

                {/* ✅ PDF 버튼 비활성화 */}
                <button
                  onClick={downloadWeeklyCsv}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    padding: '0 14px',
                    border: '1px solid #d1d5db',
                    background: '#f3f4f6',
                    color: '#9ca3af',
                    fontWeight: 900,
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  주간 신청 명단 CSV 다운로드
                </button>
              </div>
            </header>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: isMobile ? 14 : 15 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>팀장</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>유형</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>기간</th>
                    <th style={{ padding: '14px 16px', textAlign: 'right' }}>사용</th>
                    <th style={{ padding: '14px 16px', textAlign: 'left' }}>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 18, color: '#6b7280', textAlign: 'center' }}>
                        해당 주에 사용된 연차가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    weeklyRows.map((r) => (
                      <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 900 }}>{r.display_name}</td>
                        <td style={{ padding: '14px 16px' }}>{labelOf(r.leave_type)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          {r.start_date} ~ {r.end_date}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 900 }}>{r.days_count}</td>
                        <td
                          style={{
                            padding: '14px 16px',
                            maxWidth: 340,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: '#374151',
                          }}
                          title={r.reason ?? ''}
                        >
                          {r.reason ?? '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* ===== 휴가 신청 모달 ===== */}
      {reqOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setReqOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>휴가 신청</div>
                <div style={{ marginTop: 6, fontSize: 14, color: '#6b7280' }}>주말 제외(평일만 차감)</div>
              </div>
              <button
                onClick={() => setReqOpen(false)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fafafa',
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: 'pointer',
                  alignSelf: isMobile ? 'flex-end' : 'auto',
                }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {isAdmin && (
                <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>대상자</div>
                  <select
                    value={reqUserId}
                    onChange={(e) => setReqUserId(e.target.value)}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      padding: '0 12px',
                      fontSize: 16,
                      fontWeight: 800,
                      background: '#fff',
                    }}
                  >
                    {adminUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.display_name || u.user_id}
                        {u.role === 'admin' ? ' (관리자)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>유형</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  {(['annual', 'half_am', 'half_pm'] as LeaveType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setReqType(t);
                        if (t !== 'annual') setReqEnd(reqStart);
                      }}
                      style={{
                        height: 44,
                        padding: '0 14px',
                        borderRadius: 12,
                        border: reqType === t ? '1px solid #111' : '1px solid #e5e7eb',
                        background: reqType === t ? '#111' : '#fff',
                        color: reqType === t ? '#fff' : '#111',
                        fontSize: 16,
                        fontWeight: 900,
                        cursor: 'pointer',
                        width: isMobile ? '100%' : 'auto',
                      }}
                    >
                      {labelOf(t)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>시작일</div>
                  <input
                    type="date"
                    value={reqStart}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isWeekend(v)) {
                        alert('주말은 선택할 수 없습니다.');
                        return;
                      }
                      setReqStart(v);
                      if (reqEnd < v) setReqEnd(v);
                      if (reqType !== 'annual') setReqEnd(v);
                    }}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      padding: '0 12px',
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>종료일</div>
                  <input
                    type="date"
                    value={reqEnd}
                    disabled={reqType !== 'annual'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (isWeekend(v)) {
                        alert('주말은 선택할 수 없습니다.');
                        return;
                      }
                      setReqEnd(v);
                    }}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      padding: '0 12px',
                      fontSize: 16,
                      background: reqType !== 'annual' ? '#f7f7f7' : '#fff',
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: 16 }}>
                사용일수(평일 기준): <b style={{ fontSize: 18 }}>{reqDaysPreview()}</b>
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>사유(선택)</div>
                <input
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="(선택) 간단히 입력"
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    padding: '0 12px',
                    fontSize: 16,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                <button
                  onClick={() => setReqOpen(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: 17,
                    fontWeight: 900,
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                  disabled={reqSubmitting}
                >
                  닫기
                </button>
                <button
                  onClick={submitRequest}
                  style={{
                    flex: 2,
                    height: 48,
                    borderRadius: 12,
                    border: '1px solid #111',
                    background: '#111',
                    color: '#fff',
                    fontSize: 17,
                    fontWeight: 900,
                    cursor: 'pointer',
                    opacity: reqSubmitting ? 0.65 : 1,
                    width: isMobile ? '100%' : 'auto',
                  }}
                  disabled={reqSubmitting}
                >
                  {reqSubmitting ? '신청 중…' : '신청하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 센터 일정 등록 모달 ===== */}
      {centerEventOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setCenterEventOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>센터 일정 등록</div>
                <div style={{ marginTop: 6, fontSize: 14, color: '#6b7280' }}>생일, 시상, 회식, 회의 같은 내부 일정을 달력에 함께 표시합니다.</div>
              </div>
              <button
                onClick={() => setCenterEventOpen(false)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fafafa',
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: 'pointer',
                  alignSelf: isMobile ? 'flex-end' : 'auto',
                }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>제목</div>
                <input
                  value={centerEventTitle}
                  onChange={(e) => setCenterEventTitle(e.target.value)}
                  placeholder="예: 4월 우수섭외자 시상 / 민지님 생일 / 월말 회식"
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    padding: '0 12px',
                    fontSize: 16,
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>카테고리</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  {(Object.keys(centerToneMap) as CenterEventCategory[]).map((category) => {
                    const tone = toneOfCenter(category);
                    const active = centerEventCategory === category;
                    return (
                      <button
                        key={category}
                        onClick={() => {
                          setCenterEventCategory(category);
                          if (category === 'birthday') {
                            setCenterEventRepeatsAnnually(true);
                            if (centerEventStart) setCenterEventEnd(centerEventStart);
                          } else if (centerEventCategory === 'birthday') {
                            setCenterEventRepeatsAnnually(false);
                            setBirthdayCalendarType('solar');
                            setBirthdayIsIntercalation(false);
                          }
                        }}
                        style={{
                          height: 44,
                          padding: '0 14px',
                          borderRadius: 12,
                          border: `1px solid ${active ? tone.dot : '#e5e7eb'}`,
                          background: active ? tone.background : '#fff',
                          color: active ? tone.text : '#111827',
                          fontSize: 15,
                          fontWeight: 900,
                          cursor: 'pointer',
                          width: isMobile ? '100%' : 'auto',
                        }}
                      >
                        {centerCategoryLabelOf(category)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {centerEventCategory === 'birthday' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>생일 기준</div>
                    <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                      {([
                        { value: 'solar' as const, label: '양력 생일' },
                        { value: 'lunar' as const, label: '음력 생일' },
                      ]).map((item) => (
                        <button
                          key={item.value}
                          onClick={() => {
                            setBirthdayCalendarType(item.value);
                            if (item.value === 'solar') setBirthdayIsIntercalation(false);
                          }}
                          style={{
                            flex: 1,
                            height: 44,
                            borderRadius: 12,
                            border: birthdayCalendarType === item.value ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                            background: birthdayCalendarType === item.value ? '#f3e8ff' : '#fff',
                            color: birthdayCalendarType === item.value ? '#6d28d9' : '#111827',
                            fontSize: 15,
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {birthdayCalendarType === 'lunar' && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                        background: '#fff',
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#374151',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={birthdayIsIntercalation}
                        onChange={(e) => setBirthdayIsIntercalation(e.target.checked)}
                      />
                      윤달 생일입니다.
                    </label>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>시작일</div>
                  <input
                    type="date"
                    value={centerEventStart}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCenterEventStart(value);
                      if (centerEventCategory === 'birthday') {
                        setCenterEventEnd(value);
                        return;
                      }
                      if (centerEventEnd < value) setCenterEventEnd(value);
                    }}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      padding: '0 12px',
                      fontSize: 16,
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>종료일</div>
                  <input
                    type="date"
                    value={centerEventEnd}
                    disabled={centerEventCategory === 'birthday'}
                    onChange={(e) => setCenterEventEnd(e.target.value)}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      padding: '0 12px',
                      fontSize: 16,
                      background: centerEventCategory === 'birthday' ? '#f7f7f7' : '#fff',
                    }}
                  />
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: centerEventCategory === 'birthday' || centerEventRepeatsAnnually ? '#f8fafc' : '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#374151',
                }}
              >
                <input
                  type="checkbox"
                  checked={centerEventCategory === 'birthday' ? true : centerEventRepeatsAnnually}
                  onChange={(e) => setCenterEventRepeatsAnnually(e.target.checked)}
                  disabled={centerEventCategory === 'birthday'}
                />
                {centerEventCategory === 'birthday'
                  ? `생일은 매년 자동 반복됩니다. ${birthdayCalendarType === 'lunar' ? '음력을 해당 연도 양력 날짜로 변환해 보여줍니다.' : ''}`
                  : '이 일정을 매년 반복 일정으로 저장'}
              </label>

              <div style={{ fontSize: 16 }}>
                표시 일수: <b style={{ fontSize: 18 }}>{centerEventDaysPreview()}</b>
              </div>

              <div>
                <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6 }}>메모(선택)</div>
                <textarea
                  value={centerEventDescription}
                  onChange={(e) => setCenterEventDescription(e.target.value)}
                  placeholder="장소, 준비물, 전달할 공지 등을 적어 두세요."
                  style={{
                    width: '100%',
                    minHeight: 108,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    padding: '12px',
                    fontSize: 15,
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                생일은 하루 일정으로 저장되며, 음력 생일은 보고 있는 연도의 양력 날짜로 자동 변환해 표시합니다.
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                <button
                  onClick={() => setCenterEventOpen(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: 17,
                    fontWeight: 900,
                    cursor: 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                  disabled={centerEventSubmitting}
                >
                  닫기
                </button>
                <button
                  onClick={submitCenterEvent}
                  style={{
                    flex: 2,
                    height: 48,
                    borderRadius: 12,
                    border: '1px solid #1a73e8',
                    background: '#1a73e8',
                    color: '#fff',
                    fontSize: 17,
                    fontWeight: 900,
                    cursor: 'pointer',
                    opacity: centerEventSubmitting ? 0.65 : 1,
                    width: isMobile ? '100%' : 'auto',
                  }}
                  disabled={centerEventSubmitting}
                >
                  {centerEventSubmitting ? '등록 중…' : '센터 일정 저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 상세 모달 ===== */}
      {detailOpen && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
          onClick={() => setDetailOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{selectedTitleOf(selected)}</div>
                {selected.kind === 'leave' ? (
                  <>
                    <div style={{ marginTop: 8, fontSize: 16 }}>
                      기간: <b>{selected.data.start_date}</b> ~ <b>{selected.data.end_date}</b>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 16 }}>
                      사용: <b>{selected.data.days_count}</b>일
                    </div>
                    {selected.data.reason ? (
                      <div style={{ marginTop: 10, fontSize: 15, color: '#374151' }}>사유: {selected.data.reason}</div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div style={{ marginTop: 8, fontSize: 16 }}>
                      구분: <b>{centerCategoryLabelOf(selected.data.category)}</b>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 16 }}>
                      일정: <b>{selected.data.start_date}</b> ~ <b>{selected.data.end_date}</b>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 16 }}>
                      반복: <b>{selected.data.recurs_annually ? '매년 반복' : '한 번만 표시'}</b>
                    </div>
                    {selected.data.category === 'birthday' && (
                      <div style={{ marginTop: 4, fontSize: 16 }}>
                        기준: <b>{selected.data.birthday_calendar_type === 'lunar' ? `음력${selected.data.birthday_is_intercalation ? ' 윤달' : ''}` : '양력'}</b>
                      </div>
                    )}
                    {selected.data.description ? (
                      <div style={{ marginTop: 10, fontSize: 15, color: '#374151', lineHeight: 1.6 }}>메모: {selected.data.description}</div>
                    ) : (
                      <div style={{ marginTop: 10, fontSize: 15, color: '#6b7280' }}>등록된 메모가 없습니다.</div>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={() => setDetailOpen(false)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fafafa',
                  fontSize: 18,
                  fontWeight: 900,
                  cursor: 'pointer',
                  alignSelf: isMobile ? 'flex-end' : 'auto',
                }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {isAdmin && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => setCancelConfirmOpen(true)}
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 12,
                    border: '1px solid #dc2626',
                    background: '#fff',
                    color: '#dc2626',
                    fontSize: 18,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {selected.kind === 'leave' ? '휴가 취소' : '센터 일정 삭제'}
                </button>
                <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                  {selected.kind === 'leave'
                    ? '* 취소하면 캘린더/리스트/PDF에서 제외됩니다.'
                    : '* 삭제하면 센터 일정 캘린더에서 바로 제외됩니다.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 취소 확인 모달 ===== */}
      {cancelConfirmOpen && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 10000,
          }}
          onClick={() => setCancelConfirmOpen(false)}
        >
          <div
            style={{
              width: 'min(460px, 100%)',
              background: '#fff',
              borderRadius: 16,
              padding: 16,
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 900 }}>{selected.kind === 'leave' ? '정말 취소할까요?' : '정말 삭제할까요?'}</div>
            <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6, color: '#374151' }}>
              <b>{selectedTitleOf(selected)}</b>
              <br />
              {selected.kind === 'leave'
                ? `${selected.data.start_date} ~ ${selected.data.end_date} (사용 ${selected.data.days_count}일)`
                : `${selected.data.start_date} ~ ${selected.data.end_date} (${centerCategoryLabelOf(selected.data.category)})`}
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                onClick={() => setCancelConfirmOpen(false)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                아니오
              </button>
              <button
                onClick={selected.kind === 'leave' ? doAdminCancel : deleteCenterEvent}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  border: '1px solid #dc2626',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: 'pointer',
                  width: isMobile ? '100%' : 'auto',
                }}
              >
                {selected.kind === 'leave' ? '취소합니다' : '삭제합니다'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .hr-calendar-shell .fc {
          --fc-border-color: #e8eaed;
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f8fafc;
          --fc-list-event-hover-bg-color: #f8fafc;
          --fc-button-bg-color: #ffffff;
          --fc-button-border-color: #d2d6dc;
          --fc-button-text-color: #1f2937;
          --fc-button-hover-bg-color: #f3f4f6;
          --fc-button-hover-border-color: #c7cdd4;
          --fc-button-active-bg-color: #e8f0fe;
          --fc-button-active-border-color: #aecbfa;
          --fc-today-bg-color: #e8f0fe;
        }

        .hr-calendar-shell .fc-toolbar {
          margin-bottom: 14px;
          gap: 12px;
          flex-wrap: wrap;
        }

        .hr-calendar-shell .fc-toolbar-title {
          font-size: 1.45rem;
          font-weight: 900;
          color: #202124;
        }

        .hr-calendar-shell .fc-button {
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          box-shadow: none;
          font-weight: 800;
        }

        .hr-calendar-shell .fc .fc-scrollgrid {
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid #e8eaed;
        }

        .hr-calendar-shell .fc .fc-scrollgrid-sync-table {
          table-layout: fixed;
        }

        .hr-calendar-shell .fc-theme-standard td,
        .hr-calendar-shell .fc-theme-standard th {
          border-color: #e8eaed;
        }

        .hr-calendar-shell .fc-col-header-cell:nth-child(-n + 5),
        .hr-calendar-shell .fc-daygrid-body .fc-daygrid-day:nth-child(-n + 5) {
          width: 15.6%;
        }

        .hr-calendar-shell .fc-col-header-cell:nth-child(6),
        .hr-calendar-shell .fc-col-header-cell:nth-child(7),
        .hr-calendar-shell .fc-daygrid-body .fc-daygrid-day:nth-child(6),
        .hr-calendar-shell .fc-daygrid-body .fc-daygrid-day:nth-child(7) {
          width: 11%;
        }

        .hr-calendar-shell .fc-col-header-cell {
          background: #f8fafc;
          padding: 8px 0;
        }

        .hr-calendar-shell .fc-col-header-cell.fc-day-sat,
        .hr-calendar-shell .fc-col-header-cell.fc-day-sun {
          background: linear-gradient(180deg, #f3f4f6 0%, #eef2f7 100%);
        }

        .hr-calendar-shell .fc-col-header-cell-cushion {
          color: #5f6368;
          font-size: 0.9rem;
          font-weight: 800;
          text-decoration: none;
        }

        .hr-calendar-shell .fc-daygrid-day {
          background: #fff;
        }

        .hr-calendar-shell .fc-daygrid-day.fc-day-sat,
        .hr-calendar-shell .fc-daygrid-day.fc-day-sun {
          background:
            linear-gradient(180deg, rgba(148, 163, 184, 0.1) 0%, rgba(148, 163, 184, 0.04) 100%),
            #f8fafc;
        }

        .hr-calendar-shell .fc-daygrid-day-frame {
          min-height: 132px;
          padding: 6px;
        }

        .hr-calendar-shell .fc-daygrid-day.fc-day-sat .fc-daygrid-day-frame,
        .hr-calendar-shell .fc-daygrid-day.fc-day-sun .fc-daygrid-day-frame {
          padding-left: 4px;
          padding-right: 4px;
        }

        .hr-calendar-shell .fc-daygrid-day-number {
          color: #202124;
          font-weight: 800;
          padding: 6px 8px;
          text-decoration: none;
        }

        .hr-calendar-shell .fc-day-today .fc-daygrid-day-number {
          border-radius: 999px;
          background: #1a73e8;
          color: #fff;
        }

        .hr-calendar-shell .fc-day-sat .fc-daygrid-day-number,
        .hr-calendar-shell .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion {
          color: #2563eb;
        }

        .hr-calendar-shell .fc-day-sun .fc-daygrid-day-number,
        .hr-calendar-shell .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion {
          color: #dc2626;
        }

        .hr-calendar-shell .calendar-entry {
          margin-top: 2px;
          border-radius: 8px;
          border-width: 1px;
          font-weight: 800;
        }

        .hr-calendar-shell .calendar-entry:hover {
          filter: brightness(0.98);
        }

        .hr-calendar-shell .calendar-entry__inner {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          padding: 3px 6px;
        }

        .hr-calendar-shell .calendar-entry__dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .hr-calendar-shell .calendar-entry__text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hr-calendar-shell .fc-daygrid-more-link {
          margin-top: 4px;
          color: #1a73e8;
          font-weight: 800;
          text-decoration: none;
        }

        @media (max-width: 768px) {
          .hr-calendar-shell .fc-toolbar-title {
            font-size: 1.2rem;
          }

          .hr-calendar-shell .fc-daygrid-day-frame {
            min-height: 104px;
          }
        }
      `}</style>
    </div>
  );
}
