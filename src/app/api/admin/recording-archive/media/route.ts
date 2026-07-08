import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

export const runtime = 'nodejs';

type ActorProfile = {
  user_id: string;
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

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
  if (typeof e === 'object' && e !== null) {
    const withResponse = e as {
      response?: { data?: { error?: { message?: string } } | string };
      message?: string;
    };
    const data = withResponse.response?.data;
    if (typeof data === 'string') return data;
    const apiMessage = data?.error?.message;
    if (apiMessage) return apiMessage;
    if (withResponse.message) return withResponse.message;
  }
  return e instanceof Error ? e.message : 'unknown error';
}

function buildDriveAuth() {
  const clientEmail = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) return null;

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

async function requireAdmin(req: NextRequest) {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabaseService = env('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars' }, { status: 500 }) };
  }

  const token = getBearerToken(req);
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const sbUser = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authErr } = await sbUser.auth.getUser(token);
  if (authErr || !authData.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const sbAdmin = createClient(supabaseUrl, supabaseService, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: actor, error: actorErr } = await sbAdmin
    .from('profiles')
    .select('user_id,display_name,role,is_admin')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (actorErr || !actor) {
    return { error: NextResponse.json({ error: 'Failed to load actor profile' }, { status: 500 }) };
  }

  const actorProfile = actor as ActorProfile;
  const isAdmin = actorProfile.role === 'admin' || Boolean(actorProfile.is_admin);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { actor: actorProfile };
}

function isPlayableMimeType(mimeType: string) {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if ('error' in authResult) return authResult.error;

    const auth = buildDriveAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Missing Google service account env vars' }, { status: 500 });
    }

    const fileId = req.nextUrl.searchParams.get('fileId')?.trim();
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const drive = google.drive({ version: 'v3', auth });
    const metadataResponse = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: 'id,name,mimeType,size',
    });
    const metadata = metadataResponse.data;
    const mimeType = String(metadata.mimeType ?? '');
    const fileName = String(metadata.name ?? 'recording');

    if (!isPlayableMimeType(mimeType)) {
      return NextResponse.json({ error: 'This file cannot be played in the archive.' }, { status: 400 });
    }

    const mediaResponse = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    const data = mediaResponse.data as ArrayBuffer | Buffer;
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': String(body.length),
        'Content-Type': mimeType || 'application/octet-stream',
      },
    });
  } catch (e: unknown) {
    const message = errorMessage(e);
    console.error('[recording-archive-media] failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
