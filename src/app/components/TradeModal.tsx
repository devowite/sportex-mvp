'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, AlertCircle, Lock, Calculator, Info } from 'lucide-react';

interface TradeModalProps {
  team: any;
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onSuccess?: () => void;
}

export default function TradeModal({ team, isOpen, onClose, userId, onSuccess }: TradeModalProps) {
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState<number>(0); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // User State
  const [userBalance, setUserBalance] = useState(0);
  const [userShares, setUserShares] = useState(0);

  // Market Security State
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'LOADING'>('LOADING');
  const [marketMessage, setMarketMessage] = useState('');

  // --- 1. BONDING CURVE MATH ---
  // Price P(S) = 10 + 0.01 * S
  // To buy 'k' shares starting at supply 'S', we sum the price of share S+1 to S+k.
  // Formula: k/2 * (Price_Start + Price_End)
  
  const currentSpotPrice = 10.00 + (team.shares_outstanding * 0.01);

  const calculateTransaction = (qty: number, tradeMode: 'BUY' | 'SELL') => {
    if (!qty || qty <= 0) return { total: 0, avgPrice: 0, endPrice: currentSpotPrice };

    let startSupply = team.shares_outstanding;
    let endSupply = tradeMode === 'BUY' ? startSupply + qty : startSupply - qty;
    
    // Safety for selling more than exists (though validation prevents this)
    if (endSupply < 0) endSupply = 0;

    let firstSharePrice = 0;
    let lastSharePrice = 0;

    if (tradeMode === 'BUY') {
        // Price of next share (S+1)
        firstSharePrice = 10.00 + ((startSupply + 1) * 0.01);
        // Price of last share (S+k)
        lastSharePrice = 10.00 + (endSupply * 0.01);
    } else {
        // Selling: Price of current share (S)
        firstSharePrice = 10.00 + (startSupply * 0.01);
        // Price of last share sold (S-k+1)
        lastSharePrice = 10.00 + ((startSupply - qty + 1) * 0.01);
    }

    // Arithmetic Sum
    const total = (qty / 2) * (firstSharePrice + lastSharePrice);
    const avgPrice = total / qty;
    
    return { 
        total, 
        avgPrice, 
        firstSharePrice, 
        lastSharePrice 
    };
  };

  const { total: totalValue, avgPrice } = calculateTransaction(amount, mode);

  // --- 2. FETCH DATA ---
  useEffect(() => {
    if (isOpen && userId) {
      setAmount(0);
      setError(null);
      fetchUserData();
      checkMarketStatus();
    }
  }, [isOpen, userId, team]);

  const fetchUserData = async () => {
    if (!userId) return;
    const { data: userData } = await supabase.from('users').select('usd_balance').eq('id', userId).single();
    if (userData) setUserBalance(userData.usd_balance);

    const { data: shareData } = await supabase.from('holdings').select('shares_owned').eq('user_id', userId).eq('team_id', team.id).maybeSingle();
    if (shareData) setUserShares(shareData.shares_owned);
    else setUserShares(0);
  };

  const handleSetMax = () => {
      if (mode === 'SELL') {
          setAmount(userShares);
      } else {
          // Estimate max buy (Rough approximation due to curve)
          // Simple heuristic: Balance / Current Price (It will be slightly less due to slippage, but close enough for UX start)
          const approx = Math.floor(userBalance / currentSpotPrice);
          setAmount(approx > 0 ? approx : 0);
      }
  };

  // --- 3. MARKET SECURITY ---
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
            const gameDateStr = game.date; 
            const gameDate = new Date(gameDateStr);
            const isGameToday = gameDate.getDate() === today.getDate();

            if (state === 'in') {
                isClosed = true;
                message = 'Market Closed: Game in Progress';
                break;
            }
            if (state === 'post') {
                if (isGameToday) {
                    isClosed = true;
                    message = 'Market Closed: Game Finished (Payout Pending)';
                    break;
                } else {
                    if (currentHour < 6) {
                        isClosed = true;
                        message = 'Market Closed: Pending Overnight Payout';
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

  // --- 4. EXECUTE ---
  const handleExecute = async () => {
    if (!userId || amount <= 0) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'BUY') {
        if (marketStatus === 'CLOSED') throw new Error("Market is closed.");
        if (totalValue > userBalance) throw new Error(`Insufficient funds. Need $${totalValue.toFixed(2)}`);
        
        const { error } = await supabase.rpc('buy_shares', {
          p_user_id: userId,
          p_team_id: team.id,
          p_amount: amount,
          p_price: avgPrice // We record the AVG price paid
        });
        if (error) throw error;

      } else {
        if (amount > userShares) throw new Error(`Insufficient shares. You have ${userShares}.`);

        const { error } = await supabase.rpc('sell_shares', {
          p_user_id: userId,
          p_team_id: team.id,
          p_amount: amount
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

  // Validation Check for UI
  const isInsufficientFunds = mode === 'BUY' && totalValue > userBalance;
  const isInsufficientShares = mode === 'SELL' && amount > userShares;
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
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                        <Lock size={10} /> MARKET CLOSED
                    </span>
                ) : marketStatus === 'OPEN' ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">
                        MARKET OPEN
                    </span>
                ) : (
                    <span className="text-[10px] text-gray-500 animate-pulse">Checking Status...</span>
                )}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition p-1 hover:bg-gray-800 rounded-full">
            <X size={24} />
          </button>
        </div>

        {/* WARNINGS */}
        {marketStatus === 'CLOSED' && mode === 'BUY' && (
            <div className="bg-red-500/10 border-b border-red-500/20 p-3 flex items-start gap-3">
                <AlertCircle className="text-red-400 shrink-0" size={18} />
                <p className="text-xs text-red-200 leading-relaxed">
                    <strong>Trading Suspended:</strong> {marketMessage}.
                </p>
            </div>
        )}

        {/* BODY */}
        <div className="p-6 space-y-6">
          
          {/* TABS */}
          <div className="grid grid-cols-2 gap-2 bg-gray-800 p-1 rounded-lg">
            <button 
              onClick={() => { setMode('BUY'); setAmount(0); }}
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
              onClick={() => { setMode('SELL'); setAmount(0); }}
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
                <span>Shares to {mode === 'BUY' ? 'Buy' : 'Sell'}</span>
                <span className={`${isInvalid ? 'text-red-400 font-bold' : ''}`}>
                    {mode === 'BUY' 
                        ? `Balance: $${userBalance.toFixed(2)}`
                        : `Owned: ${userShares}`
                    }
                </span>
             </div>

             <div className="flex gap-2">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                        <Calculator size={18} />
                    </div>
                    <input 
                    type="number" 
                    min="1"
                    value={amount || ''}
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
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-blue-400 font-bold px-4 rounded-xl text-xs transition"
                >
                    MAX
                </button>
             </div>
          </div>

          {/* TOTAL / BREAKDOWN */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2 border border-gray-700/50 relative group">
             {/* TOOLTIP (Appears on Hover) */}
             <div className="absolute bottom-full left-0 w-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                 <div className="bg-black border border-gray-600 text-gray-300 text-xs p-2 rounded shadow-xl">
                    <p className="font-bold text-white mb-1">Bonding Curve Mechanics</p>
                    <p>Current Spot: ${currentSpotPrice.toFixed(2)}</p>
                    <p>Avg Price for {amount || 0} shares: ${avgPrice.toFixed(2)}</p>
                    <p className="italic text-gray-500 mt-1">
                        {mode === 'BUY' ? 'Buying pushes price up.' : 'Selling pushes price down.'}
                    </p>
                 </div>
             </div>

             <div className="flex justify-between text-sm">
                <div className="flex items-center gap-1 text-gray-400 cursor-help">
                    <Info size={12}/>
                    <span>Avg Price per Share</span>
                </div>
                <span className="text-gray-300 font-mono">${avgPrice.toFixed(2)}</span>
             </div>
             <div className="flex justify-between text-sm">
                <span className="text-gray-400 font-bold uppercase">Total {mode === 'BUY' ? 'Cost' : 'Value'}</span>
                <span className={`font-mono font-bold text-lg ${mode === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
                    ${totalValue.toFixed(2)}
                </span>
             </div>
          </div>

          {/* ERROR MESSAGE */}
          {(error || isInvalid) && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-1">
                <AlertCircle size={16} />
                {error ? error : (isInsufficientFunds ? 'Insufficient Funds' : 'Insufficient Shares')}
            </div>
          )}

          {/* CONFIRM BUTTON */}
          <button
            onClick={handleExecute}
            disabled={loading || amount <= 0 || (marketStatus === 'CLOSED' && mode === 'BUY') || isInvalid}
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