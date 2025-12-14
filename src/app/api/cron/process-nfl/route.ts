import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const TICKER_MAP: Record<string, string> = {
    'WAS': 'WSH', 
    'LA': 'LAR', 
    'JAC': 'JAX'
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
    const now = new Date();
    
    // --- FETCH RANGE: -6 Days to +7 Days ---
    // Widen start to -6 to ensure we catch Thursday games when running on Saturday/Sunday.
    const start = new Date(now);
    start.setDate(start.getDate() - 6); 
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
    const datesParam = `${formatDate(start)}-${formatDate(end)}`;
    
    // Fetch with date range
    const res = await fetch(`${ESPN_SCOREBOARD}?dates=${datesParam}`);
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

      // --- 1. LOCK SCHEDULE LOGIC ---
      // Goal: Keep results visible until the following Tuesday at 9 AM.
      
      const dayOfWeek = gameDate.getDay(); 
      let daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
      if (daysUntilTuesday === 0) daysUntilTuesday = 7; 

      const resetDate = new Date(gameDate);
      resetDate.setDate(gameDate.getDate() + daysUntilTuesday);
      resetDate.setHours(9, 0, 0, 0); 

      // TIMEZONE FIX: Use an "Hours Difference" check instead of "Calendar Day"
      // This calculates how many hours away the game is (negative = started already)
      const hoursDiff = (gameDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      // We consider it "Today's Game" if it started within the last 12 hours 
      // OR starts in the next 18 hours. This catches 8pm games safely.
      const isGameRelevant = hoursDiff > -12 && hoursDiff < 18;

      // LOCK IF: 
      // 1. Game is Live ('in')
      // 2. Game is Final ('post') AND not yet reset time
      // 3. Game is RELEVANT (Near Now) - Prevents overwriting with next week's game
      if (state === 'in' || (state === 'post' && now < resetDate) || isGameRelevant) {
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
            wins: parseInt(parts[0])||0, 
            losses: parseInt(parts[1])||0, 
            otl: parseInt(parts[2])||0 
        }).eq('ticker', ticker).eq('league', 'NFL');
      }

      // --- 3. UPDATE SCHEDULE (Future Games) ---
      // Only update to a future game if we HAVEN'T locked a recent game above.
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

// 1. Identify Loser for the Description
const loser = competition.competitors.find((c: any) => c.id !== winner.id);
let matchDetails = 'Win';

if (loser) {
    const wScore = winner.score; // e.g. "4"
    const lScore = loser.score;  // e.g. "2"
    const lTicker = loser.team.abbreviation;
    const vs = winner.homeAway === 'home' ? 'vs' : '@';
    matchDetails = `W ${wScore}-${lScore} ${vs} ${lTicker}`;
}

const { data: teamData } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('ticker', winnerTicker)
    .eq('league', 'NHL') // NOTE: Change to 'NFL' for the NFL file
    .single();

if (teamData) {
    // Pass the p_description parameter
    await supabaseAdmin.rpc('simulate_win', { 
        p_team_id: teamData.id,
        p_description: matchDetails 
    });
    log.push(`PAYOUT: ${teamData.name} (${matchDetails})`);
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