import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ESPN_NHL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';

const TICKER_MAP: Record<string, string> = {
    'TB': 'TBL', 'SJ': 'SJS', 'NJ': 'NJD', 'LA': 'LAK', 
    'WAS': 'WSH', 'MON': 'MTL', 'UTA': 'UTAH'
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. SETUP ADMIN CLIENT
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ success: false, error: "Missing Key" }, { status: 500 });
  
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  // 2. SECURITY CHECK
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const log: string[] = [];
    const now = new Date();

    // --- FETCH RANGE: Yesterday to +7 Days ---
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const datesParam = `${formatDate(start)}-${formatDate(end)}`;
    
    const res = await fetch(`${ESPN_NHL_SCOREBOARD}?dates=${datesParam}`);
    const data = await res.json();
    const games = data.events || [];

    // Track teams we have handled so we don't overwrite "Today's" game with "Tomorrow's"
    const scheduleUpdated = new Set<string>();

    for (const event of games) {
      const competition = event.competitions[0];
      const isCompleted = event.status.type.completed;
      const state = event.status.type.state; // 'pre', 'in', 'post'
      const gameId = String(event.id); 
      const gameDate = new Date(event.date);

      // --- 1. IDENTIFY TEAMS ---
      const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');
      
      // Normalize Tickers
      let homeTicker = homeTeam.team.abbreviation;
      if (TICKER_MAP[homeTicker]) homeTicker = TICKER_MAP[homeTicker];
      let awayTicker = awayTeam.team.abbreviation;
      if (TICKER_MAP[awayTicker]) awayTicker = TICKER_MAP[awayTicker];

      // --- 2. "LOCK" SCHEDULE FOR ACTIVE GAMES ---
      // If game is LIVE ('in') or FINAL ('post') but happened recently (< 12 hours ago), 
      // we mark these teams as "Updated" so the future-game logic below DOES NOT overwrite them.
      // This ensures the frontend keeps seeing "Today's" game to show the score.
      const hoursSinceStart = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
      
      // If it's Live OR (Final and less than 12 hours old)
      if (state === 'in' || (state === 'post' && hoursSinceStart < 12)) {
          scheduleUpdated.add(homeTicker);
          scheduleUpdated.add(awayTicker);
          // Ensure DB has THIS game date (fix for if it was previously wrong)
          await supabaseAdmin.from('teams').update({
             next_opponent: awayTicker,
             next_game_at: gameDate.toISOString()
          }).eq('ticker', homeTicker).eq('league', 'NHL');

          await supabaseAdmin.from('teams').update({
             next_opponent: homeTicker,
             next_game_at: gameDate.toISOString()
          }).eq('ticker', awayTicker).eq('league', 'NHL');
      }

      // --- 3. UPDATE RECORDS (Always run) ---
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

      // --- 4. UPDATE SCHEDULE (Future Games Only) ---
      // Only run this if we haven't already "locked" the team with a Live/Recent game above
      if (!isCompleted && gameDate > now) {
         if (homeTeam && awayTeam) {
             const updateSchedule = async (tTicker: string, oppTicker: string) => {
                 if (!scheduleUpdated.has(tTicker)) {
                     await supabaseAdmin.from('teams').update({
                         next_opponent: oppTicker,
                         next_game_at: gameDate.toISOString()
                     }).eq('ticker', tTicker).eq('league', 'NHL'); // STRICT LEAGUE CHECK
                     
                     scheduleUpdated.add(tTicker);
                 }
             };
             await updateSchedule(homeTicker, awayTicker);
             await updateSchedule(awayTicker, homeTicker);
         }
      }

      // --- 5. PROCESS PAYOUTS (Final Games Only) ---
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