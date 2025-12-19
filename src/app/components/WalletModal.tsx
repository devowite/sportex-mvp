'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, ArrowDownCircle, ArrowUpCircle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

interface WalletModalProps {
  balance: number;
  onClose: () => void;
  onSuccess: () => void; // To reload data on parent
}

export default function WalletModal({ balance, onClose, onSuccess }: WalletModalProps) {
  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const val = parseFloat(amount);

    if (val <= 0) {
        toast.error("Invalid Amount", { description: "Please enter a value greater than 0." });
        setLoading(false);
        return;
    }

    if (activeTab === 'DEPOSIT') {
        const { error } = await supabase.rpc('simulate_deposit', { amount: val });
        if (error) {
            toast.error("Deposit Failed", { description: error.message });
        } else {
            toast.success("Deposit Successful", { description: `$${val.toFixed(2)} added to wallet` });
            onSuccess();
            onClose();
        }
    } else {
        // WITHDRAWAL LOGIC
        if (val > balance) {
            toast.error("Insufficient Funds", { description: "You cannot withdraw more than you have." });
        } else {
            toast.success("Withdrawal Requested", { description: `$${val.toFixed(2)} sent to bank (Demo)` });
            onClose();
        }
    }
    setLoading(false);
};

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
            <h3 className="font-bold text-white flex items-center gap-2">
                <CreditCard size={18} className="text-blue-400" /> My Wallet
            </h3>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition">
                <X size={20} />
            </button>
        </div>

        {/* Balance Display */}
        <div className="p-6 text-center bg-gray-800/30">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Available Balance</p>
            <h2 className="text-4xl font-mono font-bold text-white">${balance.toFixed(2)}</h2>
        </div>

        {/* Tabs */}
        <div className="flex p-2 bg-gray-900 gap-2">
            <button 
                onClick={() => setActiveTab('DEPOSIT')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${activeTab === 'DEPOSIT' ? 'bg-green-600/20 text-green-400 border border-green-600/50' : 'text-gray-500 hover:bg-gray-800'}`}
            >
                <ArrowDownCircle size={16} /> Deposit
            </button>
            <button 
                onClick={() => setActiveTab('WITHDRAW')}
                className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${activeTab === 'WITHDRAW' ? 'bg-red-600/20 text-red-400 border border-red-600/50' : 'text-gray-500 hover:bg-gray-800'}`}
            >
                <ArrowUpCircle size={16} /> Withdraw
            </button>
        </div>

        {/* Form */}
        <form onSubmit={handleTransaction} className="p-6 pt-2">
            <label className="block text-xs text-gray-400 mb-2 font-bold uppercase">
                {activeTab === 'DEPOSIT' ? 'Amount to Add' : 'Amount to Cash Out'}
            </label>
            
            <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-lg">$</span>
                <input 
                    type="number" 
                    required
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-black border border-gray-700 rounded-xl py-3 pl-8 pr-4 text-white font-mono text-lg focus:outline-none focus:border-blue-500 transition"
                    placeholder="0.00"
                />
            </div>

            <button 
                type="submit" 
                disabled={loading}
                className={`w-full py-3 rounded-xl font-bold text-white shadow-lg transition ${
                    activeTab === 'DEPOSIT' 
                    ? 'bg-green-600 hover:bg-green-500' 
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
            >
                {loading ? 'Processing...' : activeTab === 'DEPOSIT' ? 'Confirm Deposit' : 'Request Withdrawal'}
            </button>

            {activeTab === 'DEPOSIT' && (
                <p className="text-[10px] text-center text-gray-500 mt-4">
                    *MVP Mode: This creates fake money instantly for testing.
                </p>
            )}
        </form>

      </div>
    </div>
  );
}