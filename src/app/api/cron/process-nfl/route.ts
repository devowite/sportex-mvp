import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 1. STANDINGS (For Records: 10-5-0)
const ESPN_NFL_STANDINGS = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
// 2. SCOREBOARD (For Live Payouts & Next Game)
const ESPN_NFL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export const dynamic = 'force-dynamic'; // Prevent caching

export async function GET(request: Request) {
  // --- AUTH CHECK ---
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const log: string[] = [];

  try {
    // ====================================================
    // PART 1: UPDATE TEAM RECORDS (Wins/Losses)
    // ====================================================
    const resStandings = await fetch(ESPN_NFL_STANDINGS);
    const dataStandings = await resStandings.json();
    
    // ESPN Structure is nested: League -> Conference -> Division -> Team
    const conferences = dataStandings.children || [];
    
    for (const conf of conferences) {
        for (const div of conf.children || []) {
            for (const teamEntry of div.standings.entries || []) {
                const ticker = teamEntry.team.abbreviation;
                const stats = teamEntry.stats;

                // Find the specific stats we need (ESPN uses types)
                const wins = stats.find((s: any) => s.type === 'wins')?.value || 0;
                const losses = stats.find((s: any) => s.type === 'losses')?.value || 0;
                const ties = stats.find((s: any) => s.type === 'ties')?.value || 0;

                // Update DB
                const { error } = await supabase
                    .from('teams')
                    .update({
                        wins: wins,
                        losses: losses,
                        otl: ties // Mapping NFL Ties to the 'otl' column
                    })
                    .eq('ticker', ticker)
                    .eq('league', 'NFL');

                if (error) log.push(`Error updating ${ticker}: ${error.message}`);
            }
        }
    }
    log.push('Standings (Records) Updated.');

    // ====================================================
    // PART 2: PROCESS LIVE GAMES (Payouts & Next Game)
    // ====================================================
    const resScore = await fetch(ESPN_NFL_SCOREBOARD);
    const dataScore = await resScore.json();
    const games = dataScore.events || [];

    for (const event of games) {
      const competition = event.competitions[0];
      const status = event.status.type.state; // 'pre', 'in', 'post'
      const completed = event.status.type.completed;
      
      const teamA_data = competition.competitors[0];
      const teamB_data = competition.competitors[1];
      const teamA_ticker = teamA_data.team.abbreviation;
      const teamB_ticker = teamB_data.team.abbreviation;

      // A. UPDATE NEXT GAME INFO (If game hasn't started yet)
      if (status === 'pre') {
        const date = event.date; // ISO String

        // Update Team A
        await supabase.from('teams').update({
            next_game_at: date,
            next_opponent: `vs ${teamB_ticker}`
        }).eq('ticker', teamA_ticker).eq('league', 'NFL');

        // Update Team B
        await supabase.from('teams').update({
            next_game_at: date,
            next_opponent: `@ ${teamA_ticker}`
        }).eq('ticker', teamB_ticker).eq('league', 'NFL');
      }

      // B. PAYOUT WINNERS (Only if game is newly finished)
      // Note: In a real app, you need a "games_processed" table to ensure you don't pay twice.
      // For MVP, this assumes the Cron runs infrequently or we manually manage it.
      if (completed) {
        const winner = competition.competitors.find((c: any) => c.winner === true);
        if (winner) {
            const winnerTicker = winner.team.abbreviation;
            
            // Get ID
            const { data: teamData } = await supabase
                .from('teams')
                .select('id')
                .eq('ticker', winnerTicker)
                .eq('league', 'NFL')
                .single();

            if (teamData) {
               // We won't auto-trigger payout here to be safe for MVP testing
               // Uncomment this line to enable auto-payouts:
               // await supabase.rpc('simulate_win', { p_team_id: teamData.id });
               log.push(`Winner found: ${winnerTicker} (Payout Ready)`);
            }
        }
      }
    }

    return NextResponse.json({ success: true, logs: log });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}