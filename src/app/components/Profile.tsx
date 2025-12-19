'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Lock, CreditCard, Save, LogOut } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileProps {
  user: any;
  onOpenWallet: () => void;
  onReload: () => void; // To refresh data after username change
}

export default function Profile({ user, onOpenWallet, onReload }: ProfileProps) {
  const [username, setUsername] = useState(user.username || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

const handleUpdateProfile = async () => {
    setLoading(true);
    
    // 1. Update Username
    if (username !== user.username) {
        const { error } = await supabase.rpc('update_username', { new_name: username });
        if (error) {
            toast.error('Failed to update username', { description: error.message });
        } else {
            toast.success('Profile updated', { description: `Username changed to ${username}` });
            onReload();
        }
    }

    // 2. Update Password (if provided)
    if (password) {
        const { error } = await supabase.auth.updateUser({ password: password });
        if (error) {
            toast.error('Failed to update password', { description: error.message });
        } else {
            toast.success('Security updated', { description: 'Password changed successfully' });
            setPassword('');
        }
    }
    
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-8">
        <div className="h-20 w-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20">
            <span className="text-3xl font-bold text-white">
                {(username?.[0] || user.email?.[0] || 'U').toUpperCase()}
            </span>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-white">{username || 'Player One'}</h2>
            <p className="text-gray-400">{user.email}</p>
            <p className="text-xs text-gray-600 font-mono mt-1">ID: {user.id}</p>
        </div>
      </div>

      {/* WALLET SECTION */}
      <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 flex justify-between items-center">
        <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard size={20} className="text-green-400" /> Wallet Balance
            </h3>
            <p className="text-3xl font-mono font-bold text-white mt-2">
                ${user.usd_balance.toFixed(2)}
            </p>
        </div>
        <button 
            onClick={onOpenWallet}
            className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-bold transition shadow-lg"
        >
            Manage Wallet
        </button>
      </div>

      {/* SETTINGS FORM */}
      <div className="bg-black/40 backdrop-blur-md rounded-xl border border-white/10 p-6 space-y-6">
        <h3 className="text-lg font-bold text-gray-300 border-b border-gray-700 pb-2">Account Settings</h3>
        
        {/* Username */}
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Display Name</label>
            <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg py-2 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none transition"
                />
            </div>
        </div>

        {/* Password */}
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Password</label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input 
                    type="password" 
                    placeholder="Leave blank to keep current"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg py-2 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none transition"
                />
            </div>
        </div>

        {/* Save Button */}
        <div className="pt-2">
            <button 
                onClick={handleUpdateProfile}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition"
            >
                {loading ? 'Saving...' : <><Save size={18} /> Save Changes</>}
            </button>
        </div>
      </div>

    </div>
  );
}