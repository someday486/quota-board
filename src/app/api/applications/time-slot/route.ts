import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type ActorProfile = {
  user_id: string;
  role: string | null;
  is_admin: boolean | null;
};

type ApplicationOwnerRow = {
  user_id: string | null;
};

type MeetingTimeSlot = 'am' | 'pm';

function env(name: string) {
  const raw = process.env[name];
  if (!raw) return '';
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getBearerToken(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/.exec(authz);
  return m?.[1] ?? null;
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'unknown error';
}

function normalizeTimeSlot(value: unknown): MeetingTimeSlot | null {
  if (value === 'am' || value === 'pm') return value;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const supabaseService = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnon || !supabaseService) {
      return NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 });
    }

    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sbUser = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authErr } = await sbUser.auth.getUser(token);
    if (authErr || !authData.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      applicationId?: unknown;
      timeSlot?: unknown;
    } | null;
    const applicationId = String(body?.applicationId ?? '').trim();
    const timeSlot = normalizeTimeSlot(body?.timeSlot);

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
    }
    if (!timeSlot) {
      return NextResponse.json({ error: 'timeSlot must be am or pm' }, { status: 400 });
    }

    const sbAdmin = createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: profile, error: profileErr } = await sbAdmin
      .from('profiles')
      .select('user_id,role,is_admin')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    const actor = profile as ActorProfile;
    const isAdmin = actor.role === 'admin' || Boolean(actor.is_admin);
    const { data: application, error: applicationErr } = await sbAdmin
      .from('applications_live')
      .select('user_id')
      .eq('id', applicationId)
      .maybeSingle();

    if (applicationErr) {
      return NextResponse.json({ error: applicationErr.message }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const owner = application as ApplicationOwnerRow;
    if (!isAdmin && owner.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error: updateErr } = await sbAdmin
      .from('applications_live')
      .update({ meeting_time_slot: timeSlot })
      .eq('id', applicationId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ result: true });
  } catch (e: unknown) {
    console.error('[applications/time-slot] failed:', e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
