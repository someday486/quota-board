'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type RequireAuthOptions = {
  requiredRole?: 'admin' | 'leader';
};

type AuthState = {
  checking: boolean;
  role: string | null;
  userId: string | null;
};

export function useRequireAuth(options: RequireAuthOptions = {}): AuthState {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data, error } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !data?.user) {
        router.replace('/login');
        return;
      }

      const uid = data.user.id;
      setUserId(uid);

      if (!options.requiredRole) {
        setChecking(false);
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', uid)
        .single();

      if (cancelled) return;

      const roleValue = (profile as { role?: string } | null)?.role ?? null;
      setRole(roleValue);

      if (profileErr || !roleValue) {
        router.replace('/login');
        return;
      }

      if (roleValue !== options.requiredRole) {
        if (roleValue === 'admin') router.replace('/admin');
        else if (roleValue === 'leader') router.replace('/leader');
        else router.replace('/login');
        return;
      }

      setChecking(false);
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [options.requiredRole, router]);

  return { checking, role, userId };
}
