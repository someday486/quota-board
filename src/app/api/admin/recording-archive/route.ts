import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { drive_v3, google } from 'googleapis';

export const runtime = 'nodejs';

type ActorProfile = {
  user_id: string;
  display_name: string | null;
  role: string | null;
  is_admin: boolean | null;
};

type DriveFile = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  size?: string | null;
  fileExtension?: string | null;
  iconLink?: string | null;
  parents?: string[] | null;
};

type ArchiveDriveFile = DriveFile & {
  path: string;
  parentPath: string;
  depth: number;
};

type FolderQueueItem = {
  id: string;
  path: string;
  depth: number;
};

const DEFAULT_RECORDING_ARCHIVE_FOLDER_ID =
  '1I2bsW3-c5BqKO8pKJIUa0ZAJJ64rswWmOfQw1AyBgtQeHu1QrR_Cz0YYUTk0KcvTewTRnjL-';
const RECORDING_ARCHIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DEFAULT_RECORDING_ARCHIVE_FOLDER_ID}`;
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const MAX_DRIVE_FOLDER_DEPTH = 8;
const MAX_DRIVE_FOLDER_COUNT = 250;
const MAX_DRIVE_ITEM_COUNT = 5000;
const MAX_PAGES_PER_FOLDER = 10;
const MAX_DRIVE_FOLDER_CONCURRENCY = 6;
const MAX_DRIVE_INDEX_PAGES = 50;

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
      response?: { data?: { error?: { message?: string } } };
      message?: string;
    };
    const apiMessage = withResponse.response?.data?.error?.message;
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

function classifyFile(mimeType: string, extension: string) {
  const ext = extension.toLowerCase();
  if (mimeType === FOLDER_MIME_TYPE) return 'folder';
  if (mimeType.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'aac', 'wma', 'flac', 'ogg'].includes(ext)) return 'audio';
  if (mimeType.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (
    mimeType.startsWith('application/vnd.google-apps') ||
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)
  ) {
    return 'document';
  }
  return 'other';
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

async function listFolderChildren(drive: drive_v3.Drive, folderId: string) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const response = await drive.files.list({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      pageSize: 1000,
      pageToken,
      orderBy: 'folder,name,modifiedTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields:
        'nextPageToken, files(id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,fileExtension,iconLink,parents)',
    });

    files.push(...((response.data.files as DriveFile[] | undefined) ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
    pageCount += 1;
  } while (pageToken && pageCount < MAX_PAGES_PER_FOLDER);

  return {
    files,
    truncated: Boolean(pageToken),
  };
}

async function listAccessibleDriveFiles(drive: drive_v3.Drive) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const response = await drive.files.list({
      q: 'trashed = false',
      pageSize: 1000,
      pageToken,
      orderBy: 'folder,name,modifiedTime desc',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields:
        'nextPageToken, files(id,name,mimeType,webViewLink,webContentLink,createdTime,modifiedTime,size,fileExtension,iconLink,parents)',
    });

    files.push(...((response.data.files as DriveFile[] | undefined) ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
    pageCount += 1;
  } while (pageToken && pageCount < MAX_DRIVE_INDEX_PAGES);

  return {
    files,
    truncated: Boolean(pageToken),
  };
}

async function collectArchiveFilesFromIndex(drive: drive_v3.Drive, rootFolderId: string) {
  const index = await listAccessibleDriveFiles(drive);
  const childrenByParent = new Map<string, DriveFile[]>();

  for (const file of index.files) {
    for (const parentId of file.parents ?? []) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(file);
      childrenByParent.set(parentId, siblings);
    }
  }

  const folders: FolderQueueItem[] = [{ id: rootFolderId, path: '', depth: 0 }];
  const files: ArchiveDriveFile[] = [];
  let visitedFolders = 0;
  let truncated = index.truncated;

  while (folders.length > 0) {
    const current = folders.shift();
    if (!current) break;
    visitedFolders += 1;

    const children = childrenByParent.get(current.id) ?? [];
    children.sort((a, b) => {
      const folderOrder = Number(b.mimeType === FOLDER_MIME_TYPE) - Number(a.mimeType === FOLDER_MIME_TYPE);
      if (folderOrder !== 0) return folderOrder;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko-KR');
    });

    for (const child of children) {
      const id = String(child.id ?? '');
      const name = String(child.name ?? '');
      if (!id || !name) continue;

      const path = current.path ? `${current.path} / ${name}` : name;
      files.push({
        ...child,
        path,
        parentPath: current.path,
        depth: current.depth + 1,
      });

      if (files.length >= MAX_DRIVE_ITEM_COUNT) {
        truncated = true;
        return { files, truncated, visitedFolders };
      }

      if (child.mimeType === FOLDER_MIME_TYPE) {
        folders.push({ id, path, depth: current.depth + 1 });
      }
    }
  }

  return { files, truncated, visitedFolders };
}

async function collectArchiveFilesByTraversal(drive: drive_v3.Drive, rootFolderId: string) {
  const folders: FolderQueueItem[] = [{ id: rootFolderId, path: '', depth: 0 }];
  const files: ArchiveDriveFile[] = [];
  let visitedFolders = 0;
  let truncated = false;

  while (folders.length > 0) {
    if (visitedFolders >= MAX_DRIVE_FOLDER_COUNT) {
      truncated = true;
      break;
    }

    const batchSize = Math.min(
      MAX_DRIVE_FOLDER_CONCURRENCY,
      MAX_DRIVE_FOLDER_COUNT - visitedFolders,
      folders.length,
    );
    const batch = folders.splice(0, batchSize);
    visitedFolders += batch.length;

    const batchResults = await Promise.all(
      batch.map(async (current) => ({
        current,
        children: await listFolderChildren(drive, current.id),
      })),
    );

    for (const { current, children } of batchResults) {
      if (children.truncated) truncated = true;

      for (const child of children.files) {
        const id = String(child.id ?? '');
        const name = String(child.name ?? '');
        if (!id || !name) continue;

        const path = current.path ? `${current.path} / ${name}` : name;
        const item: ArchiveDriveFile = {
          ...child,
          path,
          parentPath: current.path,
          depth: current.depth + 1,
        };
        files.push(item);

        if (files.length >= MAX_DRIVE_ITEM_COUNT) {
          truncated = true;
          return { files, truncated, visitedFolders };
        }

        if (child.mimeType === FOLDER_MIME_TYPE) {
          if (current.depth < MAX_DRIVE_FOLDER_DEPTH) {
            folders.push({ id, path, depth: current.depth + 1 });
          } else {
            truncated = true;
          }
        }
      }
    }
  }

  return { files, truncated, visitedFolders };
}

async function collectArchiveFiles(drive: drive_v3.Drive, rootFolderId: string) {
  const indexed = await collectArchiveFilesFromIndex(drive, rootFolderId);
  if (indexed.files.length > 0 || indexed.visitedFolders > 1) return indexed;

  return collectArchiveFilesByTraversal(drive, rootFolderId);
}

function toArchiveFile(file: ArchiveDriveFile) {
  const mimeType = String(file.mimeType ?? '');
  const fileExtension = String(file.fileExtension ?? '');

  return {
    id: String(file.id ?? ''),
    name: String(file.name ?? ''),
    mimeType,
    category: classifyFile(mimeType, fileExtension),
    webViewLink: String(file.webViewLink ?? ''),
    webContentLink: String(file.webContentLink ?? ''),
    createdTime: String(file.createdTime ?? ''),
    modifiedTime: String(file.modifiedTime ?? ''),
    size: file.size ? Number(file.size) : null,
    fileExtension,
    iconLink: String(file.iconLink ?? ''),
    path: file.path,
    parentPath: file.parentPath,
    depth: file.depth,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if ('error' in authResult) return authResult.error;

    const auth = buildDriveAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Missing Google service account env vars' }, { status: 500 });
    }

    const folderId = env('GOOGLE_RECORDING_ARCHIVE_FOLDER_ID') || DEFAULT_RECORDING_ARCHIVE_FOLDER_ID;
    const drive = google.drive({ version: 'v3', auth });
    const archive = await collectArchiveFiles(drive, folderId);

    return NextResponse.json({
      ok: true,
      folderId,
      folderUrl: folderId === DEFAULT_RECORDING_ARCHIVE_FOLDER_ID ? RECORDING_ARCHIVE_FOLDER_URL : `https://drive.google.com/drive/folders/${folderId}`,
      fetchedAt: new Date().toISOString(),
      truncated: archive.truncated,
      scannedFolders: archive.visitedFolders,
      files: archive.files.map(toArchiveFile).filter((file) => file.id && file.name),
    });
  } catch (e: unknown) {
    const message = errorMessage(e);
    console.error('[recording-archive] failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
