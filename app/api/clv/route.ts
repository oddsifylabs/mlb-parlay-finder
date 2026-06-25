import { NextResponse } from 'next/server';
import { getCLVHistory, getCLVSummary, getSignalPerformance, saveCLVRecord, updateParlayResult } from '../../../lib/db/history';
import type { CLVRecord } from '../../../lib/db/history';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'summary';
    
    if (action === 'history') {
      const limit = parseInt(searchParams.get('limit') || '100');
      const history = getCLVHistory(limit);
      return NextResponse.json({ history });
    }
    
    if (action === 'summary') {
      const summary = getCLVSummary();
      return NextResponse.json({ summary });
    }
    
    if (action === 'signals') {
      const signals = getSignalPerformance();
      return NextResponse.json({ signals });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, record } = body;
    
    if (action === 'save') {
      const clvRecord: CLVRecord = {
        id: record.id,
        savedAt: record.savedAt || new Date().toISOString(),
        event: record.event,
        selection: record.selection,
        openingLine: record.openingLine,
        closingLine: record.closingLine,
        clv: record.clv,
        result: record.result
      };
      saveCLVRecord(clvRecord);
      return NextResponse.json({ success: true, record: clvRecord });
    }
    
    if (action === 'update_result') {
      const { id, result, closingLine, profitLoss } = body;
      updateParlayResult(id, result, closingLine, profitLoss);
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
