import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 1. STANDINGS (For Records: 10-5-0)
const ESPN_NFL_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
// 2. SCOREBOARD (For Live Payouts & Next Game)
const ESPN_NFL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

// --- TRANSLATION MAP ---
// ESPN uses different abbreviations than standard tickers for some teams.
// Format: "ESPN_CODE": "YOUR_DB_TICKER"
const TICKER_MAP: Record<string, string> = {
    'WSH': 'WAS', // Example: If DB has WSH but ESPN sends WAS
    'WAS': 'WSH', // Inverse check
    'JAC': 'JAX',
    'LA': 'LAR'   // ESPN sometimes just says "LA" for Rams
};

export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  // --- AUTH CHECK ---
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];

  try {
    // ====================================================
    // PART 1: UPDATE TEAM RECORDS
    // ====================================================
    const resStandings = await fetch(ESPN_NFL_STANDINGS);
    const dataStandings = await resStandings.json();
    
    const conferences = dataStandings.children || [];
    
    for (const conf of conferences) {
        for (const div of conf.children || []) {
            for (const teamEntry of div.standings.entries || []) {
                let ticker = teamEntry.team.abbreviation;
                
                // 1. Normalize Ticker (Handle Mismatches)
                if (TICKER_MAP[ticker]) {
                    log.push(`Mapping ${ticker} -> ${TICKER_MAP[ticker]}`);
                    ticker = TICKER_MAP[ticker];
                }

                const stats = teamEntry.stats;
                const wins = stats.find((s: any) => s.type === 'wins')?.value || 0;
                const losses = stats.find((s: any) => s.type === 'losses')?.value || 0;
                const ties = stats.find((s: any) => s.type === 'ties')?.value || 0;

                // 2. Debug Log (See what we are trying to update)
                // log.push(`Updating ${ticker}: ${wins}-${losses}-${ties}`);

                // 3. Update DB
                const { error, count } = await supabase
                    .from('teams')
                    .update({
                        wins: wins,
                        losses: losses,
                        otl: ties
                    })
                    .eq('ticker', ticker)
                    .eq('league', 'NFL')
                    .select(); // Important: Allows us to check 'count'

                if (error) {
                    log.push(`ERROR updating ${ticker}: ${error.message}`);
                } else if (count === 0) {
                    // This is the smoking gun: ESPN sent a ticker we don't have in DB
                    log.push(`SKIPPED: Could not find team with ticker "${ticker}" in DB.`);
                }
            }
        }
    }
    log.push('Standings (Records) Process Complete.');

    // ====================================================
    // PART 2: PROCESS LIVE GAMES
    // ====================================================
    const resScore = await fetch(ESPN_NFL_SCOREBOARD);
    const dataScore = await resScore.json();
    const games = dataScore.events || [];

    for (const event of games) {
      const competition = event.competitions[0];
      const status = event.status.type.state; 
      const completed = event.status.type.completed;
      
      const teamA_ticker = competition.competitors[0].team.abbreviation;
      const teamB_ticker = competition.competitors[1].team.abbreviation;

      if (status === 'pre') {
        const date = event.date;
        await supabase.from('teams').update({ next_game_at: date, next_opponent: `vs ${teamB_ticker}` }).eq('ticker', teamA_ticker).eq('league', 'NFL');
        await supabase.from('teams').update({ next_game_at: date, next_opponent: `@ ${teamA_ticker}` }).eq('ticker', teamB_ticker).eq('league', 'NFL');
      }

      if (completed) {
        const winner = competition.competitors.find((c: any) => c.winner === true);
        if (winner) {
            const winnerTicker = winner.team.abbreviation;
            const { data: teamData } = await supabase.from('teams').select('id').eq('ticker', winnerTicker).eq('league', 'NFL').single();
            if (teamData) {
               // await supabase.rpc('simulate_win', { p_team_id: teamData.id });
               log.push(`Winner found: ${winnerTicker}`);
            }
        }
      }
    }

    return NextResponse.json({ success: true, logs: log });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}