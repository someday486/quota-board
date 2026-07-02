'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminHeader from '../_components/AdminHeader';
import { dangerMiniBtn, miniBtn, miniInput, rowBtn } from '../styles';

type BirthdayCalendarType = 'solar' | 'lunar';

type PeopleRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  is_admin: boolean | null;
  leader_group: number | null;
  hire_date: string | null;
  resigned_at: string | null;
  resignation_note: string | null;
  birthday_event_id: string | null;
  birthday_date: string | null;
  birthday_calendar_type: BirthdayCalendarType;
  birthday_is_intercalation: boolean;
  invalid_call_count: number | null;
  participation_restricted_until: string | null;
  participation_restriction_note: string | null;
};

type AuthProfile = {
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

type EditState = {
  invalidCallCount: string;
  restrictedUntil: string;
  note: string;
  hireDate: string;
  resignedAt: string;
  resignationNote: string;
  birthdayDate: string;
  birthdayCalendarType: BirthdayCalendarType;
  birthdayIsIntercalation: boolean;
};

type CreateState = {
  email: string;
  password: string;
  displayName: string;
  leaderGroup: '' | '1' | '2';
  hireDate: string;
  birthdayDate: string;
  birthdayCalendarType: BirthdayCalendarType;
  birthdayIsIntercalation: boolean;
};

const emptyCreateState: CreateState = {
  email: '',
  password: '',
  displayName: '',
  leaderGroup: '',
  hireDate: '',
  birthdayDate: '',
  birthdayCalendarType: 'solar',
  birthdayIsIntercalation: false,
};

const pad = (n: number) => String(n).padStart(2, '0');

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isCurrentlyRestricted(untilIso: string | null) {
  if (!untilIso) return false;
  const end = new Date(untilIso).getTime();
  if (Number.isNaN(end)) return false;
  return end > Date.now();
}

function penaltyRuleLabel(count: number) {
  if (count >= 5) return '규정: 1개월 제한 대상';
  if (count >= 3) return '규정: 1주 제한 대상';
  return '제한 없음';
}

function autoPasswordFromEmail(email: string) {
  const local = email.trim().split('@')[0] ?? '';
  return local ? local.toUpperCase() : '';
}

function todayDateInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isResigned(row: PeopleRow) {
  return Boolean(row.resigned_at);
}

function sortPeopleRows(rows: PeopleRow[]) {
  return [...rows].sort((a, b) => {
    const an = a.display_name || a.email || a.user_id;
    const bn = b.display_name || b.email || b.user_id;
    return an.localeCompare(bn, 'ko');
  });
}

async function responseError(res: Response, fallback: string) {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error || fallback;
}

export default function AdminPeoplePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [adminName, setAdminName] = useState('관리자');
  const [rows, setRows] = useState<PeopleRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateState>(emptyCreateState);
  const [busyCreate, setBusyCreate] = useState(false);

  const [query, setQuery] = useState('');
  const [restrictedOnly, setRestrictedOnly] = useState(false);
  const [penaltyFilter, setPenaltyFilter] = useState<'all' | '3plus' | '5plus'>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | '1' | '2'>('all');
  const [employmentFilter, setEmploymentFilter] = useState<'active' | 'resigned' | 'all'>('active');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      });
    } catch {
      return '';
    }
  }, []);

  const managedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => !(r.role === 'admin' || r.is_admin))
      .filter((r) => {
        const resigned = isResigned(r);
        if (employmentFilter === 'active') return !resigned;
        if (employmentFilter === 'resigned') return resigned;
        return true;
      })
      .filter((r) => (groupFilter === 'all' ? true : String(r.leader_group ?? '') === groupFilter))
      .filter((r) => {
        const c = Number(r.invalid_call_count ?? 0);
        if (penaltyFilter === '3plus') return c >= 3;
        if (penaltyFilter === '5plus') return c >= 5;
        return true;
      })
      .filter((r) => (restrictedOnly ? isCurrentlyRestricted(r.participation_restricted_until) : true))
      .filter((r) => {
        if (!q) return true;
        const name = (r.display_name ?? '').toLowerCase();
        const email = (r.email ?? '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
  }, [rows, query, restrictedOnly, penaltyFilter, groupFilter, employmentFilter]);

  const doLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token ?? undefined;
    }
    return token ?? null;
  }

  const syncEdits = (nextRows: PeopleRow[]) => {
    const next: Record<string, EditState> = {};
    for (const r of nextRows) {
      next[r.user_id] = {
        invalidCallCount: String(Number(r.invalid_call_count ?? 0)),
        restrictedUntil: toDatetimeLocalValue(r.participation_restricted_until),
        note: r.participation_restriction_note ?? '',
        hireDate: r.hire_date ?? '',
        resignedAt: r.resigned_at ?? '',
        resignationNote: r.resignation_note ?? '',
        birthdayDate: r.birthday_date ?? '',
        birthdayCalendarType: r.birthday_calendar_type ?? 'solar',
        birthdayIsIntercalation: Boolean(r.birthday_is_intercalation),
      };
    }
    setEdits(next);
  };

  const loadRows = async () => {
    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/admin/people', {
      headers: { authorization: `Bearer ${token}` },
    });
    setLoading(false);

    if (!res.ok) {
      setErrorMsg(`인원 목록 조회 실패: ${await responseError(res, String(res.status))}`);
      return;
    }

    const json = (await res.json()) as { rows?: PeopleRow[] };
    const nextRows = sortPeopleRows(json.rows ?? []);
    setRows(nextRows);
    syncEdits(nextRows);
  };

  const createPerson = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!createForm.email.trim()) {
      setErrorMsg('아이디(이메일)를 입력해주세요.');
      return;
    }
    if (!createForm.password.trim()) {
      setErrorMsg('초기 비밀번호를 입력해주세요.');
      return;
    }
    if (!createForm.displayName.trim()) {
      setErrorMsg('이름을 입력해주세요.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }

    setBusyCreate(true);
    const res = await fetch('/api/admin/people', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: createForm.email.trim(),
        password: createForm.password.trim(),
        display_name: createForm.displayName.trim(),
        leader_group: createForm.leaderGroup || null,
        hire_date: createForm.hireDate || null,
        birthday_date: createForm.birthdayDate || null,
        birthday_calendar_type: createForm.birthdayCalendarType,
        birthday_is_intercalation: createForm.birthdayIsIntercalation,
      }),
    });
    setBusyCreate(false);

    if (!res.ok) {
      setErrorMsg(`인원 등록 실패: ${await responseError(res, String(res.status))}`);
      return;
    }

    const json = (await res.json()) as { row?: PeopleRow | null };
    if (json.row) {
      setRows((prev) => sortPeopleRows([...prev.filter((row) => row.user_id !== json.row!.user_id), json.row!]));
      syncEdits(sortPeopleRows([...rows.filter((row) => row.user_id !== json.row!.user_id), json.row]));
    } else {
      await loadRows();
    }
    setCreateForm(emptyCreateState);
    setSuccessMsg('신규 인원과 로그인 계정을 생성했습니다.');
  };

  const saveRow = async (userId: string) => {
    const edit = edits[userId];
    if (!edit) return;
    const targetRow = rows.find((item) => item.user_id === userId);

    setErrorMsg('');
    setSuccessMsg('');

    if (targetRow && isResigned(targetRow)) {
      setErrorMsg('퇴사자는 퇴사정보 저장 또는 복구만 사용할 수 있습니다.');
      return;
    }

    const count = Number(edit.invalidCallCount);
    if (!Number.isInteger(count) || count < 0) {
      setErrorMsg('무효콜 누적값은 0 이상의 정수여야 합니다.');
      return;
    }

    const restrictedDate = edit.restrictedUntil ? new Date(edit.restrictedUntil) : null;
    const restrictedUntilIso =
      restrictedDate && !Number.isNaN(restrictedDate.getTime()) ? restrictedDate.toISOString() : null;
    if (edit.restrictedUntil && !restrictedUntilIso) {
      setErrorMsg('참여 제한 종료 시각 형식이 올바르지 않습니다.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }

    setBusyUserId(userId);
    const res = await fetch('/api/admin/people', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        invalid_call_count: count,
        participation_restricted_until: restrictedUntilIso,
        participation_restriction_note: edit.note.trim() || null,
        hire_date: edit.hireDate || null,
        birthday_date: edit.birthdayDate || null,
        birthday_calendar_type: edit.birthdayCalendarType,
        birthday_is_intercalation: edit.birthdayIsIntercalation,
      }),
    });
    setBusyUserId(null);

    if (!res.ok) {
      setErrorMsg(`저장 실패: ${await responseError(res, String(res.status))}`);
      return;
    }

    const json = (await res.json()) as { row: PeopleRow };
    const row = json.row;
    const nextRows = sortPeopleRows(rows.map((x) => (x.user_id === row.user_id ? row : x)));
    setRows(nextRows);
    syncEdits(nextRows);
    setSuccessMsg('저장했습니다.');
  };

  const processEmployment = async (userId: string, action: 'resign' | 'restore') => {
    const row = rows.find((item) => item.user_id === userId);
    const edit = edits[userId];
    if (!row || !edit) return;

    setErrorMsg('');
    setSuccessMsg('');

    const resignedAt = edit.resignedAt || todayDateInputValue();
    const name = row.display_name || row.email || '선택한 인원';
    const alreadyResigned = isResigned(row);

    if (action === 'resign') {
      const ok = window.confirm(
        alreadyResigned
          ? `${name}님의 퇴사 정보를 저장할까요?\n로그인 차단 상태는 유지됩니다.`
          : `${name}님을 퇴사 처리할까요?\n로그인 계정도 비활성화됩니다.`,
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(`${name}님을 재직 상태로 복구할까요?\n로그인 차단도 해제됩니다.`);
      if (!ok) return;
    }

    const token = await getAccessToken();
    if (!token) {
      setErrorMsg('인증 토큰이 없습니다. 다시 로그인해주세요.');
      return;
    }

    setBusyUserId(userId);
    const res = await fetch('/api/admin/people', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(
        action === 'resign'
          ? {
              user_id: userId,
              action,
              resigned_at: resignedAt,
              resignation_note: edit.resignationNote.trim() || null,
            }
          : {
              user_id: userId,
              action,
            },
      ),
    });
    setBusyUserId(null);

    if (!res.ok) {
      setErrorMsg(`${action === 'resign' ? '퇴사 처리' : '복구'} 실패: ${await responseError(res, String(res.status))}`);
      return;
    }

    const json = (await res.json()) as { row: PeopleRow };
    const nextRows = sortPeopleRows(rows.map((x) => (x.user_id === json.row.user_id ? json.row : x)));
    setRows(nextRows);
    syncEdits(nextRows);
    setSuccessMsg(action === 'resign' ? '퇴사 처리했습니다.' : '재직 상태로 복구했습니다.');
  };

  useEffect(() => {
    (async () => {
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user?.id) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('display_name,role,is_admin')
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (pErr || !profile) {
        router.replace('/login');
        return;
      }

      const authProfile = profile as AuthProfile;
      const isAdmin = authProfile.role === 'admin' || Boolean(authProfile.is_admin);
      if (!isAdmin) {
        router.replace('/login');
        return;
      }

      setAdminName(authProfile.display_name ?? '관리자');
      await loadRows();
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking) {
    return (
      <main lang="ko-KR" style={{ padding: 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
        <h1 style={{ margin: 0 }}>인원 관리</h1>
        <p style={{ marginTop: 8, color: '#444' }}>권한 확인 중...</p>
      </main>
    );
  }

  return (
    <main lang="ko-KR" style={{ padding: 28, background: '#f4f6fb', minHeight: '100vh', color: '#111827' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <AdminHeader
          adminName={adminName}
          todayLabel={todayLabel}
          activePage="people"
          onGoDashboard={() => router.push('/admin')}
          onGoPeople={() => router.push('/admin/people')}
          onGoWiki={() => router.push('/wiki')}
          onGoHr={() => router.push('/hr/calendar')}
          onLogout={doLogout}
        />

        <div style={cardBox}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>신규 인원 등록</div>
          <div style={formGrid}>
            <label style={fieldWrap}>
              <span style={fieldLabel}>아이디(이메일)</span>
              <input
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="name@company.com"
                style={{ ...miniInput, height: 36 }}
              />
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>초기 비밀번호</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                  style={{ ...miniInput, height: 36, flex: 1 }}
                />
                <button
                  type="button"
                  style={{ ...miniBtn, height: 36 }}
                  onClick={() =>
                    setCreateForm((prev) => ({ ...prev, password: autoPasswordFromEmail(prev.email) }))
                  }
                >
                  자동
                </button>
              </div>
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>이름</span>
              <input
                value={createForm.displayName}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))}
                style={{ ...miniInput, height: 36 }}
              />
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>조</span>
              <select
                value={createForm.leaderGroup}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, leaderGroup: e.target.value as '' | '1' | '2' }))}
                style={{ ...miniInput, height: 36 }}
              >
                <option value="">미지정</option>
                <option value="1">1조</option>
                <option value="2">2조</option>
              </select>
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>입사일</span>
              <input
                type="date"
                value={createForm.hireDate}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, hireDate: e.target.value }))}
                style={{ ...miniInput, height: 36 }}
              />
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>생일</span>
              <input
                type="date"
                value={createForm.birthdayDate}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, birthdayDate: e.target.value }))}
                style={{ ...miniInput, height: 36 }}
              />
            </label>
            <label style={fieldWrap}>
              <span style={fieldLabel}>생일 기준</span>
              <select
                value={createForm.birthdayCalendarType}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, birthdayCalendarType: e.target.value as BirthdayCalendarType }))
                }
                style={{ ...miniInput, height: 36 }}
              >
                <option value="solar">양력</option>
                <option value="lunar">음력</option>
              </select>
            </label>
            <label style={{ ...checkWrap, alignSelf: 'end' }}>
              <input
                type="checkbox"
                checked={createForm.birthdayIsIntercalation}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, birthdayIsIntercalation: e.target.checked }))}
                disabled={createForm.birthdayCalendarType !== 'lunar'}
              />
              윤달
            </label>
            <button
              onClick={createPerson}
              style={{ ...rowBtn, height: 36, alignSelf: 'end' }}
              disabled={busyCreate}
            >
              {busyCreate ? '등록 중...' : '인원 등록'}
            </button>
          </div>
        </div>

        <div style={cardBox}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>패널티 운영 기준</div>
          <div style={{ marginTop: 8, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
            무효콜 누적 3회 이상: 1주 참여 제한
            <br />
            무효콜 누적 5회 이상: 1개월 참여 제한
          </div>
        </div>

        <div style={{ ...cardBox, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>인원 패널티 관리</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as 'all' | '1' | '2')}
                style={{ ...miniInput, width: 110, height: 36 }}
              >
                <option value="all">전체 조</option>
                <option value="1">1조</option>
                <option value="2">2조</option>
              </select>
              <select
                value={employmentFilter}
                onChange={(e) => setEmploymentFilter(e.target.value as 'active' | 'resigned' | 'all')}
                style={{ ...miniInput, width: 120, height: 36 }}
              >
                <option value="active">재직자</option>
                <option value="resigned">퇴사자</option>
                <option value="all">전체 상태</option>
              </select>
              <select
                value={penaltyFilter}
                onChange={(e) => setPenaltyFilter(e.target.value as 'all' | '3plus' | '5plus')}
                style={{ ...miniInput, width: 150, height: 36 }}
              >
                <option value="all">무효콜 전체</option>
                <option value="3plus">무효콜 3+</option>
                <option value="5plus">무효콜 5+</option>
              </select>
              <label style={checkWrap}>
                <input
                  type="checkbox"
                  checked={restrictedOnly}
                  onChange={(e) => setRestrictedOnly(e.target.checked)}
                />
                제한중만
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="이름/이메일 검색"
                style={{ ...miniInput, width: 220, height: 36 }}
              />
              <button onClick={loadRows} style={{ ...miniBtn, height: 36 }} disabled={loading}>
                {loading ? '새로고침 중...' : '새로고침'}
              </button>
            </div>
          </div>

          {errorMsg && <div style={errorBox}>{errorMsg}</div>}
          {successMsg && <div style={successBox}>{successMsg}</div>}

          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1920, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                  <th style={thCell}>이름</th>
                  <th style={thCell}>이메일</th>
                  <th style={thCell}>권한</th>
                  <th style={thCell}>재직 상태</th>
                  <th style={thCell}>조</th>
                  <th style={thCell}>입사일</th>
                  <th style={thCell}>퇴사일</th>
                  <th style={thCell}>퇴사 메모</th>
                  <th style={thCell}>생일</th>
                  <th style={thCell}>생일 기준</th>
                  <th style={thCell}>무효콜 누적</th>
                  <th style={thCell}>규정 제재</th>
                  <th style={thCell}>참여 제한 종료</th>
                  <th style={thCell}>사유</th>
                  <th style={thCell}>현재 상태</th>
                  <th style={thCell}>퇴사처리</th>
                  <th style={thCell}>저장</th>
                </tr>
              </thead>
              <tbody>
                {managedRows.map((r) => {
                  const edit = edits[r.user_id] ?? {
                    invalidCallCount: '0',
                    restrictedUntil: '',
                    note: '',
                    hireDate: '',
                    birthdayDate: '',
                    birthdayCalendarType: 'solar' as BirthdayCalendarType,
                    birthdayIsIntercalation: false,
                    resignedAt: '',
                    resignationNote: '',
                  };
                  const count = Number(edit.invalidCallCount || 0);
                  const resigned = isResigned(r);
                  const restrictedDate = edit.restrictedUntil ? new Date(edit.restrictedUntil) : null;
                  const restricted = Boolean(
                    restrictedDate &&
                      !Number.isNaN(restrictedDate.getTime()) &&
                      isCurrentlyRestricted(restrictedDate.toISOString()),
                  );

                  return (
                    <tr key={r.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdCell}>{r.display_name ?? '-'}</td>
                      <td style={tdCell}>{r.email ?? '-'}</td>
                      <td style={tdCell}>{r.role ?? '-'}</td>
                      <td style={tdCell}>
                        <span style={resigned ? badgeResigned : badgeNormal}>
                          {resigned ? '퇴사' : '재직'}
                        </span>
                      </td>
                      <td style={tdCell}>{r.leader_group ?? '-'}</td>
                      <td style={tdCell}>
                        <input
                          type="date"
                          value={edit.hireDate}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, hireDate: e.target.value },
                            }))
                          }
                          style={{ ...miniInput, width: 132 }}
                        />
                      </td>
                      <td style={tdCell}>
                        <input
                          type="date"
                          value={edit.resignedAt}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, resignedAt: e.target.value },
                            }))
                          }
                          style={{ ...miniInput, width: 132 }}
                        />
                      </td>
                      <td style={tdCell}>
                        <input
                          value={edit.resignationNote}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, resignationNote: e.target.value },
                            }))
                          }
                          placeholder="퇴사 메모"
                          style={{ ...miniInput, width: 180 }}
                        />
                      </td>
                      <td style={tdCell}>
                        <input
                          type="date"
                          value={edit.birthdayDate}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, birthdayDate: e.target.value },
                            }))
                          }
                          style={{ ...miniInput, width: 132 }}
                        />
                      </td>
                      <td style={tdCell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select
                            value={edit.birthdayCalendarType}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.user_id]: {
                                  ...edit,
                                  birthdayCalendarType: e.target.value as BirthdayCalendarType,
                                  birthdayIsIntercalation:
                                    e.target.value === 'lunar' ? edit.birthdayIsIntercalation : false,
                                },
                              }))
                            }
                            style={{ ...miniInput, width: 78 }}
                          >
                            <option value="solar">양력</option>
                            <option value="lunar">음력</option>
                          </select>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={edit.birthdayIsIntercalation}
                              disabled={edit.birthdayCalendarType !== 'lunar'}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [r.user_id]: { ...edit, birthdayIsIntercalation: e.target.checked },
                                }))
                              }
                            />
                            윤달
                          </label>
                        </div>
                      </td>
                      <td style={tdCell}>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={edit.invalidCallCount}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, invalidCallCount: e.target.value },
                            }))
                          }
                          style={{ ...miniInput, width: 88, textAlign: 'right' }}
                        />
                      </td>
                      <td style={tdCell}>
                        <b>{penaltyRuleLabel(Number.isFinite(count) ? count : 0)}</b>
                      </td>
                      <td style={tdCell}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="datetime-local"
                            value={edit.restrictedUntil}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.user_id]: { ...edit, restrictedUntil: e.target.value },
                              }))
                            }
                            style={{ ...miniInput, width: 176 }}
                          />
                          <button
                            type="button"
                            style={miniBtn}
                            onClick={() =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.user_id]: { ...edit, restrictedUntil: '' },
                              }))
                            }
                          >
                            해제
                          </button>
                        </div>
                      </td>
                      <td style={tdCell}>
                        <input
                          value={edit.note}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [r.user_id]: { ...edit, note: e.target.value },
                            }))
                          }
                          placeholder="메모(선택)"
                          style={{ ...miniInput, width: 220 }}
                        />
                      </td>
                      <td style={tdCell}>
                        <span style={restricted ? badgeRestricted : badgeNormal}>
                          {restricted ? '참여 제한 중' : '정상'}
                        </span>
                      </td>
                      <td style={tdCell}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => processEmployment(r.user_id, 'resign')}
                            style={dangerMiniBtn}
                            disabled={busyUserId === r.user_id}
                          >
                            {resigned ? '퇴사정보 저장' : '퇴사처리'}
                          </button>
                          {resigned && (
                            <button
                              type="button"
                              onClick={() => processEmployment(r.user_id, 'restore')}
                              style={miniBtn}
                              disabled={busyUserId === r.user_id}
                            >
                              복구
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={tdCell}>
                        <button
                          onClick={() => saveRow(r.user_id)}
                          style={rowBtn}
                          disabled={busyUserId === r.user_id || resigned}
                        >
                          {resigned ? '퇴사자' : busyUserId === r.user_id ? '저장 중...' : '저장'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {managedRows.length === 0 && (
                  <tr>
                    <td colSpan={17} style={{ textAlign: 'center', padding: 18, color: '#6b7280' }}>
                      표시할 인원이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

const cardBox: CSSProperties = {
  marginTop: 16,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
};

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  marginTop: 12,
  alignItems: 'start',
};

const fieldWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  minWidth: 0,
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: '#475569',
};

const errorBox: CSSProperties = {
  marginTop: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#9f1239',
  borderRadius: 10,
  padding: '8px 10px',
  fontWeight: 700,
};

const successBox: CSSProperties = {
  marginTop: 10,
  border: '1px solid #bbf7d0',
  background: '#f0fdf4',
  color: '#166534',
  borderRadius: 10,
  padding: '8px 10px',
  fontWeight: 700,
};

const checkWrap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '0 10px',
  height: 36,
  fontSize: 13,
  fontWeight: 700,
  color: '#374151',
  background: '#fff',
};

const thCell: CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  fontWeight: 900,
  fontSize: 13,
  color: '#374151',
  whiteSpace: 'nowrap',
};

const tdCell: CSSProperties = {
  padding: '10px 8px',
  fontSize: 13,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

const badgeBase: CSSProperties = {
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 12,
};

const badgeRestricted: CSSProperties = {
  ...badgeBase,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#9f1239',
};

const badgeNormal: CSSProperties = {
  ...badgeBase,
  border: '1px solid #c7f0d2',
  background: '#ecfdf3',
  color: '#166534',
};

const badgeResigned: CSSProperties = {
  ...badgeBase,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#475569',
};
