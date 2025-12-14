import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 1. SETUP ADMIN CLIENT (Bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 2. SECURITY CHECK
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const log = [];

    // --- PART A: UPDATE STANDINGS ---
    const standingsRes = await fetch(`${NHL_API_BASE}/standings/now`);
    const standingsData = await standingsRes.json();

    for (const teamNode of standingsData.standings) {
      const ticker = teamNode.teamAbbrev.default;
      // Update stats
      await supabaseAdmin.from('teams').update({ 
          wins: teamNode.wins, 
          losses: teamNode.losses, 
          otl: teamNode.otLosses 
      }).eq('ticker', ticker);
    }

    // --- PART B: PROCESS GAMES (Yesterday + Today) ---
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const datesToCheck = [
        yesterday.toISOString().split('T')[0],
        today.toISOString().split('T')[0]
    ];

    for (const dateStr of datesToCheck) {
        const scoreRes = await fetch(`${NHL_API_BASE}/score/${dateStr}`);
        const scoreData = await scoreRes.json();

        for (const game of scoreData.games) {
            // 1. Check if game is Final
            if (game.gameState === 'OFF' || game.gameState === 'FINAL') {
                const gameId = String(game.id);

                // 2. IDEMPOTENCY CHECK (Using Admin Client)
                const { data: existing } = await supabaseAdmin
                    .from('processed_games')
                    .select('game_id')
                    .eq('game_id', gameId)
                    .maybeSingle(); // Safer than .single()

                if (existing) continue; // Skip if already paid

                // 3. Determine Winner
                const home = game.homeTeam;
                const away = game.awayTeam;
                let winnerTicker = null;
                
                if (home.score > away.score) winnerTicker = home.abbrev;
                else if (away.score > home.score) winnerTicker = away.abbrev;

                if (winnerTicker) {
                    // 4. Pay Winner
                    const { data: teamData } = await supabaseAdmin
                        .from('teams')
                        .select('id, name')
                        .eq('ticker', winnerTicker)
                        .eq('league', 'NHL')
                        .single();

                    if (teamData) {
                        await supabaseAdmin.rpc('simulate_win', { p_team_id: teamData.id });
                        log.push(`Paid out: ${teamData.name} (${winnerTicker})`);
                    }
                }

                // 5. MARK AS PROCESSED (Fixing the NFL label bug here)
                await supabaseAdmin.from('processed_games').insert({ 
                    game_id: gameId, 
                    league: 'NHL' 
                });
            }
        }
    }

    return NextResponse.json({ success: true, updates: log });

  } catch (error: any) {
    console.error("NHL Cron Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}