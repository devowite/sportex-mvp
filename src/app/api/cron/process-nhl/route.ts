import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ESPN_NHL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';

// TRANSLATION MAP: ESPN Ticker -> Your DB Ticker
// (Matches the logic in your TeamCard.tsx)
const TICKER_MAP: Record<string, string> = {
    'TB': 'TBL',
    'SJ': 'SJS',
    'NJ': 'NJD',
    'LA': 'LAK',
    'WAS': 'WSH',
    'MON': 'MTL',
    'UTA': 'UTAH'
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. SETUP ADMIN CLIENT
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
      return NextResponse.json({ success: false, error: "Missing Service Role Key" }, { status: 500 });
  }
  
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  // 2. SECURITY CHECK
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const log: string[] = [];

    // --- PART A: PROCESS GAMES (Yesterday + Today) ---
    // We fetch a range to ensure we catch late-night games from yesterday
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // ESPN API handles date ranges nicely
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const datesParam = `${formatDate(yesterday)}-${formatDate(today)}`;
    
    const res = await fetch(`${ESPN_NHL_SCOREBOARD}?dates=${datesParam}`);
    const data = await res.json();
    const games = data.events || [];

    for (const event of games) {
      const competition = event.competitions[0];
      const isCompleted = event.status.type.completed;
      const gameId = String(event.id); // This is now the ESPN ID

      // --- 1. UPDATE STANDINGS (Wins/Losses) ---
      // We do this for all games in the feed to keep records fresh
      for (const competitor of competition.competitors) {
        let ticker = competitor.team.abbreviation;
        if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];

        // ESPN NHL records are often in the 'statistics' array or records array
        // We try to find the 'overall' record
        const recordObj = competitor.records?.find((r: any) => r.name === 'overall');
        if (recordObj) {
            const recordString = recordObj.summary; // e.g. "10-5-2"
            const parts = recordString.split('-');
            if (parts.length >= 2) {
                await supabaseAdmin
                    .from('teams')
                    .update({ 
                        wins: parseInt(parts[0])||0, 
                        losses: parseInt(parts[1])||0, 
                        otl: parseInt(parts[2])||0 
                    })
                    .eq('ticker', ticker)
                    .eq('league', 'NHL');
            }
        }
      }

      // --- 2. PROCESS PAYOUTS ---
      if (isCompleted) {
        // A. IDEMPOTENCY CHECK
        const { data: existing } = await supabaseAdmin
            .from('processed_games')
            .select('game_id')
            .eq('game_id', gameId)
            .limit(1)
            .maybeSingle();

        if (!existing) {
            // B. FIND WINNER
            const winner = competition.competitors.find((c: any) => c.winner === true);
            
            if (winner) {
                let winnerTicker = winner.team.abbreviation;
                if (TICKER_MAP[winnerTicker]) winnerTicker = TICKER_MAP[winnerTicker];

                const { data: teamData } = await supabaseAdmin
                    .from('teams')
                    .select('id, name')
                    .eq('ticker', winnerTicker)
                    .eq('league', 'NHL')
                    .single();

                if (teamData) {
                    await supabaseAdmin.rpc('simulate_win', { p_team_id: teamData.id });
                    log.push(`PAYOUT SUCCESS: ${teamData.name} (${winnerTicker})`);
                }
            }
            
            // C. REMEMBER GAME (Now storing ESPN ID)
            await supabaseAdmin.from('processed_games').insert({ game_id: gameId, league: 'NHL' });
        }
      }
    }

    return NextResponse.json({ success: true, logs: log });

  } catch (error: any) {
    console.error("NHL Cron Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}