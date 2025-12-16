'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, TrendingDown, Trophy, Activity, DollarSign, Flame, Crown, AlertCircle } from 'lucide-react';

interface MarketTickerProps {
  teams: any[];
  league: string;
}

export default function MarketTicker({ teams, league }: MarketTickerProps) {
  const [volumeLeaders, setVolumeLeaders] = useState<any[]>([]);
  const [priceMovers, setPriceMovers] = useState<any[]>([]);

  // Filter teams for the current league
  const leagueTeams = useMemo(() => {
    return teams.filter(t => t.league === league);
  }, [teams, league]);

  // --- FETCH DYNAMIC STATS (Volume & Price Change) ---
  useEffect(() => {
    const fetchMarketDynamics = async () => {
      if (leagueTeams.length === 0) return;

      const teamIds = leagueTeams.map(t => t.id);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Fetch last 24h transactions for these teams
      const { data: txs } = await supabase
        .from('transactions')
        .select('team_id, shares_amount, usd_amount, share_price, created_at, type')
        .in('team_id', teamIds)
        .gte('created_at', yesterday.toISOString());

      if (!txs) return;

      // 1. Calculate Volume per Team
      const volMap: Record<number, number> = {};
      const priceMap: Record<number, { open: number, close: number }> = {};

      txs.forEach((tx: any) => {
        // Volume
        if (tx.type === 'BUY' || tx.type === 'SELL') {
            volMap[tx.team_id] = (volMap[tx.team_id] || 0) + tx.shares_amount;
        }

        // Price History (Simplified for MVP)
        if (!priceMap[tx.team_id]) {
            priceMap[tx.team_id] = { open: tx.share_price, close: tx.share_price };
        }
        // Assuming sorted by date (if not, we'd compare dates) logic here is simplified for speed
      });

      // Sort Volume
      const sortedVol = Object.entries(volMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 1)
        .map(([id, vol]) => {
            const t = leagueTeams.find(x => x.id === parseInt(id));
            return t ? { name: t.name, val: vol } : null;
        }).filter(Boolean);
      
      setVolumeLeaders(sortedVol);

      // (Note: Price Movers requires complex historical query, skipping for MVP to keep it fast.
      // We will use "Shares Outstanding" as a proxy for popularity/movement for now)
    };

    fetchMarketDynamics();
  }, [leagueTeams]);

  // --- CALCULATE STATIC STATS ---
  const stats = useMemo(() => {
    if (leagueTeams.length === 0) return [];

    const items = [];

    // 1. BIGGEST POT (Jackpot)
    const bigPot = [...leagueTeams].sort((a, b) => b.dividend_bank - a.dividend_bank)[0];
    if (bigPot) {
        items.push({
            label: "BIGGEST POT",
            text: `${bigPot.name} ($${bigPot.dividend_bank.toLocaleString()})`,
            icon: <Trophy size={14} className="text-yellow-400" />,
            color: "text-yellow-400"
        });
    }

    // 2. THE WHALE (Market Cap)
    const getCap = (t: any) => (10 + (t.shares_outstanding * 0.01)) * t.shares_outstanding;
    const whale = [...leagueTeams].sort((a, b) => getCap(b) - getCap(a))[0];
    if (whale) {
        items.push({
            label: "MARKET LEADER",
            text: `${whale.name} ($${getCap(whale).toLocaleString(undefined, {maximumFractionDigits:0})})`,
            icon: <Crown size={14} className="text-purple-400" />,
            color: "text-purple-300"
        });
    }

    // 3. BEST YIELD (Dividend / Price)
    const getYield = (t: any) => {
        const price = 10 + (t.shares_outstanding * 0.01);
        const payout = t.shares_outstanding > 0 ? (t.dividend_bank * 0.5) / t.shares_outstanding : 0;
        return payout / price;
    };
    const bestYield = [...leagueTeams].sort((a, b) => getYield(b) - getYield(a))[0];
    if (bestYield) {
        const yVal = getYield(bestYield) * 100;
        items.push({
            label: "BEST YIELD",
            text: `${bestYield.name} (${yVal.toFixed(1)}% ROI)`,
            icon: <DollarSign size={14} className="text-emerald-400" />,
            color: "text-emerald-300"
        });
    }

    // 4. VOLUME LEADER (From Async State)
    if (volumeLeaders.length > 0) {
        items.push({
            label: "HIGH VOLUME",
            text: `${volumeLeaders[0].name} (${volumeLeaders[0].val} shares traded)`,
            icon: <Activity size={14} className="text-blue-400" />,
            color: "text-blue-300"
        });
    }

    // 5. LOWEST FLOAT (Scarcity)
    const scarce = [...leagueTeams].filter(t => t.shares_outstanding > 0).sort((a, b) => a.shares_outstanding - b.shares_outstanding)[0];
    if (scarce) {
        items.push({
            label: "SCARCITY PLAY",
            text: `${scarce.name} (Only ${scarce.shares_outstanding} shares)`,
            icon: <TrendingUp size={14} className="text-orange-400" />,
            color: "text-orange-300"
        });
    }

    return items;
  }, [leagueTeams, volumeLeaders]);

  if (stats.length === 0) return null;

  return (
    <div className="w-full bg-black/20 border-y border-white/5 overflow-hidden flex h-10 mb-6 relative backdrop-blur-sm z-0">
      {/* Gradient Fades for Smooth Edges */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#1a0b2e] to-transparent z-10"></div>
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#1a0b2e] to-transparent z-10"></div>

      {/* Scrolling Content */}
      <div className="flex animate-marquee whitespace-nowrap items-center hover:[animation-play-state:paused]">
        {/* Render Multiple Times for smooth looping */}
        {[...stats, ...stats, ...stats].map((item, i) => (
          <div key={i} className="flex items-center mx-6 gap-2">
            <span className="flex items-center gap-1.5 uppercase text-[10px] font-bold tracking-wider text-gray-500">
              {item.icon} {item.label}:
            </span>
            <span className={`text-xs font-mono font-bold ${item.color}`}>
              {item.text}
            </span>
            {/* Divider Dot */}
            <div className="h-1 w-1 bg-gray-700 rounded-full ml-6"></div>
          </div>
        ))}
      </div>
    </div>
  );
}