import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// FIX 1: UPDATED URL (Added /site/)
const ESPN_NFL_STANDINGS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings';
const ESPN_NFL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const TICKER_MAP: Record<string, string> = {
    'WSH': 'WAS', 'WAS': 'WSH',
    'JAC': 'JAX', 'JAX': 'JAC',
    'LA': 'LAR',  'LAR': 'LA'
};

export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  // Use Admin Client (Bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const log: string[] = [];

  try {
    // --- 1. FETCH STANDINGS ---
    const res = await fetch(ESPN_NFL_STANDINGS);
    if (!res.ok) throw new Error(`ESPN API Failed: ${res.status}`);
    
    const data = await res.json();
    const conferences = data.children || [];
    
    // --- DEBUG: INSPECT FIRST TEAM ---
    // This puts the exact JSON structure into your Vercel Logs so we can verify keys
    try {
        const firstStat = conferences[0]?.children[0]?.standings?.entries[0]?.stats[0];
        console.log("DEBUG: First Stat Object looks like:", JSON.stringify(firstStat));
        log.push(`DEBUG: Sample Stat Key: ${firstStat?.name || firstStat?.type || 'UNKNOWN'}`);
    } catch (e) {}

    // --- 2. LOOP THROUGH TEAMS ---
    for (const conf of conferences) {
        for (const div of conf.children || []) {
            for (const teamEntry of div.standings.entries || []) {
                let ticker = teamEntry.team.abbreviation;
                if (TICKER_MAP[ticker]) ticker = TICKER_MAP[ticker];

                const stats = teamEntry.stats || [];

                // FIX 2: ROBUST PARSING (Check 'name' AND 'type')
                // specific stat objects often look like { name: "wins", value: 10 }
                const getStat = (key: string) => {
                    const found = stats.find((s: any) => 
                        (s.name === key) || (s.type === key) || (s.shortDisplayName === key)
                    );
                    return found ? found.value : 0;
                };

                const wins = getStat('wins');
                const losses = getStat('losses');
                const ties = getStat('ties');

                // Update DB
                const { error } = await supabaseAdmin
                    .from('teams')
                    .update({ wins, losses, otl: ties })
                    .eq('ticker', ticker)
                    .eq('league', 'NFL');

                if (error) log.push(`Error ${ticker}: ${error.message}`);
            }
        }
    }
    
    log.push('Records Updated Successfully.');
    return NextResponse.json({ success: true, logs: log });

  } catch (error: any) {
    console.error("CRON ERROR:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}