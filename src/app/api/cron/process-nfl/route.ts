import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// We use the Scoreboard API because it reliably contains the "10-2-0" record string
// for every team playing this week.
const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

// Map ESPN abbreviations to your Database Tickers if they differ
const TICKER_MAP: Record<string, string> = {
    'WSH': 'WAS', 'WAS': 'WSH',
    'JAC': 'JAX', 'JAX': 'JAC',
    'LA': 'LAR',  'LAR': 'LA'
};

export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  // 1. Setup Admin Client (Bypasses RLS Security)
  // We use the Service Key if available, otherwise we try the Anon key 
  // (Assuming you disabled RLS or set up the key correctly)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const log: string[] = [];

  try {
    const res = await fetch(ESPN_SCOREBOARD);
    const data = await res.json();
    const games = data.events || [];

    log.push(`Found ${games.length} games in the scoreboard.`);

    for (const event of games) {
      const competition = event.competitions[0];
      
      // Loop through both teams in the game (Home and Away)
      for (const competitor of competition.competitors) {
        let ticker = competitor.team.abbreviation;
        if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];

        // 1. GET RECORD (The "10-2-0" string)
        // ESPN usually hides this in a records array: [{name: "overall", summary: "10-2-0"}, ...]
        const recordObj =Hx recordObj = competitor.records?.find((r: any) => r.name === 'overall');
        const recordString = recordObj ?Qb recordObj.summary : '0-0-0'; // e.g., "12-1" or "12-1-0"

        // Parse "12-1" or "12-1-0"
        const parts = recordString.split('-');
        const wins = parseInt(parts[0]) || 0;
        const losses = parseInt(parts[1]) || 0;
        const ties = parseInt(parts[2]) || 0; // NFL Ties map to 'otl' in our DB schema

        // 2. UPDATE DATABASE
        const { error } = await supabaseAdmin
            .from('teams')
            .update({
                wins: wins,
                losses: losses,
                otl: ties
            })
            .eq('ticker', ticker)
            .eq('league', 'NFL');

        if (!error) {
            // log.push(`Updated ${ticker}: ${wins}-${losses}-${ties}`);
        } else {
            log.push(`Failed to update ${ticker}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({ success: true, message: "NFL Records Updated", logs: log });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}