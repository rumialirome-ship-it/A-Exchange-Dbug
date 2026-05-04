
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dealer, User, PrizeRates, LedgerEntry, BetLimits, Bet, Game, SubGameType } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'md' | 'lg' | 'xl'; themeColor?: string }> = ({ isOpen, onClose, title, children, size = 'md', themeColor = 'emerald' }) => {
    if (!isOpen) return null;
    const sizeClasses: Record<string, string> = { md: 'max-w-md', lg: 'max-w-3xl', xl: 'max-w-5xl' };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto">
            <div className={`bg-slate-900/95 rounded-xl shadow-2xl w-full border border-${themeColor}-500/30 ${sizeClasses[size]} flex flex-col my-auto max-h-[95vh]`}>
                <div className="flex justify-between items-center p-4 sm:p-5 border-b border-slate-700 flex-shrink-0">
                    <h3 className={`text-base sm:text-lg font-bold text-${themeColor}-400 uppercase tracking-widest`}>{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1">{Icons.close}</button>
                </div>
                <div className="p-4 sm:p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-4 right-4 z-[100] p-4 rounded-lg shadow-2xl border flex items-center gap-3 animate-slide-in max-w-[90vw] sm:max-w-md ${
            type === 'success' ? 'bg-emerald-900 border-emerald-500 text-emerald-50' : 'bg-red-900 border-red-500 text-red-50'
        }`}>
            <span className="text-xl shrink-0">{type === 'success' ? '✅' : '⚠️'}</span>
            <span className="font-semibold text-sm">{message}</span>
            <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100 p-1">{Icons.close}</button>
        </div>
    );
};

const LedgerTable: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => (
    <div className="space-y-4">
        {/* Mobile View */}
        <div className="sm:hidden space-y-3">
            {Array.isArray(entries) && [...entries].reverse().map(entry => (
                <div key={entry.id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700 shadow-md">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] text-slate-500 font-mono">{entry.timestamp?.toLocaleString() || 'N/A'}</div>
                        <div className="text-right">
                            <div className="text-[9px] text-slate-500 uppercase font-black">Balance</div>
                            <div className="font-mono text-white font-bold">Rs {entry.balance.toFixed(2)}</div>
                        </div>
                    </div>
                    <div className="text-sm text-slate-200 mb-2 font-semibold">{entry.description}</div>
                    <div className="flex gap-4">
                        {entry.debit > 0 && (
                            <div>
                                <div className="text-[9px] text-red-500 uppercase font-black">Debit (-)</div>
                                <div className="text-red-400 font-mono font-bold">Rs {entry.debit.toFixed(2)}</div>
                            </div>
                        )}
                        {entry.credit > 0 && (
                            <div>
                                <div className="text-[9px] text-emerald-500 uppercase font-black">Credit (+)</div>
                                <div className="text-emerald-400 font-mono font-bold">Rs {entry.credit.toFixed(2)}</div>
                            </div>
                        )}
                    </div>
                </div>
            ))}
            {(!Array.isArray(entries) || entries.length === 0) && (
                <div className="p-8 text-center text-slate-500 text-sm">No records found.</div>
            )}
        </div>

        {/* Desktop View */}
        <div className="hidden sm:block bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
            <div className="overflow-y-auto max-h-[60vh] mobile-scroll-x">
                <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                        <tr>
                            <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                            <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                            <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                            <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                            <th className="p-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {Array.isArray(entries) && [...entries].reverse().map(entry => (
                            <tr key={entry.id} className="hover:bg-emerald-500/10 text-sm transition-colors">
                                <td className="p-3 text-slate-400 whitespace-nowrap">{entry.timestamp?.toLocaleString() || 'N/A'}</td>
                                <td className="p-3 text-white">{entry.description}</td>
                                <td className="p-3 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                <td className="p-3 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                <td className="p-3 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

export const UserForm: React.FC<{ 
    user?: User; 
    users: User[]; 
    onSave: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>; 
    onCancel: () => void; 
    dealerPrizeRates: PrizeRates, 
    dealerId: string;
    showToast: (msg: string, type: 'success' | 'error') => void 
}> = ({ user, users, onSave, onCancel, dealerId, showToast }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [formData, setFormData] = useState(() => {
        if (user) {
            return {
                id: user.id,
                name: user.name,
                contact: user.contact || '',
                area: user.area || '',
                password: '',
                wallet: user.wallet.toString(),
                commissionRate: (user.commissionRate ?? 0).toString(),
                betLimits: {
                    oneDigit: (user.betLimits?.oneDigit ?? 1000).toString(),
                    twoDigit: (user.betLimits?.twoDigit ?? 5000).toString(),
                    perDraw: (user.betLimits?.perDraw ?? 20000).toString(),
                },
                prizeRates: {
                    oneDigitOpen: (user.prizeRates?.oneDigitOpen ?? 9.50).toString(),
                    oneDigitClose: (user.prizeRates?.oneDigitClose ?? 9.50).toString(),
                    twoDigit: (user.prizeRates?.twoDigit ?? 85.00).toString()
                },
                avatarUrl: user.avatarUrl || ''
            };
        }
        return {
            id: '', name: '', area: '', contact: '', 
            commissionRate: '0', 
            prizeRates: { oneDigitOpen: '9.50', oneDigitClose: '9.50', twoDigit: '85.00' }, 
            avatarUrl: '', wallet: '0',
            betLimits: { oneDigit: '1000', twoDigit: '5000', perDraw: '20000' }
        };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({ 
                ...prev, 
                [parent]: { 
                    ...(prev[parent as keyof typeof prev] as object), 
                    [child]: value 
                } 
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const activePass = user ? (password || user.password) : password;
        
        if (!user && !password) { showToast("⚠️ Password is required.", "error"); return; }
        if (password && password !== confirmPassword) { showToast("⚠️ Passwords do not match.", "error"); return; }
        
        const isIdTaken = !user && users.some(u => u.id.toLowerCase() === formData.id.toLowerCase());
        if (isIdTaken) { showToast("⚠️ Username already exists.", "error"); return; }

        setIsLoading(true);
        try {
            const userPayload: User = {
                id: formData.id,
                name: formData.name,
                contact: formData.contact,
                area: formData.area,
                password: activePass,
                dealerId,
                wallet: Number(formData.wallet) || 0,
                commissionRate: Number(formData.commissionRate) || 0,
                isRestricted: user?.isRestricted ?? false,
                ledger: [], 
                avatarUrl: formData.avatarUrl,
                betLimits: {
                    oneDigit: Number(formData.betLimits.oneDigit) || 0,
                    twoDigit: Number(formData.betLimits.twoDigit) || 0,
                    perDraw: Number(formData.betLimits.perDraw) || 0
                },
                prizeRates: {
                    oneDigitOpen: Number(formData.prizeRates.oneDigitOpen) || 0,
                    oneDigitClose: Number(formData.prizeRates.oneDigitClose) || 0,
                    twoDigit: Number(formData.prizeRates.twoDigit) || 0
                }
            };

            await onSave(userPayload, user?.id, user ? undefined : Number(formData.wallet));
            showToast(user ? "✅ User updated successfully!" : "✅ User added successfully!", "success");
            onCancel();
        } catch (err: any) {
            showToast(`⚠️ ${err.message || 'Error processing user'}`, 'error');
        } finally {
            setIsLoading(false); 
        }
    };

    const inputClass = "w-full bg-slate-800 p-2.5 rounded-md border border-slate-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white text-sm transition-all";
    const labelClass = "block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-widest";

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-1">
                    <label className={labelClass}>Username / Login ID</label>
                    <input type="text" name="id" value={formData.id} onChange={handleChange} className={inputClass} required disabled={!!user} placeholder="e.g. jhon123" />
                </div>
                <div className="sm:col-span-1">
                    <label className={labelClass}>Full Display Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className={inputClass} required placeholder="e.g. Jhon Doe" />
                </div>
                <div className="sm:col-span-1">
                    <label className={labelClass}>Phone Number</label>
                    <input type="tel" name="contact" value={formData.contact} onChange={handleChange} className={inputClass} required placeholder="e.g. 03001234567" />
                </div>
                <div className="sm:col-span-1">
                    <label className={labelClass}>City / Area</label>
                    <input type="text" name="area" value={formData.area} onChange={handleChange} className={inputClass} required placeholder="e.g. Karachi" />
                </div>
                
                <div className="sm:col-span-1 relative">
                    <label className={labelClass}>{user ? "Change Password (optional)" : "Password"}</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} required={!user} />
                    <button type="button" onClick={() => setIsPasswordVisible(!isPasswordVisible)} className="absolute right-3 top-7 text-slate-500">{isPasswordVisible ? Icons.eyeOff : Icons.eye}</button>
                </div>
                <div className="sm:col-span-1">
                    <label className={labelClass}>Confirm Password</label>
                    <input type={isPasswordVisible ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} required={!!password} />
                </div>

                <div className="sm:col-span-1">
                    <label className={labelClass}>Wallet Balance (PKR)</label>
                    <input type="text" name="wallet" value={formData.wallet} onChange={handleChange} className={inputClass} disabled={!!user} />
                </div>
                <div className="sm:col-span-1">
                    <label className={labelClass}>User Commission Rate (%)</label>
                    <input type="text" name="commissionRate" value={formData.commissionRate} onChange={handleChange} className={inputClass} placeholder="e.g. 5.5" />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div className="sm:col-span-3 text-xs font-black text-emerald-500 uppercase tracking-tighter mb-1">Prize Settings</div>
                <div>
                    <label className={labelClass}>Rate (2 Digit)</label>
                    <input type="text" name="prizeRates.twoDigit" value={formData.prizeRates.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Rate (Open)</label>
                    <input type="text" name="prizeRates.oneDigitOpen" value={formData.prizeRates.oneDigitOpen} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Rate (Close)</label>
                    <input type="text" name="prizeRates.oneDigitClose" value={formData.prizeRates.oneDigitClose} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
                <div className="sm:col-span-3 text-xs font-black text-cyan-500 uppercase tracking-tighter mb-1">Bet Limits</div>
                <div>
                    <label className={labelClass}>Limit (2D)</label>
                    <input type="text" name="betLimits.twoDigit" value={formData.betLimits.twoDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Limit (1D)</label>
                    <input type="text" name="betLimits.oneDigit" value={formData.betLimits.oneDigit} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                    <label className={labelClass}>Per Draw</label>
                    <input type="text" name="betLimits.perDraw" value={formData.betLimits.perDraw} onChange={handleChange} className={inputClass} />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
                <button type="button" onClick={onCancel} className="flex-1 sm:flex-none px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-all">Cancel</button>
                <button type="submit" disabled={isLoading} className="flex-[2] sm:flex-none px-10 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30">
                    {isLoading ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> Processing...</> : user ? "Update Profile" : "Create User"}
                </button>
            </div>
        </form>
    );
};

const MoreOptionsDropdown: React.FC<{ 
    user: User; 
    onEdit: () => void; 
    onLedger: () => void; 
    onToggleStatus: () => void; 
    onDelete: () => void;
}> = ({ user, onEdit, onLedger, onToggleStatus, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const clickOut = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false); };
        document.addEventListener('mousedown', clickOut);
        return () => document.removeEventListener('mousedown', clickOut);
    }, []);

    const btnClass = "w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-colors flex items-center gap-3";

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-slate-700/50 rounded-lg transition-all text-slate-400 hover:text-white border border-transparent hover:border-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" /></svg>
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[60] overflow-hidden animate-fade-in divide-y divide-slate-700/50">
                    <button onClick={() => { onEdit(); setIsOpen(false); }} className={`${btnClass} text-sky-400`}>Edit Account</button>
                    <button onClick={() => { onLedger(); setIsOpen(false); }} className={`${btnClass} text-emerald-400`}>Transaction Ledger</button>
                    <button onClick={() => { onToggleStatus(); setIsOpen(false); }} className={`${btnClass} ${user.isRestricted ? 'text-green-400' : 'text-amber-400'}`}>
                        {user.isRestricted ? 'Unblock Access' : 'Restrict Access'}
                    </button>
                    <button onClick={() => { if(window.confirm(`Permanently delete ${user.name}? This cannot be undone.`)) onDelete(); setIsOpen(false); }} className={`${btnClass} text-red-500 hover:bg-red-950/30`}>Delete Account</button>
                </div>
            )}
        </div>
    );
};

interface DealerPanelProps {
  dealer: Dealer;
  users: User[];
  onSaveUser: (user: User, originalId?: string, initialDeposit?: number) => Promise<void>;
  onDeleteUser: (uId: string) => Promise<void>;
  topUpUserWallet: (userId: string, amount: number) => Promise<void>;
  withdrawFromUserWallet: (userId: string, amount: number) => Promise<void>;
  toggleAccountRestriction: (userId: string, userType: 'user') => void;
  bets: Bet[];
  games: Game[];
  placeBetAsDealer: (details: { userId: string; gameId: string; betGroups: any[] }) => Promise<void>;
  isLoaded?: boolean;
}

const DealerPanel: React.FC<DealerPanelProps> = ({ dealer, users, onSaveUser, onDeleteUser, topUpUserWallet, withdrawFromUserWallet, toggleAccountRestriction, bets, games, placeBetAsDealer, isLoaded = false }) => {
  const [activeTab, setActiveTab] = useState('users');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | undefined>(undefined);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [viewingUserLedgerFor, setViewingUserLedgerFor] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
  const safeDealer = dealer || { id: '', name: '', prizeRates: {}, ledger: [], commissionRate: 0 };

  const showToast = (msg: string, type: 'success' | 'error') => setToast({ msg, type });

  const dealerUsers = useMemo(() => {
        return safeUsers
            .filter(user => {
                if (!user) return false;
                const query = searchQuery.toLowerCase();
                return (user.name || '').toLowerCase().includes(query) || (user.id || '').toLowerCase().includes(query) || (user.area || '').toLowerCase().includes(query);
            });
  }, [safeUsers, searchQuery]);

  const tabs = [
    { id: 'users', label: 'Users', icon: Icons.userGroup },
    { id: 'terminal', label: 'Terminal', icon: Icons.clipboardList },
    { id: 'wallet', label: 'Wallet', icon: Icons.wallet },
    { id: 'history', label: 'History', icon: Icons.bookOpen },
  ];

  if (!dealer) return <div className="p-8 text-center text-slate-400">Loading dealer profile...</div>;

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-[85vh]">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 sm:mb-8 gap-4">
          <div className="flex flex-col">
            <h2 className="text-2xl sm:text-3xl font-black text-emerald-400 uppercase tracking-tighter">Dealer Panel</h2>
            <div className="flex items-center gap-2 mt-1">
                <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded border border-emerald-500/20 font-black uppercase tracking-widest">
                    My Commission: {safeDealer.commissionRate}%
                </span>
            </div>
          </div>
          <div className="bg-slate-800/50 p-1 rounded-lg flex items-center space-x-1 border border-slate-700 w-full md:w-auto overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 flex items-center space-x-2 py-2 px-3 sm:px-4 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-md transition-all ${activeTab === tab.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                    {tab.icon} <span>{tab.label}</span>
                </button>
            ))}
          </div>
      </div>
      
      {activeTab === 'users' && (
        <div className="animate-fade-in">
           <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-4 gap-3">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">Managed Users <span className="bg-slate-800 px-2 py-0.5 rounded text-xs text-emerald-400 font-mono">{dealerUsers.length}</span></h3>
            <div className="flex gap-2">
                <div className="relative flex-grow sm:w-64">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">{Icons.search}</span>
                    <input type="text" placeholder="Search accounts..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-800 p-2 pl-10 rounded-lg border border-slate-700 text-white w-full text-xs focus:ring-1 focus:ring-emerald-500" />
                </div>
                <button onClick={() => { setSelectedUser(undefined); setIsUserModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg font-black px-4 sm:px-6 transition-all shadow-xl shadow-emerald-900/20 whitespace-nowrap text-xs uppercase tracking-widest">New User</button>
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-xl overflow-hidden border border-slate-700 backdrop-blur-sm shadow-2xl">
            <div className="overflow-x-auto mobile-scroll-x">
                <table className="w-full text-left min-w-[900px]">
                    <thead className="bg-slate-800/80 border-b border-slate-700">
                        <tr>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Account Info</th>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Location</th>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Balance (PKR)</th>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Comm %</th>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Status</th>
                            <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {!isLoaded ? (
                            <tr><td colSpan={6} className="p-12 text-center text-slate-500 font-bold animate-pulse text-xs uppercase tracking-widest">Synchronizing Encrypted Data...</td></tr>
                        ) : dealerUsers.length === 0 ? (
                            <tr><td colSpan={6} className="p-12 text-center text-slate-500 font-bold text-xs uppercase tracking-widest">No users found in your network.</td></tr>
                        ) : dealerUsers.map(user => (
                            <tr key={user.id} className="hover:bg-slate-700/20 transition-all">
                                <td className="p-4">
                                    <div className="font-bold text-white text-sm">{user.name}</div>
                                    <div className="text-[10px] text-slate-500 font-mono tracking-tighter uppercase">{user.id}</div>
                                </td>
                                <td className="p-4">
                                    <div className="text-xs text-slate-300 font-semibold">{user.area || '-'}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">{user.contact || '-'}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="font-mono text-emerald-400 font-bold text-sm">{user.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-tighter">Current Funds</div>
                                </td>
                                <td className="p-4 text-center">
                                    <div className="font-bold text-white text-xs">{user.commissionRate}%</div>
                                </td>
                                <td className="p-4 text-center">
                                    {user.isRestricted ? 
                                        <span className="bg-red-500/10 text-red-500 text-[9px] px-2 py-0.5 rounded-full border border-red-500/20 font-black uppercase tracking-tighter">Locked</span> : 
                                        <span className="bg-green-500/10 text-green-500 text-[9px] px-2 py-0.5 rounded-full border border-green-500/20 font-black uppercase tracking-tighter">Active</span>
                                    }
                                </td>
                                <td className="p-4 text-right">
                                    <MoreOptionsDropdown 
                                        user={user} 
                                        onEdit={() => { setSelectedUser(user); setIsUserModalOpen(true); }} 
                                        onLedger={() => setViewingUserLedgerFor(user)} 
                                        onToggleStatus={() => { toggleAccountRestriction(user.id, 'user'); showToast("Status updated.", "success"); }} 
                                        onDelete={async () => { try { await onDeleteUser(user.id); showToast("Account deleted successfully.", "success"); } catch(e) { showToast("Error deleting account.", "error"); } }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button onClick={() => setIsTopUpModalOpen(true)} className="flex-1 sm:flex-none bg-slate-800 hover:bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 p-3 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                    {Icons.plus} Deposit
                </button>
                <button onClick={() => setIsWithdrawalModalOpen(true)} className="flex-1 sm:flex-none bg-slate-800 hover:bg-amber-900/30 text-amber-400 border border-amber-500/30 p-3 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                    {Icons.minus} Withdraw
                </button>
          </div>
        </div>
      )}

      {activeTab === 'terminal' && <div className="animate-fade-in"><BettingTerminalView users={safeUsers} games={games} placeBetAsDealer={placeBetAsDealer} /></div>}
      {activeTab === 'wallet' && <div className="animate-fade-in"><WalletView dealer={safeDealer as Dealer} /></div>}
      {activeTab === 'history' && <div className="animate-fade-in"><BetHistoryView bets={bets} games={games} users={safeUsers} /></div>}

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={selectedUser ? "Update Profile" : "Onboard New User"} themeColor="emerald">
          <UserForm user={selectedUser} users={safeUsers} onSave={onSaveUser} onCancel={() => setIsUserModalOpen(false)} dealerPrizeRates={safeDealer.prizeRates as PrizeRates} dealerId={safeDealer.id} showToast={showToast} />
      </Modal>

      <Modal isOpen={isTopUpModalOpen} onClose={() => setIsTopUpModalOpen(false)} title="Fund User Account" themeColor="emerald">
          <UserTransactionForm type="Top-Up" users={dealerUsers} onTransaction={async (userId, amount) => { await topUpUserWallet(userId, amount); showToast("✅ Funding completed!", "success"); setIsTopUpModalOpen(false); }} onCancel={() => setIsTopUpModalOpen(false)} />
      </Modal>

      <Modal isOpen={isWithdrawalModalOpen} onClose={() => setIsWithdrawalModalOpen(false)} title="Cash Out User Funds" themeColor="amber">
          <UserTransactionForm type="Withdrawal" users={dealerUsers} onTransaction={async (userId, amount) => { await withdrawFromUserWallet(userId, amount); showToast("✅ Payout completed!", "success"); setIsWithdrawalModalOpen(false); }} onCancel={() => setIsWithdrawalModalOpen(false)} />
      </Modal>

      {viewingUserLedgerFor && (
        <Modal isOpen={!!viewingUserLedgerFor} onClose={() => setViewingUserLedgerFor(null)} title={`Ledger: ${viewingUserLedgerFor.name}`} size="xl" themeColor="cyan">
            <LedgerTable entries={viewingUserLedgerFor.ledger} />
        </Modal>
      )}
    </div>
  );
};

const WalletView: React.FC<{ dealer: Dealer }> = ({ dealer }) => {
    if (!dealer) return null;
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-500 uppercase text-[10px] font-black tracking-widest mb-1">Available Pool</p>
                    <p className="text-3xl font-black text-emerald-400 font-mono">PKR {dealer.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col items-center justify-center text-center">
                    <p className="text-slate-500 uppercase text-[10px] font-black tracking-widest mb-1">Log Count</p>
                    <p className="text-3xl font-black text-white font-mono">{dealer.ledger?.length || 0}</p>
                </div>
            </div>
            <LedgerTable entries={dealer.ledger} />
        </div>
    );
};

const OpenGameOption: React.FC<{ game: Game }> = ({ game }) => {
    const { status, text } = useCountdown(game.drawTime);
    if (!game.isMarketOpen) return null;
    return <option value={game.id}>{game.name} (Draw: {game.drawTime})</option>;
};

const BettingTerminalView: React.FC<{ users: User[]; games: Game[]; placeBetAsDealer: (details: any) => Promise<void> }> = ({ users, games, placeBetAsDealer }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedGameId, setSelectedGameId] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleProcessBets = async () => {
        if (!selectedUserId || !selectedGameId || !bulkInput) return;
        setIsLoading(true);
        try {
            const lines = bulkInput.split('\n').filter(l => l.trim());
            const betGroups: any[] = [];
            lines.forEach(line => {
                // Support both "43 rs100" and shorthand "43 100"
                const stakeMatch = line.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
                const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
                if (stake <= 0) return;
                const numbersPart = line.substring(0, stakeMatch!.index).trim();
                const numbers = numbersPart.split(/[-.,\s]+/).filter(n => n.length > 0);
                if (numbers.length > 0) {
                    betGroups.push({ subGameType: SubGameType.TwoDigit, numbers, amountPerNumber: stake });
                }
            });
            if (betGroups.length === 0) { alert("Invalid Format: use '14, 25 100'"); setIsLoading(false); return; }
            await placeBetAsDealer({ userId: selectedUserId, gameId: selectedGameId, betGroups });
            setBulkInput('');
            alert("Bets confirmed successfully!");
        } catch (error: any) {
            alert(error.message || "Terminal processing error.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-800/50 p-5 sm:p-6 rounded-2xl border border-slate-700 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">Bulk Entry Terminal {Icons.clipboardList}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-slate-900 text-white p-3 rounded-xl border border-slate-700 text-xs font-bold uppercase tracking-wider">
                    <option value="">-- Choose Account --</option>
                    {Array.isArray(users) && users.filter(u => !u.isRestricted).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
                </select>
                <select value={selectedGameId} onChange={e => setSelectedGameId(e.target.value)} className="bg-slate-900 text-white p-3 rounded-xl border border-slate-700 text-xs font-bold uppercase tracking-wider">
                    <option value="">-- Choose Market --</option>
                    {Array.isArray(games) && games.map(g => <OpenGameOption key={g.id} game={g} />)}
                </select>
            </div>
            <textarea rows={8} value={bulkInput} onChange={e => setBulkInput(e.target.value)} placeholder="Entry Format Example:&#10;14, 25 50&#10;88, 91 100" className="w-full bg-slate-900 text-white p-4 rounded-xl border border-slate-700 font-mono text-xs focus:ring-1 focus:ring-emerald-500" />
            <div className="flex justify-end mt-4">
                <button onClick={handleProcessBets} disabled={!selectedUserId || !selectedGameId || !bulkInput || isLoading} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 px-10 rounded-xl disabled:opacity-50 transition-all uppercase tracking-widest text-xs shadow-lg shadow-emerald-900/40">
                    {isLoading ? 'PROCESSING...' : 'CONFIRM BULK ENTRIES'}
                </button>
            </div>
        </div>
    );
};

const UserTransactionForm: React.FC<{ users: User[]; onTransaction: (userId: string, amount: number) => Promise<void>; onCancel: () => void; type: 'Top-Up' | 'Withdrawal' }> = ({ users, onTransaction, onCancel, type }) => {
    const [selectedUserId, setSelectedUserId] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const themeColor = type === 'Top-Up' ? 'emerald' : 'amber';
    const inputClass = `w-full bg-slate-800 p-3 rounded-xl border border-slate-700 focus:ring-2 focus:ring-${themeColor}-500 text-white text-sm font-bold`;
    return (
        <form onSubmit={async (e) => { e.preventDefault(); if (selectedUserId && amount && amount > 0) { await onTransaction(selectedUserId, Number(amount)); } }} className="space-y-4">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClass} required>
                <option value="">-- Choose User --</option>
                {Array.isArray(users) && users.map(u => (
                    <option key={u.id} value={u.id}>
                        {u.name} ({u.id}) — Balance: PKR {u.wallet.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </option>
                ))}
            </select>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Amount (PKR)" className={inputClass} min="0.01" required step="0.01" />
            <div className="flex gap-3 pt-2">
                <button type="button" onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg text-sm transition-all uppercase tracking-widest">Cancel</button>
                <button type="submit" className={`flex-1 font-black py-2.5 rounded-lg text-white text-sm shadow-lg bg-${themeColor}-600 hover:bg-${themeColor}-500 transition-all uppercase tracking-widest`}>{type}</button>
            </div>
        </form>
    );
};

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], users: User[] }> = ({ bets, games, users }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');
    
    const filteredBets = useMemo(() => {
        if (!Array.isArray(bets)) return [];
        return bets.filter(bet => {
            const dateStr = new Date(bet.timestamp).toISOString().split('T')[0];
            if (startDate && dateStr < startDate) return false;
            if (endDate && dateStr > endDate) return false;
            if (searchTerm.trim()) {
                const user = users.find(u => u.id === bet.userId);
                const game = games.find(g => g.id === bet.gameId);
                return user?.name.toLowerCase().includes(searchTerm.toLowerCase()) || game?.name.toLowerCase().includes(searchTerm.toLowerCase()) || user?.id.toLowerCase().includes(searchTerm.toLowerCase());
            }
            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [bets, games, users, startDate, endDate, searchTerm]);

    return (
        <div className="space-y-4">
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded-xl text-[10px] border border-slate-700 font-bold uppercase tracking-widest w-full" />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-900 text-white p-2 rounded-xl text-[10px] border border-slate-700 font-bold uppercase tracking-widest w-full" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Filter History..." className="bg-slate-900 text-white p-2 rounded-xl text-[10px] border border-slate-700 font-bold uppercase tracking-widest w-full" />
                <button onClick={() => {setStartDate(''); setEndDate(''); setSearchTerm('');}} className="bg-slate-700 text-white p-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-600 transition-all w-full">Clear Filters</button>
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-3">
                {filteredBets.map(bet => (
                    <div key={bet.id} className="bg-slate-800/40 p-4 rounded-xl border border-slate-700 shadow-lg">
                        <div className="flex justify-between items-start mb-2">
                            <div className="text-[10px] text-slate-500 font-mono">{new Date(bet.timestamp).toLocaleString()}</div>
                            <div className="text-right font-mono text-emerald-400 font-bold text-sm">Rs {bet.totalAmount.toLocaleString()}</div>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-sm font-bold text-white">{users.find(u => u.id === bet.userId)?.name || 'Unknown'}</div>
                            <div className="text-xs font-bold text-sky-400">{games.find(g => g.id === bet.gameId)?.name || 'Game'}</div>
                        </div>
                        <div className="pt-2 border-t border-slate-700/50">
                            <div className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{bet.subGameType}</div>
                            <div className="text-[10px] text-slate-500 font-mono break-words">{bet.numbers.join(', ')}</div>
                        </div>
                    </div>
                ))}
                {filteredBets.length === 0 && <div className="p-12 text-center text-slate-500 text-xs uppercase font-black">No records found.</div>}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block bg-slate-800/40 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/80 border-b border-slate-700">
                            <tr>
                                <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">Time</th>
                                <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">Player</th>
                                <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">Game</th>
                                <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-widest">Details</th>
                                <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-widest text-right">Stake</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredBets.map(bet => (
                                <tr key={bet.id} className="hover:bg-slate-700/20 transition-colors">
                                    <td className="p-4 text-[10px] text-slate-400 whitespace-nowrap font-mono">{new Date(bet.timestamp).toLocaleString()}</td>
                                    <td className="p-4 text-xs font-bold text-white">{users.find(u => u.id === bet.userId)?.name || 'Unknown'}</td>
                                    <td className="p-4 text-xs font-bold text-sky-400">{games.find(g => g.id === bet.gameId)?.name || 'Game'}</td>
                                    <td className="p-4">
                                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{bet.subGameType}</div>
                                        <div className="text-[10px] text-slate-500 font-mono">{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-4 text-right font-mono text-white text-xs font-bold">{bet.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DealerPanel;
