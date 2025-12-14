import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const TICKER_MAP: Record<string, string> = {
    'WAS': 'WSH', 'LA': 'LAR', 'JAC': 'JAX'
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
    
    const res = await fetch(ESPN_SCOREBOARD);
    const data = await res.json();
    const games = data.events || [];
    
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

      // --- 1. LOCK SCHEDULE FOR ACTIVE/RECENT GAMES ---
      const hoursSinceStart = (now.getTime() - gameDate.getTime()) / (1000 * 60 * 60);
      
      // If Live or (Final < 12 hours ago) -> Keep this game in DB
      if (state === 'in' || (state === 'post' && hoursSinceStart < 12)) {
          scheduleUpdated.add(homeTicker);
          scheduleUpdated.add(awayTicker);
          
          await supabaseAdmin.from('teams').update({
             next_opponent: awayTicker,
             next_game_at: gameDate.toISOString()
          }).eq('ticker', homeTicker).eq('league', 'NFL');

          await supabaseAdmin.from('teams').update({
             next_opponent: homeTicker,
             next_game_at: gameDate.toISOString()
          }).eq('ticker', awayTicker).eq('league', 'NFL');
      }

      // --- 2. UPDATE RECORDS --- 
      for (const competitor of competition.competitors) {
        let ticker = competitor.team.abbreviation;
        if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];

        const recordObj = competitor.records?.find((r: any) => r.name === 'overall');
        const recordString = recordObj ? recordObj.summary : '0-0-0';
        const parts = recordString.split('-');
        
        await supabaseAdmin.from('teams').update({ 
            wins: parseInt(parts[0])||0, losses: parseInt(parts[1])||0, otl: parseInt(parts[2])||0 
        }).eq('ticker', ticker).eq('league', 'NFL');
      }

      // --- 3. UPDATE SCHEDULE (Future) ---
      if (!isCompleted && gameDate > now) {
         if (homeTeam && awayTeam) {
             const updateSchedule = async (tTicker: string, oppTicker: string) => {
                 if (!scheduleUpdated.has(tTicker)) {
                     await supabaseAdmin.from('teams').update({
                         next_opponent: oppTicker,
                         next_game_at: gameDate.toISOString()
                     }).eq('ticker', tTicker).eq('league', 'NFL');
                     
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

                const { data: teamData } = await supabaseAdmin.from('teams').select('id, name').eq('ticker', winnerTicker).eq('league', 'NFL').single();
                if (teamData) {
                    await supabaseAdmin.rpc('simulate_win', { p_team_id: teamData.id });
                    log.push(`PAYOUT: ${teamData.name}`);
                }
            }
            await supabaseAdmin.from('processed_games').insert({ game_id: gameId, league: 'NFL' });
        }
      }
    }

    return NextResponse.json({ success: true, logs: log });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}