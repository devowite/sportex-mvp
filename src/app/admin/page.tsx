'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Shield, DollarSign, Users, Activity, Save, ArrowLeft, Trash2 } from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Data
  const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (!profile?.is_admin) {
        router.push('/'); 
        return;
      }

      setIsAdmin(true);
      fetchAdminData();
    };

    checkAdmin();
  }, [router]);

  const fetchAdminData = async () => {
    setLoading(true);
    
    // 1. Fetch Users
    const { data: userData } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(userData || []);

    // 2. Calculate House Revenue
    const { data: buys } = await supabase
        .from('transactions')
        .select('usd_amount')
        .eq('type', 'BUY');
    
    const totalBuyVolume = buys?.reduce((sum, t) => sum + t.usd_amount, 0) || 0;
    const houseRevenue = totalBuyVolume * 0.05;

    // 3. Calculate Liabilities
    const { data: teams } = await supabase.from('teams').select('reserve_pool, dividend_bank');
    const totalReserve = teams?.reduce((sum, t) => sum + t.reserve_pool, 0) || 0;
    const totalDivBank = teams?.reduce((sum, t) => sum + t.dividend_bank, 0) || 0;
    const totalUserCash = userData?.reduce((sum, u) => sum + u.usd_balance, 0) || 0;

    setStats({
        houseRevenue,
        totalReserve,
        totalDivBank,
        totalUserCash,
        totalLiability: totalReserve + totalDivBank + totalUserCash
    });

    setLoading(false);
  };

  const handleAdjustBalance = async (userId: string) => {
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount === 0) return;

    if (!confirm(`Are you sure you want to adjust balance by $${amount}?`)) return;

    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase.rpc('admin_adjust_balance', {
        p_admin_id: user?.id,
        p_target_user_id: userId,
        p_amount: amount,
        p_reason: 'Manual Admin Adjustment'
    });

    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Success: Balance updated.');
        setEditingUser(null);
        setAdjustAmount('');
        fetchAdminData(); 
    }
  };

  // --- NEW: DELETE USER FUNCTION ---
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`DANGER: Are you sure you want to DELETE ${userName}?\n\nThis will wipe their portfolio, transaction history, and balance. This cannot be undone.`)) return;

    const { data, error } = await supabase.rpc('admin_delete_user', {
        p_target_user_id: userId
    });

    if (error || (data && !data.success)) {
        alert('Error: ' + (error?.message || data?.message));
    } else {
        alert('User deleted.');
        fetchAdminData(); // Refresh list
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600 rounded-xl shadow-lg shadow-red-900/20">
                <Shield size={24} className="text-white" />
            </div>
            <div>
                <h1 className="text-2xl font-bold">Admin Portal</h1>
                <p className="text-gray-400 text-sm">House Metrics & User Control</p>
            </div>
        </div>
        <button 
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold transition"
        >
            <ArrowLeft size={16} /> Back to Market
        </button>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-green-500"><DollarSign size={64} /></div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Total House Revenue</p>
            <h2 className="text-3xl font-mono text-green-400 font-bold">
                ${stats.houseRevenue?.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </h2>
            <p className="text-xs text-gray-500 mt-2">Accumulated 5% fees from buys</p>
        </div>

        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">User Cash Liability</p>
            <h2 className="text-2xl font-mono text-white font-bold">
                ${stats.totalUserCash?.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </h2>
            <p className="text-xs text-gray-500 mt-2">Cash sitting in user wallets</p>
        </div>

        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">Market Liability</p>
            <div className="space-y-1 mt-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Reserve Pool:</span>
                    <span className="font-mono text-blue-300">${stats.totalReserve?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Dividend Banks:</span>
                    <span className="font-mono text-yellow-300">${stats.totalDivBank?.toLocaleString()}</span>
                </div>
            </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">System Health</p>
            <div className="mt-2 flex items-center gap-2">
                <Activity size={20} className="text-green-500" />
                <span className="text-lg font-bold text-green-500">Solvent</span>
            </div>
            <p className="text-xs text-gray-500 mt-2">Reserve Ratio: 85% (Fixed)</p>
        </div>
      </div>

      {/* USER MANAGER */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
            <h3 className="font-bold text-lg flex items-center gap-2">
                <Users size={20} className="text-blue-400" /> User Management
            </h3>
            <span className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded">{users.length} Users</span>
        </div>
        
        <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-900/50 text-xs uppercase font-bold text-gray-500 border-b border-gray-700">
                <tr>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4 text-right">Balance</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
                {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-700/30">
                        <td className="px-6 py-4 font-bold text-white">
                            {u.username || u.email}
                            <div className="text-[10px] text-gray-600 font-mono font-normal">{u.id}</div>
                        </td>
                        <td className="px-6 py-4">
                            {u.is_admin ? (
                                <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-[10px] font-bold uppercase">Admin</span>
                            ) : (
                                <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-[10px] font-bold uppercase">User</span>
                            )}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-white text-lg">
                            ${u.usd_balance.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                                {/* EDIT BALANCE */}
                                {editingUser === u.id ? (
                                    <div className="flex items-center justify-end gap-2">
                                        <input 
                                            type="number" 
                                            placeholder="+/- Amount"
                                            className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-24 text-white text-xs focus:border-blue-500 outline-none"
                                            value={adjustAmount}
                                            onChange={(e) => setAdjustAmount(e.target.value)}
                                        />
                                        <button 
                                            onClick={() => handleAdjustBalance(u.id)}
                                            className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition"
                                        >
                                            <Save size={14} />
                                        </button>
                                        <button 
                                            onClick={() => setEditingUser(null)}
                                            className="p-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => { setEditingUser(u.id); setAdjustAmount(''); }}
                                        className="text-xs font-bold text-blue-400 hover:text-white underline decoration-dotted underline-offset-4"
                                    >
                                        Adjust Balance
                                    </button>
                                )}

                                {/* DELETE USER BUTTON */}
                                {!u.is_admin && (
                                    <button 
                                        onClick={() => handleDeleteUser(u.id, u.username || u.email)}
                                        className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition"
                                        title="Delete User"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
}