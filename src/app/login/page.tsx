'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0 && !loading;
  }, [email, password, loading]);

  // 이미 로그인되어 있으면 바로 역할 기반 이동(UX)
  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (ignore) return;

      const user = data.session?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (profile?.role === 'admin') router.replace('/admin');
      else router.replace('/leader');
    })();

    return () => {
      ignore = true;
    };
  }, [router]);

  const handleLogin = async () => {
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const userId = data.user.id;

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (profileErr) {
        setError('권한 정보를 불러오지 못했습니다. 관리자에게 문의하세요.');
        return;
      }

      if (profile?.role === 'admin') router.push('/admin');
      else router.push('/leader');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <main className={styles.page}>
      <div className={styles.bg} />

      <section className={styles.card} aria-label="로그인 카드">
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <div className={styles.mark} aria-hidden />
            <div>
              <div className={styles.brand}>QuotaBorad</div>
              <div className={styles.subtitle}>관리자 / 팀장 전용</div>
            </div>
          </div>

          <h1 className={styles.title}>로그인</h1>
          <p className={styles.desc}>이메일과 비밀번호를 입력해 주세요.</p>
        </header>

        <div className={styles.form}>
          <label className={styles.label}>
            이메일
            <input
              className={styles.input}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="email"
              inputMode="email"
            />
          </label>

          <label className={styles.label}>
            비밀번호
            <input
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className={styles.errorBox} role="alert">
              {error}
            </div>
          )}

          <button
            className={styles.button}
            onClick={handleLogin}
            disabled={!canSubmit}
          >
            {loading ? '로그인 중…' : '로그인'}
          </button>

          <div className={styles.hint}>
            Enter로도 로그인할 수 있습니다.
          </div>
        </div>

        <footer className={styles.footer}>
          <span className={styles.footerText}>
            문제가 지속되면 관리자에게 계정 상태를 확인해 달라고 요청하세요.
          </span>
        </footer>
      </section>
    </main>
  );
}
