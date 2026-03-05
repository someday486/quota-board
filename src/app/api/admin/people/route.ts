import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type ProfilePenaltyRow = {
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

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function parseIsoOrNull(input: unknown) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input !== 'string') return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function requireAdmin(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 }) };
  }

  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbUser = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authErr } = await sbUser.auth.getUser(token);
  if (authErr || !auth.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const uid = auth.user.id;
  const sbAdmin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: me, error: meErr } = await sbAdmin
    .from('profiles')
    .select('role,is_admin')
    .eq('user_id', uid)
    .single();

  if (meErr) {
    return { error: NextResponse.json({ error: 'Failed to read profile' }, { status: 500 }) };
  }

  const meRow = me as { role: string | null; is_admin: boolean | null } | null;
  const isAdmin = meRow?.role === 'admin' || Boolean(meRow?.is_admin);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { sbAdmin };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const { data, error } = await auth.sbAdmin
      .from('profiles')
      .select(
        'user_id,display_name,email,role,is_admin,leader_group,invalid_call_count,participation_restricted_until,participation_restriction_note',
      )
      .order('display_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: ((data ?? []) as ProfilePenaltyRow[]) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(body, 'invalid_call_count')) {
      const n = Number(body.invalid_call_count);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return NextResponse.json({ error: 'invalid_call_count must be a non-negative integer' }, { status: 400 });
      }
      payload.invalid_call_count = n;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'participation_restricted_until')) {
      const iso = parseIsoOrNull(body.participation_restricted_until);
      if (body.participation_restricted_until && !iso) {
        return NextResponse.json({ error: 'participation_restricted_until must be a valid datetime' }, { status: 400 });
      }
      payload.participation_restricted_until = iso;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'participation_restriction_note')) {
      if (body.participation_restriction_note === null || body.participation_restriction_note === '') {
        payload.participation_restriction_note = null;
      } else if (typeof body.participation_restriction_note === 'string') {
        payload.participation_restriction_note = body.participation_restriction_note.trim();
      } else {
        return NextResponse.json({ error: 'participation_restriction_note must be a string or null' }, { status: 400 });
      }
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data, error } = await auth.sbAdmin
      .from('profiles')
      .update(payload)
      .eq('user_id', userId)
      .select(
        'user_id,display_name,email,role,is_admin,leader_group,invalid_call_count,participation_restricted_until,participation_restriction_note',
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ row: data as ProfilePenaltyRow });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
