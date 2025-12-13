'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Hash, AlertCircle, Lock, TrendingUp } from 'lucide-react';

interface TradeModalProps {
  team: any;
  isOpen: boolean;
  onClose: () => void;
  userId: string;       
  userBalance: number;  
  userShares: number;   
  onSuccess?: () => void;
}

export default function TradeModal({ team, isOpen, onClose, userId, userBalance, userShares, onSuccess }: TradeModalProps) {
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState<number | ''>(''); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Local state to track balance updates immediately after a trade
  const [currentBalance, setCurrentBalance] = useState(userBalance);
  const [currentShares, setCurrentShares] = useState(userShares);

  // Market Security State
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'LOADING'>('LOADING');
  const [marketMessage, setMarketMessage] = useState('');

  // --- 1. BONDING CURVE MATH ---
  const currentSpotPrice = 10.00 + (team.shares_outstanding * 0.01);

  const calculateTransaction = (qty: number, tradeMode: 'BUY' | 'SELL') => {
    if (!qty || qty <= 0) return { total: 0, avgPrice: 0, endPrice: currentSpotPrice, priceImpact: 0 };

    let startSupply = team.shares_outstanding;
    let endSupply = tradeMode === 'BUY' ? startSupply + qty : startSupply - qty;
    
    if (endSupply < 0) endSupply = 0;

    let firstSharePrice = 0;
    let lastSharePrice = 0;

    if (tradeMode === 'BUY') {
        firstSharePrice = 10.00 + ((startSupply + 1) * 0.01);
        lastSharePrice = 10.00 + (endSupply * 0.01);
    } else {
        firstSharePrice = 10.00 + (startSupply * 0.01);
        lastSharePrice = 10.00 + ((startSupply - qty + 1) * 0.01);
    }

    const total = (qty / 2) * (firstSharePrice + lastSharePrice);
    const avgPrice = total / qty;
    const priceImpact = Math.abs(avgPrice - currentSpotPrice);
    
    return { total, avgPrice, priceImpact };
  };

  const numAmount = Number(amount);
  const { total: totalValue, avgPrice, priceImpact } = calculateTransaction(numAmount, mode);

  // --- 2. REFRESH DATA & SECURITY CHECK ---
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setError(null);
      // Refresh latest data from PROFILES (Fix: used to say 'users')
      fetchLatestData();
      checkMarketStatus();
    }
  }, [isOpen, team]);

  const fetchLatestData = async () => {
      if(!userId) return;
      // FIX: Query 'profiles' instead of 'users'
      const { data: profile } = await supabase.from('profiles').select('usd_balance').eq('id', userId).single();
      if(profile) setCurrentBalance(profile.usd_balance);

      const { data: holding } = await supabase.from('holdings').select('shares_owned').eq('user_id', userId).eq('team_id', team.id).maybeSingle();
      if(holding) setCurrentShares(holding.shares_owned);
      else setCurrentShares(0);
  };

  const checkMarketStatus = async () => {
    setMarketStatus('LOADING');
    try {
        let sport = 'football/nfl';
        if (team.league === 'NHL') sport = 'hockey/nhl';

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const formatDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '');
        
        const datesParam = `${formatDate(yesterday)}-${formatDate(today)}`;
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/scoreboard?dates=${datesParam}`;

        const res = await fetch(scoreboardUrl);
        const data = await res.json();
        const events = data.events || [];

        const relevantGames = events.filter((e: any) => {
            return e.competitions[0].competitors.some((c: any) => {
                const t = c.team.abbreviation;
                return t === team.ticker || 
                       (t === 'WAS' && team.ticker === 'WSH') ||
                       (t === 'JAC' && team.ticker === 'JAX') ||
                       (t === 'LA' && team.ticker === 'LAR') ||
                       (t === 'TB' && team.ticker === 'TBL') ||
                       (t === 'SJ' && team.ticker === 'SJS') ||
                       (t === 'NJ' && team.ticker === 'NJD') ||
                       (t === 'MON' && team.ticker === 'MTL') ||
                       (t === 'UTA' && team.ticker === 'UTAH');
            });
        });

        let isClosed = false;
        let message = '';
        const currentHour = new Date().getHours(); 

        for (const game of relevantGames) {
            const state = game.status.type.state; 
            const gameDate = new Date(game.date);
            const isGameToday = gameDate.getDate() === today.getDate();

            if (state === 'in') {
                isClosed = true;
                message = 'Game in Progress';
                break;
            }
            if (state === 'post') {
                if (isGameToday) {
                    isClosed = true;
                    message = 'Game Finished (Payout Pending)';
                    break;
                } else {
                    if (currentHour < 6) {
                        isClosed = true;
                        message = 'Pending Overnight Payout';
                        break;
                    }
                }
            }
        }

        if (isClosed) {
            setMarketStatus('CLOSED');
            setMarketMessage(message);
        } else {
            setMarketStatus('OPEN');
        }

    } catch (e) {
        console.error("Market Check Error", e);
        setMarketStatus('OPEN');
    }
  };

  // --- 3. HANDLERS ---
  const handleSetMax = () => {
      if (mode === 'SELL') {
          setAmount(currentShares);
      } else {
          // 99% buffer for price slippage
          const approx = Math.floor((currentBalance * 0.99) / currentSpotPrice);
          setAmount(approx > 0 ? approx : 0);
      }
  };

  const handleExecute = async () => {
    if (!userId || numAmount <= 0) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'BUY') {
        if (marketStatus === 'CLOSED') throw new Error("Market is closed.");
        if (totalValue > currentBalance) throw new Error(`Insufficient funds. Need $${totalValue.toFixed(2)}`);
        
        const { error } = await supabase.rpc('buy_shares', {
          p_user_id: userId,
          p_team_id: team.id,
          p_amount: numAmount,
          p_price: avgPrice 
        });
        if (error) throw error;

      } else {
        if (numAmount > currentShares) throw new Error(`Insufficient shares. You have ${currentShares}.`);

        const { error } = await supabase.rpc('sell_shares', {
          p_user_id: userId,
          p_team_id: team.id,
          p_amount: numAmount
        });
        if (error) throw error;
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Validation
  const isInsufficientFunds = mode === 'BUY' && totalValue > currentBalance;
  const isInsufficientShares = mode === 'SELL' && numAmount > currentShares;
  const isInvalid = isInsufficientFunds || isInsufficientShares;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-5 border-b border-gray-800 bg-gray-900">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {team.name} <span className="text-gray-500 text-sm font-normal">({team.ticker})</span>
            </h2>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-mono text-gray-400">
                    Spot Price: <span className="text-white font-bold">${currentSpotPrice.toFixed(2)}</span>
                </span>
                
                {marketStatus === 'CLOSED' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded uppercase">
                        <Lock size={10} /> Market Closed
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded uppercase">
                        Market Open
                    </span>
                )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition p-1 hover:bg-gray-800 rounded-full">
            <X size={24} />
          </button>
        </div>

        {/* MARKET CLOSED WARNING */}
        {marketStatus === 'CLOSED' && mode === 'BUY' && (
            <div className="bg-red-500/10 border-b border-red-500/20 p-3 flex items-start gap-3">
                <AlertCircle className="text-red-400 shrink-0" size={18} />
                <p className="text-xs text-red-200 leading-relaxed">
                    <strong>Trading Suspended:</strong> {marketMessage}. <br/>
                    Buying is disabled until the daily payout process completes. You may still sell shares.
                </p>
            </div>
        )}

        {/* BODY */}
        <div className="p-6 space-y-6">
          
          {/* TABS */}
          <div className="grid grid-cols-2 gap-2 bg-gray-800 p-1 rounded-lg">
            <button 
              onClick={() => { setMode('BUY'); setAmount(''); }}
              disabled={marketStatus === 'CLOSED'} 
              className={`py-2 text-sm font-bold rounded-md transition-all ${
                mode === 'BUY' 
                  ? 'bg-green-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              } ${marketStatus === 'CLOSED' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Buy
            </button>
            <button 
              onClick={() => { setMode('SELL'); setAmount(''); }}
              className={`py-2 text-sm font-bold rounded-md transition-all ${
                mode === 'SELL' 
                  ? 'bg-red-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              Sell
            </button>
          </div>

          {/* INPUT */}
          <div className="space-y-4">
             <div className="flex justify-between text-xs text-gray-400 px-1">
                <span>Quantity (Shares)</span>
                <span className={`${isInvalid ? 'text-red-400 font-bold' : ''}`}>
                    {mode === 'BUY' 
                        ? `Available: $${currentBalance.toFixed(2)}`
                        : `Owned: ${currentShares} Shares`
                    }
                </span>
             </div>

             <div className="flex gap-2">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <Hash size={18} />
                    </div>
                    <input 
                        type="number" 
                        min="1"
                        value={amount}
                        onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
                        className={`w-full bg-gray-950 border rounded-xl py-4 pl-10 pr-4 text-white text-lg font-mono focus:ring-2 transition outline-none ${
                            isInvalid ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-blue-500'
                        }`}
                        placeholder="0"
                        disabled={marketStatus === 'CLOSED' && mode === 'BUY'}
                    />
                </div>
                <button 
                    onClick={handleSetMax}
                    disabled={marketStatus === 'CLOSED' && mode === 'BUY'}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 font-bold px-4 rounded-xl text-xs transition active:scale-95"
                >
                    MAX
                </button>
             </div>
          </div>

          {/* TOTAL */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2 border border-gray-700/50 relative">
             <div className="flex justify-between text-sm">
                <div className="flex items-center gap-1 text-gray-400">
                    <TrendingUp size={12}/>
                    <span>Avg Price (Slippage)</span>
                </div>
                <div className="text-right">
                    <span className="text-gray-300 font-mono block">${avgPrice.toFixed(2)}</span>
                    {priceImpact > 0.01 && (
                        <span className="text-[10px] text-yellow-500">
                            (+${priceImpact.toFixed(2)} vs Spot)
                        </span>
                    )}
                </div>
             </div>
             <div className="flex justify-between text-sm pt-2 border-t border-gray-700/50">
                <span className="text-gray-400 font-bold uppercase pt-1">Total {mode === 'BUY' ? 'Cost' : 'Value'}</span>
                <span className={`font-mono font-bold text-xl ${mode === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                    ${totalValue.toFixed(2)}
                </span>
             </div>
          </div>

          {/* ERROR */}
          {(error || isInvalid) && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-1">
                <AlertCircle size={16} />
                {error ? error : (isInsufficientFunds ? 'Insufficient Funds' : 'Insufficient Shares Owned')}
            </div>
          )}

          {/* CONFIRM BUTTON */}
          <button
            onClick={handleExecute}
            disabled={loading || numAmount <= 0 || (marketStatus === 'CLOSED' && mode === 'BUY') || isInvalid}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg active:scale-[0.98] ${
                loading ? 'bg-gray-700 text-gray-500 cursor-wait' :
                (marketStatus === 'CLOSED' && mode === 'BUY') ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50' :
                isInvalid ? 'bg-gray-800 text-gray-500 cursor-not-allowed' :
                mode === 'BUY' ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-900/20' :
                'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
            }`}
          >
            {loading ? 'Processing...' : (
                marketStatus === 'CLOSED' && mode === 'BUY' ? 'MARKET CLOSED' :
                `Confirm ${mode}`
            )}
          </button>

        </div>
      </div>
    </div>
  );
}