import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

export async function GET(request: Request) {
  // 1. SECURITY
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
      const ticker = teamNode.teamAbbrev.default;
      const wins = teamNode.wins;
      const losses = teamNode.losses;
      const otl = teamNode.otLosses;

      await supabase.from('teams').update({ wins, losses, otl }).eq('ticker', ticker);
    }
    log.push('Standings updated.');

    // --- PART B: UPDATE NEXT GAME SCHEDULE ---
    // We fetch the schedule for "now" which gives us this week's games
    const scheduleRes = await fetch(`${NHL_API_BASE}/schedule/now`);
    const scheduleData = await scheduleRes.json();
    
    // We need to track which teams we've already found a next game for
    // so we don't overwrite a Tuesday game with a Thursday game.
    const teamsUpdated = new Set(); 

    for (const day of scheduleData.gameWeek) {
        for (const game of day.games) {
            // Process Home Team
            const homeTicker = game.homeTeam.abbrev;
            if (!teamsUpdated.has(homeTicker)) {
                await supabase.from('teams').update({
                    next_game_at: game.startTimeUTC,
                    next_opponent: `@ ${game.awayTeam.abbrev}` // e.g. "@ BOS"
                }).eq('ticker', homeTicker);
                teamsUpdated.add(homeTicker);
            }

            // Process Away Team
            const awayTicker = game.awayTeam.abbrev;
            if (!teamsUpdated.has(awayTicker)) {
                await supabase.from('teams').update({
                    next_game_at: game.startTimeUTC,
                    next_opponent: `vs ${game.homeTeam.abbrev}` // e.g. "vs NYR"
                }).eq('ticker', awayTicker);
                teamsUpdated.add(awayTicker);
            }
        }
    }
    log.push('Next games updated.');

    // --- PART C: PROCESS YESTERDAY'S GAMES (PAYOUTS) ---
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const scoreRes = await fetch(`${NHL_API_BASE}/score/${dateStr}`);
    const scoreData = await scoreRes.json();

    for (const game of scoreData.games) {
        if (game.gameState === 'OFF' || game.gameState === 'FINAL') {
            const home = game.homeTeam;
            const away = game.awayTeam;
            
            let winnerTicker = null;
            if (home.score > away.score) winnerTicker = home.abbrev;
            else if (away.score > home.score) winnerTicker = away.abbrev;

            if (winnerTicker) {
                const { data: teamData } = await supabase
                    .from('teams')
                    .select('id, name')
                    .eq('ticker', winnerTicker)
                    .single();

                if (teamData) {
                    await supabase.rpc('simulate_win', { p_team_id: teamData.id });
                    log.push(`Paid out: ${teamData.name} (${winnerTicker})`);
                }
            }
        }
    }

    return NextResponse.json({ success: true, updates: log });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}