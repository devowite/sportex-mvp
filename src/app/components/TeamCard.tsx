'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronDown, ChevronUp, HelpCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TeamCardProps {
  team: any;
  myShares: number;
  onTrade: (team: any) => void;
  // FIX 1: Add '?' to make this optional
  onSimWin?: (id: number, name: string) => void;
}

export default function TeamCard({ team, myShares, onTrade, onSimWin }: TeamCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [changePercent, setChangePercent] = useState(0);

  // --- MATH ---
  const currentPrice = 10.00 + (team.shares_outstanding * 0.01);
  const estPayoutPerShare = team.shares_outstanding > 0 
    ? (team.dividend_bank * 0.50) / team.shares_outstanding 
    : 0;
  const myTotalPayout = myShares * estPayoutPerShare;
  const myTotalValue = myShares * currentPrice;

  // --- FETCH HISTORY ---
  useEffect(() => {
    const loadHistory = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('created_at, share_price')
        .eq('team_id', team.id)
        .order('created_at', { ascending: true })
        .limit(50);
      
      let rawData = data || [];

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
    };

    loadHistory();
  }, [team.id, currentPrice, isExpanded]); 

  // --- VOLATILITY LOGIC ---
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
  const graphColor = isPositive ? '#4ade80' : '#f87171'; 

  return (
    <div 
      className={`bg-gray-800 rounded-xl border border-gray-700 transition-all duration-300 shadow-lg overflow-visible ${isExpanded ? 'ring-2 ring-blue-500/50' : 'hover:border-blue-500'}`}
    >
      {/* --- HEADER --- */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`p-4 cursor-pointer bg-gray-800 hover:bg-gray-800/80 transition ${isExpanded ? 'rounded-t-xl' : 'rounded-xl'}`}
      >
        <div className="flex justify-between items-center mb-3">
             <h3 className="font-bold text-white text-md truncate pr-2">{team.name}</h3>
			 {/* RECORD DISPLAY */}
<div className="text-[10px] text-gray-500 font-mono mt-0.5">
    {team.wins || 0}-{team.losses || 0}-{team.otl || 0}
</div>
             <div className="text-gray-500 hover:text-white transition shrink-0">
                {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </div>
        </div>

        <div className="flex items-center justify-between">
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
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black border border-gray-700 rounded text-[9px] text-white z-50 pointer-events-none whitespace-nowrap">
                          24h Price Change
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
                <div className="flex flex-col">
                    <span className="text-blue-300">Owned: <span className="font-bold text-white">{myShares}</span></span>
                    <span className="text-[10px] text-gray-500">(Value: ${myTotalValue.toFixed(2)})</span>
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
                        <XAxis 
                            dataKey="label" 
                            hide={false} 
                            tick={{fontSize: 10, fill: '#6b7280'}} 
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis 
                            domain={['auto', 'auto']} 
                            orientation="right"
                            tick={{fontSize: 10, fill: '#6b7280'}} 
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value.toFixed(2)}`}
                            padding={{ top: 20, bottom: 20 }}
                            width={45} 
                        />
                        <Area 
                            type="monotone" 
                            dataKey="price" 
                            stroke={graphColor} 
                            fillOpacity={1} 
                            fill={`url(#gradient-${team.id})`} 
                            strokeWidth={2}
                        />
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
                        <div className="hidden group-hover:block absolute bottom-full left-0 mb-2 w-48 p-2 bg-black border border-gray-700 rounded shadow-xl text-[10px] text-gray-300 z-50 pointer-events-none">
                            <p className="mb-1 text-white font-bold">Volatility Indicator</p>
                            Higher Reserve = Stable Price.<br/>
                            Lower Reserve = Price swings wildly on small trades.
                        </div>
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
                <button 
                onClick={(e) => { e.stopPropagation(); onTrade(team); }}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-bold transition shadow-md"
                >
                Trade
                </button>
                
                {/* FIX 2: Only show this button if onSimWin is provided */}
                {onSimWin && (
                    <button 
                    onClick={(e) => { e.stopPropagation(); onSimWin(team.id, team.name); }}
                    className="px-3 bg-gray-700 hover:bg-green-700 text-gray-400 hover:text-white rounded-lg text-xs uppercase font-bold transition"
                    >
                    Sim Win
                    </button>
                )}
            </div>
        </div>
      )}
    </div>
  );
}