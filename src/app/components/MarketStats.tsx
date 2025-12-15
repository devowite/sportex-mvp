'use client';

import { Activity, DollarSign, BarChart3, Trophy, HelpCircle, ArrowRightLeft } from 'lucide-react';

interface MarketStatsProps {
  marketCap: number;
  volume24hShares: number;
  volume24hDollars: number;
  avgYield: number;
  totalBank: number;
}

export default function MarketStats({ marketCap, volume24hShares, volume24hDollars, avgYield, totalBank }: MarketStatsProps) {
  
  // Helper to render a stat card
  const StatCard = ({ icon: Icon, label, value, subtext, color, tooltip }: any) => (
    <div className="bg-black/40 border border-white/10 p-4 rounded-xl flex flex-col gap-1 backdrop-blur-md relative group cursor-help transition hover:border-white/20">
      
      {/* Label Row */}
      <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">
        <Icon size={14} /> 
        {label}
        <HelpCircle size={10} className="text-gray-600 group-hover:text-gray-400 transition" />
      </div>

      {/* Value Row */}
      <div className={`text-xl xl:text-2xl font-mono font-bold ${color}`}>
        {value} {subtext && <span className="text-sm text-gray-500 font-sans font-normal">{subtext}</span>}
      </div>

      {/* Tooltip Popup */}
      <div className="hidden group-hover:block absolute top-full left-0 mt-2 w-48 p-3 bg-black border border-gray-700 rounded-lg shadow-xl text-xs text-gray-300 z-50 pointer-events-none">
        {tooltip}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
      
      <StatCard 
        icon={DollarSign} 
        label="Market Cap" 
        value={`$${marketCap.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        color="text-white"
        tooltip="The total dollar value of all shares currently owned by players."
      />

      <StatCard 
        icon={Activity} 
        label="24h Volume" 
        value={volume24hShares.toLocaleString()}
        subtext="shares"
        color="text-blue-400"
        tooltip="Total number of shares bought or sold in the last 24 hours."
      />

      <StatCard 
        icon={ArrowRightLeft} 
        label="24h Value" 
        value={`$${volume24hDollars.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        color="text-blue-300"
        tooltip="Total USD value of all trades executed in the last 24 hours."
      />

      <StatCard 
        icon={BarChart3} 
        label="Avg. Dividend" 
        value={`$${avgYield.toFixed(2)}`}
        color="text-green-400"
        tooltip="The weighted average payout per share across the entire market based on current supply."
      />

      <StatCard 
        icon={Trophy} 
        label="Total Dividend Pot" 
        value={`$${totalBank.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        color="text-yellow-400"
        tooltip="Total sum of all outstanding dividends, waiting to be paid out to winners."
      />

    </div>
  );
}