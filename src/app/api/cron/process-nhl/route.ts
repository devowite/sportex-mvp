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

    // --- FETCH RANGE: Yesterday (for payouts) to +7 Days (for schedule) ---
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const datesParam = `${formatDate(start)}-${formatDate(end)}`;
    
    const res = await fetch(`${ESPN_NHL_SCOREBOARD}?dates=${datesParam}`);
    const data = await res.json();
    const games = data.events || [];

    // Track teams we've already found a "Next Game" for in this loop
    const scheduleUpdated = new Set<string>();

    for (const event of games) {
      const competition = event.competitions[0];
      const isCompleted = event.status.type.completed;
      const gameId = String(event.id); 
      const gameDate = new Date(event.date);

      // --- 1. UPDATE STANDINGS (Always run) ---
      for (const competitor of competition.competitors) {
        let ticker = competitor.team.abbreviation;
        if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];

        const recordObj = competitor.records?.find((r: any) => r.name === 'overall');
        if (recordObj) {
            const parts = recordObj.summary.split('-');
            if (parts.length >= 2) {
                await supabaseAdmin.from('teams').update({ 
                    wins: parseInt(parts[0])||0, losses: parseInt(parts[1])||0, otl: parseInt(parts[2])||0 
                }).eq('ticker', ticker).eq('league', 'NHL'); // STRICT LEAGUE CHECK
            }
        }
      }

      // --- 2. UPDATE SCHEDULE (Future Games Only) ---
      if (!isCompleted && gameDate > now) {
         const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
         const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');

         if (homeTeam && awayTeam) {
             const updateSchedule = async (teamData: any, opponentData: any) => {
                 let tTicker = teamData.team.abbreviation;
                 if (TICKER_MAP[tTicker]) tTicker = TICKER_MAP[tTicker];
                 
                 // Only update if we haven't found a sooner game in this loop
                 if (!scheduleUpdated.has(tTicker)) {
                     let oppTicker = opponentData.team.abbreviation;
                     if (TICKER_MAP[oppTicker]) oppTicker = TICKER_MAP[oppTicker]; // Normalize opponent too

                     await supabaseAdmin.from('teams').update({
                         next_opponent: oppTicker,
                         next_game_at: gameDate.toISOString()
                     }).eq('ticker', tTicker).eq('league', 'NHL'); // STRICT LEAGUE CHECK
                     
                     scheduleUpdated.add(tTicker);
                 }
             };

             await updateSchedule(homeTeam, awayTeam);
             await updateSchedule(awayTeam, homeTeam);
         }
      }

      // --- 3. PROCESS PAYOUTS (Final Games Only) ---
      if (isCompleted) {
        // IDEMPOTENCY
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