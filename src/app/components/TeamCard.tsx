'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp, HelpCircle, TrendingUp, TrendingDown, CalendarClock, History } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TeamCardProps {
  team: any;
  myShares: number;
  onTrade: (team: any) => void;
  onSimWin?: (id: number, name: string) => void;
  userId?: string;
}

export default function TeamCard({ team, myShares, onTrade, onSimWin, userId }: TeamCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [changePercent, setChangePercent] = useState(0);
  const [avgCost, setAvgCost] = useState(0);
  
  // --- LAST 5 STATE ---
  const [showLast5, setShowLast5] = useState(false);
  const [last5Games, setLast5Games] = useState<any[]>([]);
  const [loadingLast5, setLoadingLast5] = useState(false);

  // --- MATH ---
  const currentPrice = 10.00 + (team.shares_outstanding * 0.01);
  const estPayoutPerShare = team.shares_outstanding > 0 
    ? (team.dividend_bank * 0.50) / team.shares_outstanding 
    : 0;
  const myTotalPayout = myShares * estPayoutPerShare;
  const myTotalValue = myShares * currentPrice;

  // --- LOGO URL ---
  let logoUrl = '';
  if (team.league === 'NFL') {
      logoUrl = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.ticker}.png`;
  } else {
      logoUrl = `https://assets.nhle.com/logos/nhl/svg/${team.ticker}_light.svg`;
  }

  const getNextGameText = () => {
    if (!team.next_game_at) return 'TBD';
    const gameDate = new Date(team.next_game_at);
    const today = new Date();
    const isToday = gameDate.getDate() === today.getDate() && gameDate.getMonth() === today.getMonth();
    const timeStr = gameDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Tonight ${timeStr}`;
    const dayName = gameDate.toLocaleDateString('en-US', { weekday: 'short' });
    return `${dayName} ${timeStr}`;
  };

  // --- FETCH LAST 5 (ON HOVER) ---
  const handleLast5Hover = async () => {
    setShowLast5(true);
    if (last5Games.length > 0 || loadingLast5) return; // Cache hit

    setLoadingLast5(true);
    try {
        const results = [];
        
        if (team.league === 'NHL') {
            // NHL API
            const res = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${team.ticker}/now`);
            const data = await res.json();
            const games = data.games || [];
            // Filter completed games, sort desc, take 5
            const completed = games.filter((g: any) => g.gameState === 'FINAL').reverse().slice(0, 5);
            
            for (const g of completed) {
                const isHome = g.homeTeam.abbrev === team.ticker;
                const myScore = isHome ? g.homeTeam.score : g.awayTeam.score;
                const oppScore = isHome ? g.awayTeam.score : g.homeTeam.score;
                const oppTicker = isHome ? g.awayTeam.abbrev : g.homeTeam.abbrev;
                
                let result = 'L';
                if (myScore > oppScore) result = 'W';
                // Very basic OTL check (if game went to OT/SO but we lost)
                if (myScore < oppScore && g.gameType > 2) result = 'OTL'; 

                results.push({ opp: oppTicker, result, score: `${myScore}-${oppScore}` });
            }
        } else {
            // NFL API (ESPN)
            // Handle Ticker Mappings for ESPN
            let searchTicker = team.ticker;
            if(searchTicker === 'WSH') searchTicker = 'WAS';
            if(searchTicker === 'JAX') searchTicker = 'JAC'; // ESPN uses JAC sometimes

            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${searchTicker}/schedule`);
            const data = await res.json();
            const events = data.events || [];
            
            // Filter completed
            const completed = events.filter((e: any) => e.competitions[0].status.type.completed).reverse().slice(0, 5);

            for (const e of completed) {
                const game = e.competitions[0];
                const myTeam = game.competitors.find((c: any) => c.team.abbreviation === searchTicker || c.team.id === team.id);
                const oppTeam = game.competitors.find((c: any) => c.team.abbreviation !== searchTicker && c.team.id !== team.id);
                
                if (myTeam && oppTeam) {
                    const isWin = myTeam.winner === true;
                    results.push({ 
                        opp: oppTeam.team.abbreviation, 
                        result: isWin ? 'W' : 'L', 
                        score: `${myTeam.score?.value}-${oppTeam.score?.value}` 
                    });
                }
            }
        }
        setLast5Games(results);
    } catch (e) {
        console.error("Error fetching last 5", e);
    }
    setLoadingLast5(false);
  };

  // --- DATA FETCHING (EXISTING) ---
  useEffect(() => {
    const loadData = async () => {
      const { data: graphData } = await supabase
        .from('transactions')
        .select('created_at, share_price')
        .eq('team_id', team.id)
        .order('created_at', { ascending: true })
        .limit(50);
      
      let rawData = graphData || [];
      let chartData = rawData.map((t: any) => ({
        label: new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: t.share_price
      }));

      if (chartData.length === 0) {
         chartData = [{ label: 'IPO', price: 10.00 }];
      } else {
         chartData.unshift({ label: 'IPO', price: 10.00 });
      }
      chartData.push({ label: 'Now', price: currentPrice });
      setHistory(chartData);

      const startPrice = chartData[0].price;
      const change = ((currentPrice - startPrice) / startPrice) * 100;
      setChangePercent(change);

      if (myShares > 0 && userId) {
        const { data: myBuys } = await supabase
            .from('transactions')
            .select('usd_amount, shares_amount')
            .eq('user_id', userId)
            .eq('team_id', team.id)
            .eq('type', 'BUY');
        
        if (myBuys && myBuys.length > 0) {
            let totalSpent = 0;
            let totalBought = 0;
            myBuys.forEach((t: any) => {
                totalSpent += t.usd_amount;
                totalBought += t.shares_amount;
            });
            if (totalBought > 0) {
                setAvgCost(totalSpent / totalBought);
            }
        }
      }
    };
    loadData();
  }, [team.id, currentPrice, myShares, userId]); 

  // Volatility Logic
  let volatilityLabel = 'Neutral';
  let volatilityColor = 'text-yellow-500';
  let volatilityBg = 'bg-yellow-500/10 border-yellow-500/20';

  if (team.reserve_pool < 2000) {
    volatilityLabel = 'High Volatility';
    volatilityColor = 'text-red-400';
    volatilityBg = 'bg-red-500/10 border-red-500/20';
  } else if (team.reserve_pool > 8000) {
    volatilityLabel = 'Stable';
    volatilityColor = 'text-blue-400';
    volatilityBg = 'bg-blue-500/10 border-blue-500/20';
  }

  const isPositive = changePercent >= 0;
  const isProfit = currentPrice >= avgCost;
  const graphColor = isPositive ? '#4ade80' : '#f87171'; 

  return (
    <div 
      className={`bg-gray-800 rounded-xl border border-gray-700 transition-all duration-300 shadow-lg overflow-hidden ${isExpanded ? 'ring-2 ring-blue-500/50' : 'hover:border-blue-500'}`}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: team.color || '#374151' }}></div>

      {/* --- HEADER --- */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 cursor-pointer bg-gray-800 hover:bg-gray-800/80 transition"
      >
        <div className="flex justify-between items-start mb-3">
             <div className="flex items-start gap-3 w-full">
                {/* TEAM LOGO */}
                <div className="h-12 w-12 bg-white/5 rounded-full p-0.5 flex items-center justify-center border border-white/10 shadow-inner flex-shrink-0">
                    <img 
                        src={logoUrl} 
                        alt={team.ticker} 
                        className="w-full h-full object-contain drop-shadow-md"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                </div>

                {/* TEAM INFO */}
                <div className="flex flex-col w-full pr-2">
                    <h3 className="font-bold text-white text-md leading-tight mb-1">
                        {team.name}
                    </h3>
                    
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-gray-500 font-mono bg-gray-900 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {team.wins || 0}-{team.losses || 0}-{team.otl || 0}
                        </span>
                        
                        <span className="text-gray-700 text-[10px] hidden sm:inline">•</span>

                        <div className="flex items-center gap-1.5 text-[10px] text-blue-300 whitespace-nowrap">
                            <CalendarClock size={12} />
                            <span className="font-bold">{team.next_opponent || '--'}</span>
                            <span className="text-gray-400 hidden sm:inline">{getNextGameText()}</span>
                        </div>

                        {/* --- LAST 5 FEATURE --- */}
                        <div 
                            className="relative group ml-auto sm:ml-0"
                            onMouseEnter={handleLast5Hover}
                            onMouseLeave={() => setShowLast5(false)}
                        >
                            <span className="flex items-center gap-1 text-[9px] font-bold text-gray-500 bg-gray-900/50 px-1.5 py-0.5 rounded cursor-help hover:text-gray-300 transition border border-transparent hover:border-gray-700">
                                <History size={10} /> Last 5
                            </span>

                            {/* TOOLTIP WINDOW */}
                            {showLast5 && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-black border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                                    <div className="bg-gray-900 px-2 py-1 border-b border-gray-800 text-[10px] text-gray-400 font-bold text-center">
                                        Recent Form
                                    </div>
                                    <div className="p-1 space-y-0.5">
                                        {loadingLast5 ? (
                                            <p className="text-[9px] text-gray-500 text-center py-2">Loading...</p>
                                        ) : last5Games.length > 0 ? (
                                            last5Games.map((g, i) => (
                                                <div key={i} className="flex justify-between items-center text-[10px] px-2 py-0.5 rounded hover:bg-gray-800">
                                                    <span className="text-gray-400 w-8">vs {g.opp}</span>
                                                    <span className="text-gray-600 font-mono">{g.score}</span>
                                                    <span className={`font-bold w-4 text-right ${
                                                        g.result === 'W' ? 'text-green-400' : 'text-red-400'
                                                    }`}>
                                                        {g.result}
                                                    </span>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-[9px] text-gray-500 text-center py-2">No data</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
             </div>

             <div className="text-gray-500 hover:text-white transition shrink-0 pt-1 pl-1">
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </div>
        </div>

        {/* --- PRICE & PAYOUT --- */}
        <div className="flex items-center justify-between mt-3 pl-1">
           <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Price</span>
              <div className="flex items-center gap-2">
                  <span className="font-mono text-white font-bold text-lg">
                    ${currentPrice.toFixed(2)}
                  </span>
                  
                  <div className="relative group cursor-help">
                      <div className={`flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {isPositive ? <TrendingUp size={10} className="mr-1"/> : <TrendingDown size={10} className="mr-1"/>}
                          {Math.abs(changePercent).toFixed(1)}%
                      </div>
                  </div>
              </div>
           </div>

           <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Payout/Win/Share</span>
              <div className="flex items-center gap-1 text-green-400">
                <span className="font-mono font-bold text-lg">${estPayoutPerShare.toFixed(2)}</span>
              </div>
           </div>
        </div>

        {myShares > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-700 flex justify-between items-center text-xs">
                <div className="flex flex-col gap-0.5">
                    <div>
                        <span className="text-blue-300">Owned: <span className="font-bold text-white">{myShares}</span></span>
                        <span className="text-[10px] text-gray-500 ml-1">(Value: ${myTotalValue.toFixed(2)})</span>
                    </div>
                    {avgCost > 0 && (
                        <div className="text-[10px]">
                            <span className="text-gray-500">Avg Cost: </span>
                            <span className={`font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                ${avgCost.toFixed(2)}
                            </span>
                        </div>
                    )}
                </div>
                <span className="text-green-400 font-bold">Payout per Win: ${myTotalPayout.toFixed(2)}</span>
            </div>
        )}
      </div>

      {/* --- EXPANDED --- */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-2 duration-200 bg-gray-800/50 rounded-b-xl">
            
            <div className="h-40 w-full mt-2 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={history}>
                        <defs>
                            <linearGradient id={`gradient-${team.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={graphColor} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={graphColor} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                            labelFormatter={(label) => label} 
                        />
                        <XAxis dataKey="label" hide={false} tick={{fontSize: 10, fill: '#6b7280'}} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={['auto', 'auto']} orientation="right" tick={{fontSize: 10, fill: '#6b7280'}} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value.toFixed(2)}`} padding={{ top: 20, bottom: 20 }} width={45} />
                        <Area type="monotone" dataKey="price" stroke={graphColor} fillOpacity={1} fill={`url(#gradient-${team.id})`} strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="h-px bg-gray-700 mb-3"></div>

            <div className="space-y-2 mb-4 text-xs">
                <div className="flex justify-between">
                    <span className="text-gray-400">Total Supply</span>
                    <span className="font-mono text-gray-300">{team.shares_outstanding}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Dividend Bank</span>
                    <span className="font-mono text-yellow-500">${team.dividend_bank.toFixed(2)}</span>
                </div>
                
                <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-1 group cursor-help relative">
                        <span className="text-gray-400 border-b border-dotted border-gray-600">Liquidity (Reserve)</span>
                        <HelpCircle size={12} className="text-gray-500 hover:text-white" />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${volatilityBg} ${volatilityColor}`}>
                            {volatilityLabel}
                        </span>
                        <span className="font-mono text-gray-400">${team.reserve_pool.toFixed(0)}</span>
                    </div>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={(e) => { e.stopPropagation(); onTrade(team); }} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-bold transition shadow-md">Trade</button>
                {onSimWin && (
                    <button onClick={(e) => { e.stopPropagation(); onSimWin(team.id, team.name); }} className="px-3 bg-gray-700 hover:bg-green-700 text-gray-400 hover:text-white rounded-lg text-xs uppercase font-bold transition">Sim Win</button>
                )}
            </div>
        </div>
      )}
    </div>
  );
}