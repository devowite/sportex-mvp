import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ESPN_NHL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';

const TICKER_MAP: Record<string, string> = {
    'TB': 'TBL', 'SJ': 'SJS', 'NJ': 'NJD', 'LA': 'LAK', 
    'WAS': 'WSH', 'MON': 'MTL' 
    // Removed 'UTA': 'UTAH' so it stays as 'UTA' in your DB
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ success: false, error: "Missing Key" }, { status: 500 });
  
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const log: string[] = [];
    const now = new Date();
    
    // Check Yesterday + Next 7 Days (To handle payouts AND schedule updates)
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const datesParam = `${formatDate(start)}-${formatDate(end)}`;
    
    const res = await fetch(`${ESPN_NHL_SCOREBOARD}?dates=${datesParam}`);
    const data = await res.json();
    const games = data.events || [];

    // Track updates so we don't overwrite "Today's Game" with "Tomorrow's Game"
    const scheduleUpdated = new Set<string>();

    for (const event of games) {
      const competition = event.competitions[0];
      const isCompleted = event.status.type.completed;
      const state = event.status.type.state;
      const gameId = String(event.id); 
      const gameDate = new Date(event.date);

      const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');
      
      let homeTicker = homeTeam.team.abbreviation;
      if (TICKER_MAP[homeTicker]) homeTicker = TICKER_MAP[homeTicker];
      let awayTicker = awayTeam.team.abbreviation;
      if (TICKER_MAP[awayTicker]) awayTicker = TICKER_MAP[awayTicker];

      // --- 1. LOCK LOGIC: If Live or Recently Final, Keep this game in DB ---
      const hoursSinceStart = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
      if (state === 'in' || (state === 'post' && hoursSinceStart < 6)) {
          scheduleUpdated.add(homeTicker);
          scheduleUpdated.add(awayTicker);
          // Force DB to show THIS game
          await supabaseAdmin.from('teams').update({ next_opponent: awayTicker, next_game_at: gameDate.toISOString() }).eq('ticker', homeTicker).eq('league', 'NHL');
          await supabaseAdmin.from('teams').update({ next_opponent: homeTicker, next_game_at: gameDate.toISOString() }).eq('ticker', awayTicker).eq('league', 'NHL');
      }

      // --- 2. UPDATE RECORDS ---
      for (const competitor of competition.competitors) {
        let ticker = competitor.team.abbreviation;
        if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];
        const recordObj = competitor.records?.find((r: any) => r.name === 'overall');
        if (recordObj) {
            const parts = recordObj.summary.split('-');
            if (parts.length >= 2) {
                await supabaseAdmin.from('teams').update({ 
                    wins: parseInt(parts[0])||0, losses: parseInt(parts[1])||0, otl: parseInt(parts[2])||0 
                }).eq('ticker', ticker).eq('league', 'NHL');
            }
        }
      }

      // --- 3. UPDATE SCHEDULE (Future Games) ---
      if (!isCompleted && gameDate > now) {
         if (homeTeam && awayTeam) {
             const updateSchedule = async (tTicker: string, oppTicker: string) => {
                 if (!scheduleUpdated.has(tTicker)) {
                     await supabaseAdmin.from('teams').update({
                         next_opponent: oppTicker,
                         next_game_at: gameDate.toISOString()
                     }).eq('ticker', tTicker).eq('league', 'NHL');
                     scheduleUpdated.add(tTicker);
                 }
             };
             await updateSchedule(homeTicker, awayTicker);
             await updateSchedule(awayTicker, homeTicker);
         }
      }

      // --- 4. PAYOUTS ---
      if (isCompleted) {
        const { data: existing } = await supabaseAdmin.from('processed_games').select('game_id').eq('game_id', gameId).limit(1).maybeSingle();

        if (!existing) {
            const winner = competition.competitors.find((c: any) => c.winner === true);
            if (winner) {
                let winnerTicker = winner.team.abbreviation;
                if (TICKER_MAP[winnerTicker]) winnerTicker = TICKER_MAP[winnerTicker];

                const { data: teamData } = await supabaseAdmin.from('teams').select('id, name').eq('ticker', winnerTicker).eq('league', 'NHL').single();
                if (teamData) {
                    await supabaseAdmin.rpc('simulate_win', { p_team_id: teamData.id });
                    log.push(`PAYOUT: ${teamData.name}`);
                }
            }
            await supabaseAdmin.from('processed_games').insert({ game_id: gameId, league: 'NHL' });
        }
      }
    }
    return NextResponse.json({ success: true, logs: log });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}