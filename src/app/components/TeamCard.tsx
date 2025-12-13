'use client';

import { TrendingUp, TrendingDown, Clock, Calendar, Activity } from 'lucide-react';

interface TeamCardProps {
  team: any;
  myShares: number;
  onTrade: (team: any) => void;
  onSimWin?: (id: number, name: string) => void;
  userId?: string;
  liveGame?: any; // <--- THIS IS THE MISSING LINE CAUSING THE ERROR
}

export default function TeamCard({ team, myShares, onTrade, onSimWin, liveGame }: TeamCardProps) {
  
  const currentPrice = 10.00 + (team.shares_outstanding * 0.01);
  const yieldPerShare = team.shares_outstanding > 0 ? (team.dividend_bank * 0.50) / team.shares_outstanding : 0;

  // --- HELPER: FORMAT GAME STATUS ---
  const renderGameStatus = () => {
    if (!liveGame) {
      return (
        <div className="flex items-center gap-1 text-gray-500 text-xs">
          <Calendar size={12} />
          <span>No Game Today</span>
        </div>
      );
    }

    const { status, opponent, score, opponentScore, clock } = liveGame;

    // 1. PRE-GAME
    if (status === 'pre') {
      return (
        <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-1 text-gray-400 text-xs">
                <Clock size={12} />
                <span>{liveGame.startTime}</span>
            </div>
            <span className="text-xs font-bold text-gray-300">vs {opponent}</span>
        </div>
      );
    }

    // 2. LIVE GAME
    if (status === 'in') {
      return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-1">
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 animate-pulse">
                    <Activity size={10} /> LIVE
                </span>
                <span className="text-[10px] text-gray-400">{clock}</span>
            </div>
            <div className="flex justify-between items-center font-mono font-bold text-sm">
                <span className="text-white">{team.ticker} {score}</span>
                <span className="text-gray-500 text-xs">-</span>
                <span className="text-gray-400">{opponent} {opponentScore}</span>
            </div>
        </div>
      );
    }

    // 3. FINAL (POST-GAME)
    if (status === 'post') {
      const isWin = parseInt(score) > parseInt(opponentScore);
      return (
        <div className="flex justify-between items-center w-full">
            <span className={`text-xs font-bold ${isWin ? 'text-green-400' : 'text-gray-400'}`}>
                {isWin ? 'FINAL: WIN' : 'FINAL: LOSS'}
            </span>
            <span className="text-xs font-mono text-gray-500">
                {score}-{opponentScore} vs {opponent}
            </span>
        </div>
      );
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-gray-600 transition group relative overflow-hidden">
      
      {/* GLOW EFFECT (Only if Live) */}
      {liveGame?.status === 'in' && (
          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition">{team.name}</h3>
          <span className="text-xs font-mono text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">{team.ticker}</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl font-bold text-white">${currentPrice.toFixed(2)}</p>
          <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400">
             <span>Supply: {team.shares_outstanding}</span>
          </div>
        </div>
      </div>

      {/* GAME STATUS BAR */}
      <div className="bg-gray-900/50 rounded-lg p-2 mb-4 min-h-[42px] flex items-center border border-gray-700/50">
        {renderGameStatus()}
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-gray-900 rounded-lg p-2 text-center border border-gray-800">
             <span className="text-[10px] text-gray-500 uppercase block">Bank</span>
             <span className="text-green-400 font-mono font-bold text-sm">${team.dividend_bank.toFixed(2)}</span>
        </div>
        <div className="bg-gray-900 rounded-lg p-2 text-center border border-gray-800">
             <span className="text-[10px] text-gray-500 uppercase block">Yield/Win</span>
             <span className="text-blue-400 font-mono font-bold text-sm">${yieldPerShare.toFixed(2)}</span>
        </div>
      </div>

      {/* USER SHARES */}
      {myShares > 0 && (
          <div className="flex justify-between items-center mb-4 px-2 py-1 bg-blue-900/20 rounded text-xs border border-blue-900/30">
              <span className="text-blue-200">You Own:</span>
              <span className="font-bold text-blue-100">{myShares} Shares</span>
          </div>
      )}

      {/* ACTIONS */}
      <div className="flex gap-2">
        <button 
            onClick={() => onTrade(team)}
            className="flex-1 bg-white text-black font-bold py-2 rounded-lg hover:bg-gray-200 transition text-sm shadow-lg shadow-white/5"
        >
            Trade
        </button>
        {onSimWin && (
             <button 
                onClick={() => onSimWin(team.id, team.name)}
                className="bg-gray-700 hover:bg-green-900 text-gray-300 hover:text-green-400 p-2 rounded-lg transition border border-gray-600"
                title="Admin: Force Win"
            >
                <TrendingUp size={18} />
             </button>
        )}
      </div>
    </div>
  );
}