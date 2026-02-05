'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import koLocale from '@fullcalendar/core/locales/ko';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

function labelOf(t: LeaveType) {
  if (t === 'annual') return '연차';
  if (t === 'half_am') return '오전반차';
  return '오후반차';
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
  const [me, setMe] = useState<{ id: string; role: string; display_name: string } | null>(null);
  const isAdmin = me?.role === 'admin';

  // month range + calendar
  const [monthStart, setMonthStart] = useState('');
  const [monthEnd, setMonthEnd] = useState('');
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(false);

  // detail modal (admin cancel only)
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarRow | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // request modal
  const [reqOpen, setReqOpen] = useState(false);
  const [reqType, setReqType] = useState<LeaveType>('annual');
  const [reqStart, setReqStart] = useState('');
  const [reqEnd, setReqEnd] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqUserId, setReqUserId] = useState<string>('');

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
        setMe({
          id: uid,
          role: (p as any).role ?? 'leader',
          display_name: (p as any).display_name ?? '',
        });
      } else {
        setMe({ id: uid, role: 'leader', display_name: '' });
      }
    })();
  }, []);

  // -------- data fetchers --------
  async function fetchMonth(s: string, e: string) {
    setLoading(true);
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
    setLoading(false);

    if (error) {
      console.error(error);
      alert('캘린더 데이터 조회 실패(콘솔 확인)');
      return;
    }

    setRows((data ?? []) as CalendarRow[]);
  }

  async function fetchMyBalance() {
    const { data, error } = await supabase.from('v_my_leave_balance_this_year').select('*').single();
    if (error) {
      console.error(error);
      setMyBalance(null);
      return;
    }
    setMyBalance({
      earned_days: Number((data as any).earned_days ?? 0),
      used_days: Number((data as any).used_days ?? 0),
      remaining_days: Number((data as any).remaining_days ?? 0),
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
      ((data ?? []) as any[]).map((r) => ({
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
    if (monthStart && monthEnd) await fetchMonth(monthStart, monthEnd);

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
    return rows.map((r) => ({
      id: r.id,
      title: `${r.display_name} ${labelOf(r.leave_type)}`,
      start: r.start_date,
      end: addOneDayLocal(r.end_date), // ✅ 하루 덜 보이는 문제 방지
      allDay: true,
      extendedProps: r,
      classNames: ['ev-default'],
    }));
  }, [rows]);

  // -------- request modal logic --------
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

    const daysCount = reqType === 'annual' ? weekdaysBetween(reqStart, reqEnd) : 0.5;

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

  // admin cancel only
  async function doAdminCancel() {
    if (!selected) return;

    const { error } = await supabase.rpc('cancel_leave', { p_request_id: selected.id });
    if (error) {
      console.error(error);
      alert(`취소 실패: ${error.message}`);
      return;
    }

    setCancelConfirmOpen(false);
    setDetailOpen(false);
    await refreshAll();
  }

  // admin weekly pdf download (??? ?????? ???)
  function downloadWeeklyPdf() {
    if (!weekKey) {
      alert('?????????????');
      return;
    }
    window.open(`/api/hr/weekly-pdf?week=${encodeURIComponent(weekKey)}`, '_blank');
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
      alert('?????????????');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      alert('?????? ???????? (???????????)');
      return;
    }

    const res = await fetch(`/api/hr/weekly-csv?week=${encodeURIComponent(weekKey)}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    // ??????: Unauthorized??????? ?????/????? ???????? ??? ???
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      alert(`?????? ??? (${res.status})
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

  return (
    <div style={{ padding: 16 }}>
      {/* Top */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>휴가 캘린더</h1>
        {me?.display_name ? (
          <div style={{ fontSize: 16, fontWeight: 900, opacity: 0.85 }}>{me.display_name}님</div>
        ) : null}
        <div style={{ fontSize: 14, color: '#6b7280' }}>
          {isAdmin ? '날짜 클릭: 대상자 선택 후 휴가 등록 / 이벤트 클릭: 상세(취소 가능)' : '빈 날짜 클릭 → 신청 / 이벤트 클릭 → 상세'}
        </div>
      </div>

      {loading && <div style={{ marginTop: 8, color: '#6b7280' }}>불러오는 중…</div>}

      {/* Calendar */}
      <div style={{ marginTop: 12, ...card, padding: 12 }}>
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          firstDay={1}
          locale={koLocale}
          titleFormat={{ year: 'numeric', month: 'long' }} // 2026년 2월
          dayHeaderFormat={{ weekday: 'short' }} // 월/화/수/목/금/토/일
          events={events}
          // ✅ 관리자일 때는 dateClick 자체를 무시 (신청 완전 차단)
          dateClick={(arg) => {
            openRequestModal(arg.dateStr);
          }}
          eventClick={(info) => {
            const row = info.event.extendedProps as CalendarRow;
            setSelected(row);
            setDetailOpen(true);
          }}
          datesSet={(arg) => {
            const { start, end } = ymRangeFor(arg.view.currentStart);
            setMonthStart(start);
            setMonthEnd(end);
            fetchMonth(start, end);
          }}
          dayCellDidMount={(arg) => {
            const d = arg.date.getDay();
            if (d === 0 || d === 6) {
              arg.el.style.background = '#f4f4f4';
              arg.el.style.opacity = '0.88';
            }
          }}
        />
      </div>

      {/* Dashboards */}
      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        {/* ✅ 관리자일 경우 "내 연차 현황" 숨김 */}
        {!isAdmin && (
          <section style={{ ...card, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 900 }}>내 연차 현황(올해)</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>부여 / 사용 / 잔여</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: '부여', value: myBalance?.earned_days ?? '-' },
                { label: '사용', value: myBalance?.used_days ?? '-' },
                { label: '잔여', value: myBalance?.remaining_days ?? '-' },
              ].map((x) => (
                <div
                  key={x.label}
                  style={{ flex: 1, minWidth: 150, border: '1px solid #eee', borderRadius: 14, padding: 14 }}
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
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
                padding: '16px 18px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
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

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={weekYear}
                  onChange={(e) => setWeekYear(Number(e.target.value))}
                  style={{
                    height: 44,
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
                    minWidth: 260,
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
                  }}
                >
                  주간 신청 명단 CSV 다운로드
                </button>
              </div>
            </header>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
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

      {/* ===== 신청 모달 (관리자: 아예 안 뜨게) ===== */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
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

      {/* ===== 상세 모달 (관리자만 취소) ===== */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900 }}>
                  {selected.display_name} · {labelOf(selected.leave_type)}
                </div>
                <div style={{ marginTop: 8, fontSize: 16 }}>
                  기간: <b>{selected.start_date}</b> ~ <b>{selected.end_date}</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 16 }}>
                  사용: <b>{selected.days_count}</b>일
                </div>
                {selected.reason ? (
                  <div style={{ marginTop: 10, fontSize: 15, color: '#374151' }}>사유: {selected.reason}</div>
                ) : null}
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
                  휴가 취소
                </button>
                <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                  * 취소하면 캘린더/리스트/PDF에서 제외됩니다.
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
            <div style={{ fontSize: 18, fontWeight: 900 }}>정말 취소할까요?</div>
            <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.6, color: '#374151' }}>
              <b>{selected.display_name}</b> · {labelOf(selected.leave_type)}
              <br />
              {selected.start_date} ~ {selected.end_date} (사용 {selected.days_count}일)
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
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
                }}
              >
                아니오
              </button>
              <button
                onClick={doAdminCancel}
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
                }}
              >
                취소합니다
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .ev-default {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
