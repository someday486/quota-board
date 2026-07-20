import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { wikiCategories, wikiPages, type WikiPage } from '@/content/wiki';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ActorProfile = {
  role: string | null;
  is_admin: boolean | null;
};

const LEADER_RULE_PAGE_IDS = new Set(['commission-rules', 'regional-registration-notes']);

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

function isLeaderVisiblePage(page: WikiPage) {
  return (
    page.categoryId === 'scripts' ||
    page.categoryId === 'services' ||
    LEADER_RULE_PAGE_IDS.has(page.id)
  );
}

function filterRelatedPages(pages: WikiPage[]) {
  const visiblePageIds = new Set(pages.map((page) => page.id));
  return pages.map((page) => ({
    ...page,
    relatedPageIds: page.relatedPageIds?.filter((id) => visiblePageIds.has(id)),
  }));
}

export async function GET(req: NextRequest) {
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

    const sbAdmin = createClient(supabaseUrl, supabaseService, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: profile, error: profileErr } = await sbAdmin
      .from('profiles')
      .select('role,is_admin')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    const actor = profile as ActorProfile;
    const isAdmin = actor.role === 'admin' || Boolean(actor.is_admin);
    const isLeader = !actor.role || actor.role === 'leader';

    if (!isAdmin && !isLeader) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const visiblePages = filterRelatedPages(
      isAdmin ? wikiPages : wikiPages.filter(isLeaderVisiblePage),
    );
    const visibleCategoryIds = new Set(visiblePages.map((page) => page.categoryId));
    const visibleCategories = wikiCategories.filter((category) => visibleCategoryIds.has(category.id));

    return NextResponse.json(
      {
        accessScope: isAdmin ? 'full' : 'leader',
        categories: visibleCategories,
        pages: visiblePages,
      },
      {
        headers: { 'cache-control': 'no-store' },
      },
    );
  } catch (e: unknown) {
    console.error('[wiki] failed:', e);
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
