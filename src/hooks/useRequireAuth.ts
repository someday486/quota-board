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

type AuthProfile = {
  role?: string | null;
  is_admin?: boolean | null;
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
        .select('role,is_admin')
        .eq('user_id', uid)
        .single();

      if (cancelled) return;

      const profileRow = (profile as AuthProfile | null) ?? null;
      const roleValue = profileRow?.role ?? null;
      const effectiveRole =
        roleValue === 'admin' || Boolean(profileRow?.is_admin)
          ? 'admin'
          : roleValue === 'leader'
            ? 'leader'
            : null;
      setRole(effectiveRole);

      if (profileErr || !effectiveRole) {
        router.replace('/login');
        return;
      }

      if (effectiveRole !== options.requiredRole) {
        if (effectiveRole === 'admin') router.replace('/admin');
        else if (effectiveRole === 'leader') router.replace('/leader');
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
