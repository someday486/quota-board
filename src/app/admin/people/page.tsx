'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminHeader from '../_components/AdminHeader';
import { miniBtn, miniInput, rowBtn } from '../styles';

type PeopleRow = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  is_admin: boolean | null;
  leader_group: number | null;
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

function suggestedPenaltyLabel(count: number) {
  if (count >= 5) return '규정: 1개월 제한 대상';
  if (count >= 3) return '규정: 1주 제한 대상';
  return '제한 없음';
}

export default function AdminPeoplePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [adminName, setAdminName] = useState('관리자');
  const [rows, setRows] = useState<PeopleRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [restrictedOnly, setRestrictedOnly] = useState(false);
  const [penaltyFilter, setPenaltyFilter] = useState<'all' | '3plus' | '5plus'>('all');
  const [groupFilter, setGroupFilter] = useState<'all' | '1' | '2'>('all');

  const [errorMsg, setErrorMsg] = useState('');

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
  }, [rows, query, restrictedOnly, penaltyFilter, groupFilter]);

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
      const text = await res.text().catch(() => '');
      setErrorMsg(`인원 목록 조회 실패 (${res.status}) ${text}`);
      return;
    }

    const json = (await res.json()) as { rows?: PeopleRow[] };
    const nextRows = json.rows ?? [];
    setRows(nextRows);
    syncEdits(nextRows);
  };

  const saveRow = async (userId: string) => {
    const edit = edits[userId];
    if (!edit) return;

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
      }),
    });
    setBusyUserId(null);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setErrorMsg(`저장 실패 (${res.status}) ${text}`);
      return;
    }

    const json = (await res.json()) as { row: PeopleRow };
    const row = json.row;
    setRows((prev) => prev.map((x) => (x.user_id === row.user_id ? row : x)));
    setEdits((prev) => ({
      ...prev,
      [row.user_id]: {
        invalidCallCount: String(Number(row.invalid_call_count ?? 0)),
        restrictedUntil: toDatetimeLocalValue(row.participation_restricted_until),
        note: row.participation_restriction_note ?? '',
      },
    }));
    setErrorMsg('');
  };

  const setQuickRestriction = (userId: string, days: number) => {
    const base = new Date();
    base.setDate(base.getDate() + days);
    base.setHours(23, 59, 0, 0);
    const value = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;

    setEdits((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] ?? { invalidCallCount: '0', restrictedUntil: '', note: '' }),
        restrictedUntil: value,
      },
    }));
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
      <div style={{ maxWidth: 1250, margin: '0 auto' }}>
        <AdminHeader
          adminName={adminName}
          todayLabel={todayLabel}
          activePage="people"
          onGoDashboard={() => router.push('/admin')}
          onGoPeople={() => router.push('/admin/people')}
          onGoHr={() => router.push('/hr/calendar')}
          onLogout={doLogout}
        />

        <div style={cardBox}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>패널티 운영 기준</div>
          <div style={{ marginTop: 8, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
            무효콜 누적 3회 이상: 1주 참여 제한
            <br />
            무효콜 누적 5회 이상: 1개월 참여 제한
            <br />
            제한 종료 시각은 수동 입력값이 최종 적용됩니다.
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
                value={penaltyFilter}
                onChange={(e) => setPenaltyFilter(e.target.value as 'all' | '3plus' | '5plus')}
                style={{ ...miniInput, width: 150, height: 36 }}
              >
                <option value="all">무효콜 전체</option>
                <option value="3plus">무효콜 3회+</option>
                <option value="5plus">무효콜 5회+</option>
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

          {errorMsg && (
            <div style={errorBox}>
              {errorMsg}
            </div>
          )}

          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1160, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                  <th style={thCell}>이름</th>
                  <th style={thCell}>이메일</th>
                  <th style={thCell}>권한</th>
                  <th style={thCell}>조</th>
                  <th style={thCell}>무효콜 누적</th>
                  <th style={thCell}>규정 제재</th>
                  <th style={thCell}>참여 제한 종료</th>
                  <th style={thCell}>사유</th>
                  <th style={thCell}>현재 상태</th>
                  <th style={thCell}>저장</th>
                </tr>
              </thead>
              <tbody>
                {managedRows.map((r) => {
                  const edit = edits[r.user_id] ?? { invalidCallCount: '0', restrictedUntil: '', note: '' };
                  const count = Number(edit.invalidCallCount || 0);
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
                      <td style={tdCell}>{r.leader_group ?? '-'}</td>
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
                        <b>{suggestedPenaltyLabel(Number.isFinite(count) ? count : 0)}</b>
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
                          <button type="button" style={miniBtn} onClick={() => setQuickRestriction(r.user_id, 7)}>
                            +1주
                          </button>
                          <button type="button" style={miniBtn} onClick={() => setQuickRestriction(r.user_id, 30)}>
                            +1개월
                          </button>
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
                        <button onClick={() => saveRow(r.user_id)} style={rowBtn} disabled={busyUserId === r.user_id}>
                          {busyUserId === r.user_id ? '저장 중...' : '저장'}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {managedRows.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: 18, color: '#6b7280' }}>
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

const errorBox: CSSProperties = {
  marginTop: 10,
  border: '1px solid #fecaca',
  background: '#fff1f2',
  color: '#9f1239',
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
