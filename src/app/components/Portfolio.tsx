'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Wallet, Filter, Trophy, History, ChevronDown, Layers } from 'lucide-react';

interface PortfolioProps {
  user: any;
  holdings: Record<number, number>;
  teams: any[];
}

export default function Portfolio({ user, holdings, teams }: PortfolioProps) {
  // Filters
  const [timeFilter, setTimeFilter] = useState<'1D' | '1M' | '1Y' | 'ALL'>('ALL');
  
  // Data State
  const [portfolioData, setPortfolioData] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  
  // UI State
  const [visibleTxCount, setVisibleTxCount] = useState(10); 

  // Stats State
  const [stats, setStats] = useState({
    totalEquity: 0,
    filteredWinPayouts: 0, 
  });

  // --- 1. FETCH DATA & CALCULATE ---
  useEffect(() => {
    const buildPortfolio = async () => {
      if (!user) return;

      // A. Fetch ALL transactions (Desc order)
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const allTxs = txs || [];
      setAllTransactions(allTxs);

      // --- B. CALCULATE FILTERED WIN PAYOUTS ---
      const now = new Date();
      const cutoff = new Date();
      
      if (timeFilter === '1D') cutoff.setDate(now.getDate() - 1);
      if (timeFilter === '1M') cutoff.setMonth(now.getMonth() - 1);
      if (timeFilter === '1Y') cutoff.setFullYear(now.getFullYear() - 1);
      if (timeFilter === 'ALL') cutoff.setFullYear(1970); 

      let periodDividends = 0;
      allTxs.forEach((t: any) => {
          const txDate = new Date(t.created_at);
          if (t.type === 'DIVIDEND' && txDate >= cutoff) {
              periodDividends += t.usd_amount;
          }
      });

      // --- C. BUILD HOLDINGS TABLE ---
      const ownedTeamIds = Object.keys(holdings).map(Number);
      let totalEq = 0;
      
      const rows = ownedTeamIds.map((teamId) => {
        const team = teams.find((t) => t.id === teamId);
        if (!team) return null;

        const shares = holdings[teamId];
        if (shares <= 0) return null;

        const currentPrice = 10.00 + (team.shares_outstanding * 0.01);
        const marketValue = shares * currentPrice;

        // 1. Calc Weighted Avg Cost (FIFO-style for Current Position)
        // Filter transactions for this team and sort oldest -> newest
        const teamTxs = allTxs
            .filter((t: any) => t.team_id === teamId)
            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        let runningHoldings = 0;
        let runningTotalCost = 0;

        teamTxs.forEach((t: any) => {
            if (t.type === 'BUY') {
                runningHoldings += t.shares_amount;
                runningTotalCost += t.usd_amount;
            } else if (t.type === 'SELL') {
                // Reduce cost basis proportionally to shares sold
                const currentAvg = runningHoldings > 0 ? runningTotalCost / runningHoldings : 0;
                runningTotalCost -= (currentAvg * t.shares_amount);
                runningHoldings -= t.shares_amount;
            }
        });

        // If we have shares left, calc the final avg. If 0, fallback to default.
        const avgCost = runningHoldings > 0 ? runningTotalCost / runningHoldings : 10.00;

        // Recalculate totals using the new weighted avgCost
        const totalCost = avgCost * shares;
        const gainLoss = marketValue - totalCost;
        const gainLossPercent = totalCost > 0 ? ((marketValue - totalCost) / totalCost) * 100 : 0;
        // 2. Calc Total Dividends (LTD for this asset)
        // We sum up every transaction of type 'DIVIDEND' for this team
        const totalAssetDividends = allTxs
            .filter((t: any) => t.team_id === teamId && t.type === 'DIVIDEND')
            .reduce((sum: number, t: any) => sum + t.usd_amount, 0);

        totalEq += marketValue;

        return {
          ...team,
          league: team.league || 'NHL', 
          shares,
          currentPrice,
          marketValue,
          avgCost,
          gainLoss,
          gainLossPercent,
          totalAssetDividends // Pass this to the row
        };
      }).filter(Boolean);

      setPortfolioData(rows);
      setStats({
        totalEquity: totalEq,
        filteredWinPayouts: periodDividends
      });
    };

    buildPortfolio();
  }, [user, holdings, teams, timeFilter]);

  // --- HELPER: GROUP BY LEAGUE ---
  const assetsByLeague = portfolioData.reduce((acc: any, row: any) => {
    const lg = row.league || 'Other';
    if (!acc[lg]) acc[lg] = [];
    acc[lg].push(row);
    return acc;
  }, {});

  // --- CHART DATA ---
  const chartData = [
    { name: 'Cash', value: user?.usd_balance || 0, color: '#10b981' }, 
    { name: 'Stocks', value: stats.totalEquity, color: '#3b82f6' },   
  ];
  const totalNetWorth = (user?.usd_balance || 0) + stats.totalEquity;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      
      {/* 1. STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Net Worth */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Wallet size={64} /></div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Net Worth</p>
            <h2 className="text-3xl font-mono text-white font-bold">
                ${totalNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h2>
            <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500"></span> Cash: ${user?.usd_balance.toFixed(0)}
                <span className="h-2 w-2 rounded-full bg-blue-500 ml-2"></span> Equity: ${stats.totalEquity.toFixed(0)}
            </div>
        </div>

        {/* Win Payouts */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={64} /></div>
            <div className="flex justify-between items-start z-10">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Win Payouts</p>
                <div className="bg-gray-900/50 p-1 rounded flex gap-1 border border-gray-700">
                    {['1D', '1M', '1Y', 'ALL'].map((tf) => (
                        <button
                            key={tf}
                            onClick={() => setTimeFilter(tf as any)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                                timeFilter === tf 
                                ? 'bg-gray-700 text-white shadow' 
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {tf}
                        </button>
                    ))}
                </div>
            </div>
            <h2 className="text-3xl font-mono text-yellow-400 font-bold z-10 mt-2">
                ${stats.filteredWinPayouts.toFixed(2)}
            </h2>
            <p className="text-xs text-gray-500 mt-1 z-10">
                {timeFilter === 'ALL' ? 'Lifetime' : `Past ${timeFilter}`} earnings
            </p>
        </div>

        {/* Allocation */}
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center justify-between">
            <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Allocation</p>
                <ul className="text-sm space-y-1 mt-2">
                    <li className="flex items-center gap-2 text-gray-300">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span> Cash ({(user.usd_balance / (totalNetWorth || 1) * 100).toFixed(0)}%)
                    </li>
                    <li className="flex items-center gap-2 text-gray-300">
                        <span className="h-2 w-2 rounded-full bg-blue-500"></span> Stocks ({(stats.totalEquity / (totalNetWorth || 1) * 100).toFixed(0)}%)
                    </li>
                </ul>
            </div>
            <div className="h-24 w-24">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={chartData} dataKey="value" innerRadius={25} outerRadius={40} paddingAngle={5} stroke="none">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* 2. CURRENT HOLDINGS (SPLIT BY MARKET) */}
      <div>
          <div className="flex items-center gap-2 mb-4">
            <Filter size={16} className="text-gray-500" />
            <span className="text-sm font-bold text-gray-300">Current Assets</span>
          </div>

          {Object.keys(assetsByLeague).length > 0 ? Object.keys(assetsByLeague).map((league) => (
              <div key={league} className="mb-6">
                {/* MARKET HEADER */}
                <div className="flex items-center gap-2 mb-2 px-1">
                    <Layers size={14} className="text-blue-500" />
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">{league} Assets</span>
                </div>

                {/* TABLE */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-400">
                        <thead className="bg-gray-900/50 text-xs uppercase font-bold text-gray-500 border-b border-gray-700">
                            <tr>
                                <th className="px-6 py-4">Asset</th>
                                <th className="px-6 py-4 text-right">Shares</th>
                                <th className="px-6 py-4 text-right">Avg Cost</th>
                                <th className="px-6 py-4 text-right">Price</th>
                                {/* NEW COLUMN HEADER */}
                                <th className="px-6 py-4 text-right text-yellow-500">Total Divs</th>
                                <th className="px-6 py-4 text-right">Return</th>
                                <th className="px-6 py-4 text-right">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {assetsByLeague[league].map((row: any) => (
                                <tr key={row.id} className="hover:bg-gray-700/30 transition">
                                    <td className="px-6 py-4 font-bold text-white flex flex-col">
                                        {row.name}
                                        <span className="text-[10px] text-gray-500 font-normal">{row.ticker}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-gray-300">{row.shares}</td>
                                    <td className="px-6 py-4 text-right font-mono text-gray-500">${row.avgCost.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-right font-mono text-white">${row.currentPrice.toFixed(2)}</td>
                                    
                                    {/* NEW COLUMN CELL */}
                                    <td className="px-6 py-4 text-right font-mono text-yellow-400 font-bold">
                                        ${row.totalAssetDividends.toFixed(2)}
                                    </td>

                                    <td className="px-6 py-4 text-right">
                                        <div className={`flex items-center justify-end gap-1 font-bold ${row.gainLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {row.gainLoss >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                            {Math.abs(row.gainLossPercent).toFixed(2)}%
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono font-bold text-white text-lg">${row.marketValue.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>
          )) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center text-gray-500">
                 No assets owned.
              </div>
          )}
      </div>

      {/* 3. ACTIVITY LOG */}
      <div>
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-2">
                <History size={16} className="text-gray-500" />
                <span className="text-sm font-bold text-gray-300">Transaction History</span>
             </div>
             <div className="text-xs text-gray-500">
                Showing {Math.min(visibleTxCount, allTransactions.length)} of {allTransactions.length}
             </div>
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
             <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-900/50 text-xs uppercase font-bold text-gray-500 border-b border-gray-700">
                    <tr>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Type</th>
                        <th className="px-6 py-3">Details</th>
                        <th className="px-6 py-3 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                    {allTransactions.slice(0, visibleTxCount).map((tx: any) => {
                        const team = teams.find(t => t.id === tx.team_id);
                        const isWin = tx.type === 'DIVIDEND';
                        const isBuy = tx.type === 'BUY';
                        
                        return (
                            <tr key={tx.id} className="hover:bg-gray-700/30">
                                <td className="px-6 py-3 text-xs font-mono text-gray-500">
                                    {new Date(tx.created_at).toLocaleDateString()} <span className="opacity-50">{new Date(tx.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                </td>
                                <td className="px-6 py-3">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                                        isWin ? 'bg-yellow-500/10 text-yellow-400' :
                                        isBuy ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                    }`}>
                                        {tx.type}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-white">
                                    {team?.name || 'Unknown Team'}
                                    {isWin && <span className="text-gray-500 text-xs ml-2"> (Payout for {tx.shares_amount} shares)</span>}
                                    {!isWin && <span className="text-gray-500 text-xs ml-2"> ({tx.shares_amount} shares @ ${tx.share_price.toFixed(2)})</span>}
                                </td>
                                <td className={`px-6 py-3 text-right font-mono font-bold ${isWin || !isBuy ? 'text-green-400' : 'text-gray-300'}`}>
                                    {isBuy ? '-' : '+'}${tx.usd_amount.toFixed(2)}
                                </td>
                            </tr>
                        );
                    })}
                    {allTransactions.length === 0 && (
                        <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No transaction history.</td></tr>
                    )}
                </tbody>
             </table>
             
             {visibleTxCount < allTransactions.length && (
                 <button 
                    onClick={() => setVisibleTxCount(prev => prev + 5)}
                    className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-400 hover:text-white transition border-t border-gray-700 flex items-center justify-center gap-2"
                 >
                    Load More <ChevronDown size={14} />
                 </button>
             )}
          </div>
      </div>

    </div>
  );
}