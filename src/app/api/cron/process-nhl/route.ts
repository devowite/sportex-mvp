import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Official NHL API Endpoint
const NHL_API_BASE = 'https://api-web.nhle.com/v1';

export async function GET(request: Request) {
  // 1. SECURITY: Check for a secret key (so random people can't trigger payouts)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const log = [];

    // --- PART A: UPDATE STANDINGS (Wins/Losses) ---
    const standingsRes = await fetch(`${NHL_API_BASE}/standings/now`);
    const standingsData = await standingsRes.json();

    for (const teamNode of standingsData.standings) {
      // The API uses 'abbrev' (e.g. BOS). We match this to our 'ticker' column.
      const ticker = teamNode.teamAbbrev.default;
      const wins = teamNode.wins;
      const losses = teamNode.losses;
      const otl = teamNode.otLosses;

      // Update DB
      const { error } = await supabase
        .from('teams')
        .update({ wins, losses, otl })
        .eq('ticker', ticker);
      
      if (error) console.error(`Failed to update ${ticker}:`, error);
    }
    log.push('Standings updated.');

    // --- PART B: PROCESS YESTERDAY'S GAMES (PAYOUTS) ---
    // Calculate "Yesterday" in YYYY-MM-DD format
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const scoreRes = await fetch(`${NHL_API_BASE}/score/${dateStr}`);
    const scoreData = await scoreRes.json();

    let payoutCount = 0;

    for (const game of scoreData.games) {
        // Only process FINAL games
        if (game.gameState === 'OFF' || game.gameState === 'FINAL') {
            const home = game.homeTeam;
            const away = game.awayTeam;
            
            // Determine Winner (Higher Score)
            let winnerTicker = null;
            if (home.score > away.score) winnerTicker = home.abbrev;
            else if (away.score > home.score) winnerTicker = away.abbrev;

            if (winnerTicker) {
                // 1. Find Team ID in DB
                const { data: teamData } = await supabase
                    .from('teams')
                    .select('id, name')
                    .eq('ticker', winnerTicker)
                    .single();

                if (teamData) {
                    // 2. Trigger the Payout (simulate_win)
                    // Note: In production, you'd check a "processed_games" table first 
                    // to ensure you don't pay twice if this script runs twice.
                    // For MVP, we assume the Cron only fires once.
                    await supabase.rpc('simulate_win', { p_team_id: teamData.id });
                    
                    log.push(`Paid out: ${teamData.name} (${winnerTicker})`);
                    payoutCount++;
                }
            }
        }
    }

    return NextResponse.json({ 
        success: true, 
        message: `Processed ${dateStr}`, 
        updates: log 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}