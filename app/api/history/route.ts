import { NextRequest, NextResponse } from 'next/server';
import { clearSavedParlays, deleteSavedParlay, listSavedParlays, saveParlay } from '../../../lib/db/history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ saved: listSavedParlays() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History read failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.id || !body?.parlay) {
      return NextResponse.json({ error: 'Missing saved parlay id or parlay payload' }, { status: 400 });
    }
    const saved = saveParlay(String(body.id), body.parlay, body.note ? String(body.note) : '');
    return NextResponse.json({ saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History save failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (id) deleteSavedParlay(id);
    else clearSavedParlays();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History delete failed' }, { status: 500 });
  }
}
