'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminHeader from '../_components/AdminHeader';

type ArchiveCategory = 'audio' | 'video' | 'document' | 'folder' | 'other';
type CategoryFilter = ArchiveCategory | 'all';
type PeriodFilter = 'all' | 'today' | '7d' | '30d' | '90d';
type SortKey = 'modifiedDesc' | 'nameAsc' | 'sizeDesc';

type ArchiveFile = {
  id: string;
  name: string;
  mimeType: string;
  category: ArchiveCategory;
  webViewLink: string;
  webContentLink: string;
  createdTime: string;
  modifiedTime: string;
  size: number | null;
  fileExtension: string;
  iconLink: string;
};

type ArchiveResponse = {
  ok?: boolean;
  folderUrl?: string;
  fetchedAt?: string;
  truncated?: boolean;
  files?: ArchiveFile[];
  error?: string;
};

type ProfileRow = {
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

const categoryLabels: Record<CategoryFilter, string> = {
  all: '전체',
  audio: '오디오',
  video: '영상',
  document: '문서',
  folder: '폴더',
  other: '기타',
};

const periodLabels: Record<PeriodFilter, string> = {
  all: '전체 기간',
  today: '오늘 수정',
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
};

function todayLabel() {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date());
}

function formatDateTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function isWithinPeriod(value: string, period: PeriodFilter) {
  if (period === 'all') return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  if (period === 'today') {
    return date.toDateString() === now.toDateString();
  }

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return now.getTime() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function sortFiles(files: ArchiveFile[], sortKey: SortKey) {
  return [...files].sort((a, b) => {
    if (sortKey === 'nameAsc') return a.name.localeCompare(b.name, 'ko-KR');
    if (sortKey === 'sizeDesc') return (b.size ?? -1) - (a.size ?? -1);
    return new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime();
  });
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

export default function AdminRecordingArchivePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState('관리자');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [folderUrl, setFolderUrl] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('modifiedDesc');

  const loadArchive = useCallback(async () => {
    setErrorMsg('');
    setLoading(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');

      const response = await fetch('/api/admin/recording-archive', {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = (await response.json().catch(() => ({}))) as ArchiveResponse;
      if (!response.ok || json.error) {
        throw new Error(json.error || '녹취 아카이브를 불러오지 못했습니다.');
      }

      setFiles(Array.isArray(json.files) ? json.files : []);
      setFolderUrl(json.folderUrl ?? '');
      setFetchedAt(json.fetchedAt ?? '');
      setTruncated(Boolean(json.truncated));
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : '녹취 아카이브를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (userErr || !userRes.user?.id) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('display_name,role,is_admin')
        .eq('user_id', userRes.user.id)
        .maybeSingle();

      if (!alive) return;
      if (profileErr || !profile) {
        router.replace('/login');
        return;
      }

      const p = profile as ProfileRow;
      if (p.role !== 'admin' && !p.is_admin) {
        router.replace('/login');
        return;
      }

      setAdminName(p.display_name ?? '관리자');
      setChecking(false);
      await loadArchive();
    };

    void boot();

    return () => {
      alive = false;
    };
  }, [loadArchive, router]);

  const counts = useMemo(() => {
    const next: Record<CategoryFilter, number> = {
      all: files.length,
      audio: 0,
      video: 0,
      document: 0,
      folder: 0,
      other: 0,
    };
    for (const file of files) {
      next[file.category] += 1;
    }
    return next;
  }, [files]);

  const filteredFiles = useMemo(() => {
    const q = normalize(query);
    const matched = files.filter((file) => {
      const categoryMatches = categoryFilter === 'all' || file.category === categoryFilter;
      const periodMatches = isWithinPeriod(file.modifiedTime || file.createdTime, periodFilter);
      const queryMatches =
        !q ||
        normalize(`${file.name} ${file.fileExtension} ${file.mimeType}`).includes(q);
      return categoryMatches && periodMatches && queryMatches;
    });
    return sortFiles(matched, sortKey);
  }, [categoryFilter, files, periodFilter, query, sortKey]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (checking) {
    return (
      <main style={pageStyle}>
        <section style={panelStyle}>
          <b>로그인/권한 확인 중...</b>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <AdminHeader
          adminName={adminName}
          todayLabel={todayLabel()}
          activePage="recordings"
          onGoDashboard={() => router.push('/admin')}
          onGoPeople={() => router.push('/admin/people')}
          onGoWiki={() => router.push('/wiki')}
          onGoRecordings={() => router.push('/admin/recordings')}
          onGoHr={() => router.push('/hr/calendar')}
          onLogout={onLogout}
        />

        <section style={heroStyle}>
          <div style={{ minWidth: 0 }}>
            <h1 style={titleStyle}>녹취 아카이브</h1>
            <p style={descStyle}>쿼터보드 지원 업체 녹취 파일 보관함</p>
          </div>
          <div style={heroActionsStyle}>
            <button type="button" onClick={loadArchive} disabled={loading} style={primaryButtonStyle}>
              {loading ? '불러오는 중...' : '새로고침'}
            </button>
            {folderUrl ? (
              <a href={folderUrl} target="_blank" rel="noreferrer" style={secondaryLinkStyle}>
                원본 폴더
              </a>
            ) : null}
          </div>
        </section>

        {errorMsg ? <div style={errorBoxStyle}>{errorMsg}</div> : null}
        {truncated ? <div style={noticeBoxStyle}>파일이 많아 일부만 표시되었습니다. 검색 조건을 좁혀 확인해 주세요.</div> : null}

        <section style={statsGridStyle}>
          <Stat label="전체" value={counts.all} />
          <Stat label="오디오" value={counts.audio} />
          <Stat label="영상" value={counts.video} />
          <Stat label="문서" value={counts.document} />
        </section>

        <section style={filterPanelStyle} aria-label="녹취 파일 검색">
          <label style={fieldStyle}>
            <span style={labelStyle}>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체명, 담당자, 날짜, 확장자"
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>유형</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)} style={inputStyle}>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>기간</span>
            <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)} style={inputStyle}>
              {Object.entries(periodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>정렬</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} style={inputStyle}>
              <option value="modifiedDesc">최근 수정순</option>
              <option value="nameAsc">이름순</option>
              <option value="sizeDesc">용량 큰 순</option>
            </select>
          </label>
        </section>

        <section style={listPanelStyle}>
          <div style={listHeaderStyle}>
            <b>파일 {filteredFiles.length}건</b>
            <span>{fetchedAt ? `동기화 ${formatDateTime(fetchedAt)}` : ''}</span>
          </div>

          {loading ? (
            <div style={emptyStyle}>파일 목록을 불러오는 중입니다.</div>
          ) : filteredFiles.length === 0 ? (
            <div style={emptyStyle}>조건에 맞는 파일이 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>파일명</th>
                    <th style={thStyle}>유형</th>
                    <th style={thStyle}>수정일</th>
                    <th style={thStyle}>크기</th>
                    <th style={thStyle}>열람</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr key={file.id}>
                      <td style={tdStyle}>
                        <div style={fileNameStyle}>
                          <span style={fileMarkerStyle}>{categoryLabels[file.category].slice(0, 1)}</span>
                          <span>{file.name}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={badgeStyle}>{categoryLabels[file.category]}</span>
                      </td>
                      <td style={tdStyle}>{formatDateTime(file.modifiedTime || file.createdTime)}</td>
                      <td style={tdStyle}>{formatBytes(file.size)}</td>
                      <td style={tdStyle}>
                        <div style={rowActionsStyle}>
                          {file.webViewLink ? (
                            <a href={file.webViewLink} target="_blank" rel="noreferrer" style={smallLinkStyle}>
                              열기
                            </a>
                          ) : null}
                          {file.webContentLink && file.category !== 'folder' ? (
                            <a href={file.webContentLink} target="_blank" rel="noreferrer" style={smallLinkStyle}>
                              다운로드
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyle}>
      <span>{value}</span>
      <p>{label}</p>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#f4f6fb',
  padding: 18,
  color: '#111827',
};

const shellStyle: CSSProperties = {
  maxWidth: 1280,
  margin: '0 auto',
};

const panelStyle: CSSProperties = {
  maxWidth: 420,
  margin: '80px auto',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#ffffff',
  padding: 18,
  textAlign: 'center',
};

const heroStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 16,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#ffffff',
  padding: 18,
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 900,
};

const descStyle: CSSProperties = {
  margin: '6px 0 0',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 800,
};

const heroActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 40,
  border: '1px solid #111827',
  borderRadius: 10,
  background: '#111827',
  color: '#ffffff',
  padding: '0 14px',
  fontWeight: 900,
  cursor: 'pointer',
};

const secondaryLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 40,
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#ffffff',
  color: '#111827',
  padding: '0 14px',
  fontSize: 14,
  fontWeight: 900,
  textDecoration: 'none',
};

const errorBoxStyle: CSSProperties = {
  marginTop: 12,
  border: '1px solid #fecaca',
  borderRadius: 12,
  background: '#fff1f2',
  color: '#991b1b',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 800,
};

const noticeBoxStyle: CSSProperties = {
  marginTop: 12,
  border: '1px solid #fed7aa',
  borderRadius: 12,
  background: '#fff7ed',
  color: '#9a3412',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 800,
};

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 10,
  marginTop: 12,
};

const statStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#ffffff',
  padding: '14px 16px',
};

const filterPanelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  marginTop: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#ffffff',
  padding: 14,
};

