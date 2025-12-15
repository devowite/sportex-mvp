'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, TrendingUp, Trophy, Lock, DollarSign, Lightbulb } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: "Welcome to TradeWins",
      icon: <TrendingUp size={48} className="text-blue-400" />,
      content: (
        <div className="space-y-4 text-center">
          <p className="text-lg text-white font-bold">The First Live Sports Stock Market.</p>
          <p className="text-sm text-gray-400">
            Instead of betting on odds that disappear after the game, you buy <span className="text-blue-300 font-bold">Shares</span> of teams.
          </p>
          <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-left text-sm space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-400 rounded-full"></div>
              <span>Buy low, sell high as prices change live.</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-yellow-400 rounded-full"></div>
              <span>Hold shares to earn cash dividends when they win.</span>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "How Shares Work",
      icon: <DollarSign size={48} className="text-green-400" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-gray-300 text-center">
            Share prices are determined by <strong>Supply & Demand</strong>, not a bookie.
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-black/30 p-3 rounded-lg border border-white/10">
              <span className="text-green-400 font-bold block mb-1">Buy Pressure</span>
              More buyers = Price goes UP. Early investors profit.
            </div>
            <div className="bg-black/30 p-3 rounded-lg border border-white/10">
              <span className="text-red-400 font-bold block mb-1">Sell Pressure</span>
              More sellers = Price goes DOWN. Panic selling hurts value.
            </div>
          </div>
          <p className="text-xs text-gray-500 text-center italic">
            "You own the asset until you decide to sell it."
          </p>
        </div>
      )
    },
    {
      title: "Winning & Dividends",
      icon: <Trophy size={48} className="text-yellow-400" />,
      content: (
        <div className="space-y-4 text-center">
          <p className="text-sm text-gray-300">
            Every team has a <span className="text-yellow-400 font-bold">Dividend Pot</span> that grows over time.
          </p>
          <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl relative overflow-hidden">
            <div className="text-2xl font-bold text-white mb-1">Win = Payout</div>
            <p className="text-xs text-yellow-200">
              When your team wins a game, their Dividend Pot is paid out immediately to shareholders.
            </p>
          </div>
          <p className="text-xs text-gray-500">
            Example: You own 10 shares. Payout is $2.00/share. You get <strong>$20 cash</strong> instantly.
          </p>
        </div>
      )
    },
    {
      title: "Market Rules",
      icon: <Lock size={48} className="text-red-400" />,
      content: (
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start gap-3 bg-black/30 p-3 rounded-lg border border-white/10">
            <Lock size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Market Locks During Games</span>
              Trading is disabled while the team is playing. You cannot buy until the game ends, but you can continue to sell.
            </div>
          </div>
          <div className="flex items-start gap-3 bg-black/30 p-3 rounded-lg border border-white/10">
            <TrendingUp size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">IPO & Fees</span>
              New shares are minted from the system. A small fee (5%) on Buys goes to the House; Sells are free.
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Strategies to Win",
      icon: <Lightbulb size={48} className="text-purple-400" />,
      content: (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-white/10">
            <span className="text-xs font-bold text-blue-300 uppercase tracking-wider block mb-1">The Dividend Hunter</span>
            <p className="text-xs text-gray-300">Buy high-yield teams with big banks before they play easy opponents. Collect the cash, then sell.</p>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-r from-green-900/40 to-emerald-900/40 border border-white/10">
            <span className="text-xs font-bold text-green-300 uppercase tracking-wider block mb-1">The Flipper</span>
            <p className="text-xs text-gray-300">Buy unpopular teams cheap. Wait for them to go on a winning streak, then sell your shares for profit.</p>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition mt-2"
          >
            Start Trading
          </button>
        </div>
      )
    }
  ];

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1a1b26] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative flex flex-col min-h-[450px]">
        
        {/* PROGRESS BAR */}
        <div className="flex gap-1 p-1 bg-black/50">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? 'bg-blue-500' : 'bg-gray-800'}`} 
            />
          ))}
        </div>

        {/* CLOSE BUTTON */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white transition z-10"
        >
          <X size={20} />
        </button>

        {/* CONTENT AREA */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center animate-in slide-in-from-right-4 duration-300 key={step}">
          <div className="mb-6 bg-white/5 p-4 rounded-full shadow-inner ring-1 ring-white/10">
            {currentStep.icon}
          </div>
          <h2 className="text-2xl font-bold text-white mb-6 text-center">{currentStep.title}</h2>
          <div className="w-full">
            {currentStep.content}
          </div>
        </div>

        {/* NAVIGATION FOOTER */}
        {step < steps.length - 1 && (
          <div className="p-4 border-t border-white/5 bg-black/20 flex justify-between items-center">
            <button 
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className={`text-sm font-bold flex items-center gap-1 ${step === 0 ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
            >
              <ChevronLeft size={16} /> Back
            </button>

            <div className="flex gap-1.5">
               {steps.map((_, i) => (
                   <div key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-white' : 'bg-white/20'}`} />
               ))}
            </div>

            <button 
              onClick={() => setStep(Math.min(steps.length - 1, step + 1))}
              className="text-sm font-bold text-blue-400 hover:text-white flex items-center gap-1 transition"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}