import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { createClient } from '@supabase/supabase-js';

// ✅ fs 사용하므로 Node 런타임 강제 (Vercel에서 중요)
export const runtime = 'nodejs';

// ====== 좌표 세팅 (추후 1~2mm 조정 가능) ======
// pdf-lib 좌표계: (0,0) 왼쪽 아래
const COORDS = {
  bossSign: { x: 421, y: 696, w: 95, h: 42 }, // 본부장 칸(서명)
  sabun: { x: 418, y: 575, size: 12 },
  name: { x: 185, y: 535, size: 12 },
  reqDate: { x: 185, y: 492, size: 12 },
  reason: { x: 185, y: 415, size: 11, lineHeight: 16 },
  bottomDate: { x: 265, y: 250, size: 12 },
  applicant: { x: 345, y: 205, size: 12 },
};

// leave_type 라벨
function labelOf(t: string) {
  if (t === 'annual') return '연차';
  if (t === 'half_am') return '오전반차';
  if (t === 'half_pm') return '오후반차';
  return t;
}

function ymdKorean(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}년 ${m}월 ${day}일`;
}

// jsonb가 문자열/객체 등으로 올 수 있어서 안전하게 문자열로 뽑기
function jsonbToString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;           // "boss.png" 형태로 이미 string이면 그대로
  if (typeof v === 'object') {
    // {"path":"boss.png"} 같은 구조면 여기서 처리
    if (typeof v.path === 'string') return v.path;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const weekKey = searchParams.get('week'); // 예: 2026-W06
    if (!weekKey) {
      return NextResponse.json({ error: 'week required' }, { status: 400 });
    }

    const [yy, ww] = weekKey.split('-W');
    const iso_year = Number(yy);
    const iso_week = Number(ww);
    if (!iso_year || !iso_week) {
      return NextResponse.json({ error: 'invalid week format (ex: 2026-W06)' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      );
    }

    // ✅ Service role로 Storage/private 접근 가능
    const supabase = createClient(url, serviceKey);

    // 1) 주간 데이터 조회
    const { data: rows, error: rowsErr } = await supabase
      .from('v_leave_weekly_admin')
      .select('id,user_id,display_name,leave_type,start_date,end_date,days_count,reason,iso_year,iso_week')
      .eq('iso_year', iso_year)
      .eq('iso_week', iso_week)
      .order('display_name', { ascending: true });

    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No leave requests in this week' }, { status: 404 });
    }

    // 2) 본부장 서명 경로 조회 (value_json)
    const { data: bossSetting, error: setErr } = await supabase
      .from('app_settings')
      .select('value_json')
      .eq('key', 'hr_boss_signature_path')
      .single();

    if (setErr) {
      return NextResponse.json({ error: `app_settings read failed: ${setErr.message}` }, { status: 500 });
    }

    const bossPath = jsonbToString((bossSetting as any)?.value_json);
    // bossPath 예: boss.png

    // 3) 템플릿 PDF 로드 (public/hr/leave_form_template.pdf)
    const templatePath = path.join(process.cwd(), 'public', 'hr', 'leave_form_template.pdf');
    const templateBytes = await fs.readFile(templatePath);

    // 4) 한글 폰트 로드 (권장)
    // public/fonts/NotoSansKR-Regular.ttf 를 넣어둬야 한글이 안 깨짐
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Regular.ttf');

    let fontBytes: Uint8Array | null = null;
    try {
      const fb = await fs.readFile(fontPath);
      fontBytes = new Uint8Array(fb);
    } catch {
      // 폰트 없을 경우: 영문만 정상, 한글은 깨질 수 있음 (그래도 PDF는 생성되게)
      fontBytes = null;
    }

    // 5) 본부장 서명 이미지(Storage에서 다운로드)
    let bossSignBytes: ArrayBuffer | null = null;
    if (bossPath) {
      const { data: sigObj, error: sigErr } = await supabase.storage.from('signatures').download(bossPath);
      if (!sigErr && sigObj) {
        bossSignBytes = await sigObj.arrayBuffer();
      }
    }

    // 6) 병합 PDF 만들기
    const merged = await PDFDocument.create();
    merged.registerFontkit(fontkit);

    const font =
      fontBytes
        ? await merged.embedFont(fontBytes, { subset: true })
        : await merged.embedFont(StandardFonts.Helvetica);

    const todayStr = ymdKorean(new Date());

    for (const r of rows as any[]) {
      // template 로드 후 페이지 복사
      const base = await PDFDocument.load(templateBytes);
      const [page0] = await merged.copyPages(base, [0]);
      merged.addPage(page0);

      // 사번: 지금 v_leave_weekly_admin에 없으니 공란
      const sabun = '';

      // 사유 영역 텍스트(원하는 포맷으로 수정 가능)
      const reasonLine =
        `${r.start_date} ~ ${r.end_date} / ${r.days_count}일 / ${labelOf(r.leave_type)}` +
        (r.reason ? `\n사유: ${r.reason}` : '');

      // 텍스트 입력
      page0.drawText(String(sabun ?? ''), {
        x: COORDS.sabun.x,
        y: COORDS.sabun.y,
        size: COORDS.sabun.size,
        font,
      });

      page0.drawText(String(r.display_name ?? ''), {
        x: COORDS.name.x,
        y: COORDS.name.y,
        size: COORDS.name.size,
        font,
      });

      page0.drawText(todayStr, {
        x: COORDS.reqDate.x,
        y: COORDS.reqDate.y,
        size: COORDS.reqDate.size,
        font,
      });

      page0.drawText(reasonLine, {
        x: COORDS.reason.x,
        y: COORDS.reason.y,
        size: COORDS.reason.size,
        font,
        lineHeight: COORDS.reason.lineHeight,
      });

      page0.drawText(todayStr, {
        x: COORDS.bottomDate.x,
        y: COORDS.bottomDate.y,
        size: COORDS.bottomDate.size,
        font,
      });

      page0.drawText(String(r.display_name ?? ''), {
        x: COORDS.applicant.x,
        y: COORDS.applicant.y,
        size: COORDS.applicant.size,
        font,
      });

      // 본부장 서명 이미지
      if (bossSignBytes) {
        // png 기준. jpg면 merged.embedJpg 사용
        const img = await merged.embedPng(bossSignBytes);
        page0.drawImage(img, {
          x: COORDS.bossSign.x,
          y: COORDS.bossSign.y,
          width: COORDS.bossSign.w,
          height: COORDS.bossSign.h,
        });
      }
    }

    const out = await merged.save();

    return new NextResponse(Buffer.from(out), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="weekly_leave_${weekKey}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? 'unknown error' }, { status: 500 });
  }
}