const fieldStyle: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 6,
};

const labelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 12,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  height: 40,
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '0 12px',
  background: '#ffffff',
  color: '#111827',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 800,
};

const listPanelStyle: CSSProperties = {
  marginTop: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  background: '#ffffff',
  overflow: 'hidden',
  boxShadow: '0 10px 30px rgba(17, 24, 39, 0.05)',
};

const listHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  padding: '14px 16px',
  borderBottom: '1px solid #eef2f7',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 800,
};

const tableStyle: CSSProperties = {
  width: '100%',
  minWidth: 760,
  borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#111827',
  fontSize: 12,
  fontWeight: 900,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid #eef2f7',
  color: '#334155',
  fontSize: 13,
  fontWeight: 750,
  verticalAlign: 'middle',
};

const fileNameStyle: CSSProperties = {
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: '#111827',
  fontWeight: 900,
};

const fileMarkerStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#334155',
  fontSize: 12,
  fontWeight: 950,
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 24,
  border: '1px solid #dbe3ee',
  borderRadius: 999,
  padding: '0 9px',
  background: '#f8fafc',
  color: '#334155',
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const rowActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const smallLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 30,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '0 10px',
  color: '#111827',
  background: '#ffffff',
  fontSize: 12,
  fontWeight: 900,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const emptyStyle: CSSProperties = {
  padding: 28,
  color: '#64748b',
  fontSize: 14,
  fontWeight: 800,
  textAlign: 'center',
};
