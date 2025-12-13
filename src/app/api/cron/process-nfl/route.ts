import { NextResponse } from 'next/server';

const ESPN_NFL_STANDINGS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings';

export const dynamic = 'force-dynamic'; 

export async function GET(request: Request) {
  try {
    console.log("--- STARTING DIAGNOSTIC ---");
    
    const res = await fetch(ESPN_NFL_STANDINGS);
    const data = await res.json();
    
    // 1. Root
    console.log(`Root Keys: ${Object.keys(data).join(', ')}`);
    
    const conferences = data.children || [];
    if (conferences.length === 0) {
        console.log("CRITICAL: 'children' (conferences) is empty.");
        return NextResponse.json({ success: false });
    }

    // 2. Division
    // Digging deeper...
    const firstDiv = conferences[0]?.children?.[0];
    if (!firstDiv) {
        console.log("CRITICAL: Division not found.");
        return NextResponse.json({ success: false });
    }
    console.log(`Division: ${firstDiv.name}`);

    // 3. Entries (Teams)
    // Check if 'standings' exists or if it's direct
    if (!firstDiv.standings) {
         console.log("CRITICAL: 'standings' object is MISSING on Division.");
         console.log(`Division Keys: ${Object.keys(firstDiv).join(', ')}`);
    } else {
        const entries = firstDiv.standings.entries || [];
        console.log(`Entries (Teams) Count: ${entries.length}`);
        
        if (entries.length > 0) {
            const firstTeam = entries[0];
            console.log(`Team: ${firstTeam.team.displayName} (${firstTeam.team.abbreviation})`);
            
            // 4. STATS CHECK
            if (!firstTeam.stats) {
                console.log("CRITICAL: 'stats' array is MISSING.");
                console.log(`Team Keys: ${Object.keys(firstTeam).join(', ')}`);
            } else {
                console.log(`Stats Array Length: ${firstTeam.stats.length}`);
                // PRINT THE ACTUAL STATS
                if (firstTeam.stats.length > 0) {
                    // Print the first 3 stats so we can see the format
                    const sample = firstTeam.stats.slice(0, 3);
                    console.log("SAMPLE STATS DATA:", JSON.stringify(sample, null, 2));
                }
            }
        }
    }

    console.log("--- DIAGNOSTIC COMPLETE ---");
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("ERROR:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}