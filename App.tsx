import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Role, User, Dealer, Admin, Game, Bet, LedgerEntry, SubGameType, PrizeRates } from './types';
import { Icons, GAME_LOGOS } from './constants';
import LandingPage from './components/LandingPage';
import AdminPanel from './components/AdminPanel';
import DealerPanel from './components/DealerPanel';
import UserPanel from './components/UserPanel';
import ResultRevealOverlay from './components/ResultRevealOverlay';
import { AuthProvider, useAuth } from './hooks/useAuth';

const Header: React.FC = () => {
    const { role, account, logout } = useAuth();
    if (!role || !account) return null;

    const roleColors: { [key in Role]: string } = {
        [Role.Admin]: 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.5)]',
        [Role.Dealer]: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.5)]',
        [Role.User]: 'bg-sky-500/20 text-sky-300 border-sky-500/30 shadow-[0_0_10px_rgba(14,165,233,0.5)]',
    };

    return (
        <header className="sticky top-0 z-40 bg-slate-900/50 backdrop-blur-lg border-b border-cyan-400/20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-20">
                <div className="flex items-center gap-4">
                    {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt={account.name} className="w-12 h-12 rounded-full object-cover border-2 border-cyan-400/50" />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-cyan-400/50 flex items-center justify-center">
                            <span className="font-bold text-xl text-cyan-300">{account.name ? account.name.charAt(0) : '?'}</span>
                        </div>
                    )}
                    <div>
                        <h1 className="text-xl font-bold glitch-text hidden md:block" data-text="A-BABA EXCHANGE">A-BABA EXCHANGE</h1>
                         <div className="flex items-center text-sm">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold mr-2 ${roleColors[role] || 'bg-slate-700'}`}>{role}</span>
                            <span className="text-slate-300 font-semibold tracking-wider">{account.name || 'Account'}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                     { typeof account.wallet === 'number' && (
                        <div className="hidden md:flex items-center bg-slate-800/50 px-4 py-2 rounded-md border border-slate-700 shadow-inner">
                            {React.cloneElement(Icons.wallet, { className: "h-6 w-6 mr-3 text-cyan-400" })}
                            <span className="font-semibold text-white text-lg tracking-wider">PKR {account.wallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <button onClick={logout} className="bg-slate-700/50 border border-slate-600 hover:bg-red-500/30 hover:border-red-500/50 text-white font-bold py-2 px-4 rounded-md transition-all duration-300">Logout</button>
                </div>
            </div>
        </header>
    );
};

const AppContent: React.FC = () => {
    const { role, account, loading, fetchWithAuth, verifyData, setAccount } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [dealers, setDealers] = useState<Dealer[]>([]);
    const [games, setGames] = useState<Game[]>([]);
    const [gameFetchError, setGameFetchError] = useState<string | null>(null);
    const [bets, setBets] = useState<Bet[]>([]);
    const [hasInitialFetched, setHasInitialFetched] = useState(false);
    
    const [activeReveal, setActiveReveal] = useState<{ name: string; number: string } | null>(null);
    const lastGamesRef = useRef<Game[]>([]);

    const parseAllDates = (data: any) => {
        if (!data) return data;
        const parseLedger = (ledger: LedgerEntry[] = []) => ledger.map(e => ({...e, timestamp: new Date(e.timestamp)}));
        if (data.users && Array.isArray(data.users)) data.users = data.users.map((u: User) => u ? ({...u, ledger: parseLedger(u.ledger)}) : null).filter(Boolean);
        if (data.dealers && Array.isArray(data.dealers)) data.dealers = data.dealers.map((d: Dealer) => d ? ({...d, ledger: parseLedger(d.ledger)}) : null).filter(Boolean);
        if (data.bets && Array.isArray(data.bets)) data.bets = data.bets.map((b: Bet) => ({...b, timestamp: new Date(b.timestamp)}));
        if (data.account && data.account.ledger) data.account.ledger = parseLedger(data.account.ledger);
        return data;
    };

    const fetchPublicData = useCallback(async () => {
        try {
            console.log(`[DEBUG] Fetching games from origin: ${window.location.origin}`);
            setGameFetchError(null);
            const gamesResponse = await fetch(`/api/games?t=${Date.now()}`);
            console.log("Games response status:", gamesResponse.status);
            if (gamesResponse.ok) {
                const data = await gamesResponse.json();
                console.log("Games data received:", data.length, "items");
                setGames(data);
            } else {
                const text = await gamesResponse.text();
                const err = `Failed to fetch games. Status: ${gamesResponse.status}`;
                console.error(err, "Body:", text.slice(0, 100));
                setGameFetchError(err);
            }
        } catch (e: any) {
            console.error("Games fetch exception:", e);
            setGameFetchError(`Fetch error: ${e.message || 'Unknown error'}`);
        }
    }, []);

    const fetchPrivateData = useCallback(async () => {
        if (!role) return;
        try {
            const endpoint = role === Role.Admin ? '/api/admin/data' : (role === Role.Dealer ? '/api/dealer/data' : '/api/user/data');
            const response = await fetchWithAuth(endpoint);
            if (response.ok) {
                const parsedData = parseAllDates(await response.json());
                if (parsedData.account) setAccount(parsedData.account);
                if (role === Role.Admin) { setUsers(parsedData.users); setDealers(parsedData.dealers); setBets(parsedData.bets); }
                else if (role === Role.Dealer) { setUsers(parsedData.users); setBets(parsedData.bets); }
                else { setBets(parsedData.bets); }
                setHasInitialFetched(true);
            }
        } catch (error) {
            console.error("Private fetch error", error);
        }
    }, [role, fetchWithAuth, setAccount]);

    useEffect(() => {
        if (!loading && verifyData) {
            const parsed = parseAllDates(verifyData);
            if (parsed.users) setUsers(parsed.users);
            if (parsed.dealers) setDealers(parsed.dealers);
            if (parsed.bets) setBets(parsed.bets);
            setHasInitialFetched(true);
        }
    }, [loading, verifyData]);

    useEffect(() => {
        fetchPublicData();
        const interval = setInterval(fetchPublicData, 10000);
        return () => clearInterval(interval);
    }, [fetchPublicData]);

    useEffect(() => {
        if (role) {
            if (!hasInitialFetched) fetchPrivateData();
            const interval = setInterval(fetchPrivateData, 8000);
            return () => clearInterval(interval);
        } else {
            setHasInitialFetched(false);
            setUsers([]); setBets([]); setDealers([]);
        }
    }, [role, fetchPrivateData]);

    useEffect(() => {
        if (games.length > 0 && lastGamesRef.current.length > 0) {
            games.forEach(newGame => {
                const oldGame = lastGamesRef.current.find(g => g.id === newGame.id);
                if (newGame.winningNumber && !newGame.winningNumber.endsWith('_') && (!oldGame?.winningNumber || oldGame.winningNumber.endsWith('_'))) {
                    setActiveReveal({ name: newGame.name, number: newGame.winningNumber });
                }
            });
        }
        lastGamesRef.current = games;
    }, [games]);

    const placeBet = async (d: any) => { 
        try {
            await fetchWithAuth('/api/user/bets', { method: 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    };
    
    const placeBetAsDealer = async (d: any) => { 
        try {
            await fetchWithAuth('/api/dealer/bets/bulk', { method: 'POST', body: JSON.stringify(d) }); 
            fetchPrivateData(); 
        } catch (err: any) { alert(err.message); }
    };
    
    const onSaveUser = async (u: any, o: any, i: any) => {
        const method = o ? 'PUT' : 'POST';
        const url = o ? `/api/dealer/users/${o}` : '/api/dealer/users';
        const response = await fetchWithAuth(url, { method, body: JSON.stringify(o ? u : { userData: u, initialDeposit: i }) });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Operation failed');
        }
        fetchPrivateData();
    };

    const onDeleteUser = async (uId: string) => {
        try {
            const response = await fetchWithAuth(`/api/dealer/users/${uId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Failed to delete user");
            fetchPrivateData();
        } catch (err: any) { alert(err.message); }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-cyan-400 text-xl font-bold">Synchronizing Session...</div>;

    return (
        <div className="min-h-screen flex flex-col">
            {!role || !account ? (
                <LandingPage games={games} error={gameFetchError} />
            ) : (
                <>
                    <Header />
                    <main className="flex-grow">
                        {role === Role.User && <UserPanel user={account as User} games={games} bets={bets} placeBet={placeBet} />}
                        {role === Role.Dealer && (
                            <DealerPanel 
                                dealer={account as Dealer} users={users} 
                                onSaveUser={onSaveUser} 
                                onDeleteUser={onDeleteUser}
                                topUpUserWallet={async (id, amt) => { 
                                    try {
                                        await fetchWithAuth('/api/dealer/topup/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); throw err; }
                                }} 
                                withdrawFromUserWallet={async (id, amt) => { 
                                    try {
                                        await fetchWithAuth('/api/dealer/withdraw/user', { method: 'POST', body: JSON.stringify({ userId: id, amount: amt }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); throw err; }
                                }} 
                                toggleAccountRestriction={async (id) => { 
                                    try {
                                        await fetchWithAuth(`/api/dealer/users/${id}/toggle-restriction`, { method: 'PUT' }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }} 
                                bets={bets} games={games} placeBetAsDealer={placeBetAsDealer} isLoaded={hasInitialFetched}
                            />
                        )}
                        {role === Role.Admin && (
                            <AdminPanel 
                                admin={account as Admin} dealers={dealers} 
                                onSaveDealer={async (d, o) => { 
                                    try {
                                        const url = o ? `/api/admin/dealers/${o}` : '/api/admin/dealers'; 
                                        await fetchWithAuth(url, { method: o ? 'PUT' : 'POST', body: JSON.stringify(d) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }} 
                                onUpdateAdmin={async (a) => { 
                                    try {
                                        await fetchWithAuth('/api/admin/profile', { method: 'PUT', body: JSON.stringify(a) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                users={users} setUsers={setUsers} games={games} bets={bets} 
                                declareWinner={async (id, num) => { 
                                    try {
                                        await fetchWithAuth(`/api/admin/games/${id}/declare-winner`, { method: 'POST', body: JSON.stringify({ winningNumber: num }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                updateWinner={async (id, num) => { 
                                    try {
                                        await fetchWithAuth(`/api/admin/games/${id}/update-winner`, { method: 'PUT', body: JSON.stringify({ newWinningNumber: num }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                approvePayouts={async (id) => { 
                                    try {
                                        await fetchWithAuth(`/api/admin/games/${id}/approve-payouts`, { method: 'POST' }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                topUpDealerWallet={async (id, amt) => { 
                                    try {
                                        await fetchWithAuth('/api/admin/topup/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                withdrawFromDealerWallet={async (id, amt) => { 
                                    try {
                                        await fetchWithAuth('/api/admin/withdraw/dealer', { method: 'POST', body: JSON.stringify({ dealerId: id, amount: amt }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                toggleAccountRestriction={async (id, type) => { 
                                    try {
                                        await fetchWithAuth(`/api/admin/accounts/${type}/${id}/toggle-restriction`, { method: 'PUT' }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                onPlaceAdminBets={async (d) => { 
                                    try {
                                        await fetchWithAuth('/api/admin/bulk-bet', { method: 'POST', body: JSON.stringify(d) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                updateGameDrawTime={async (id, time) => { 
                                    try {
                                        await fetchWithAuth(`/api/admin/games/${id}/draw-time`, { method: 'PUT', body: JSON.stringify({ newDrawTime: time }) }); 
                                        fetchPrivateData(); 
                                    } catch (err: any) { alert(err.message); }
                                }}
                                onRefreshData={fetchPrivateData} 
                            />
                        )}
                    </main>
                </>
            )}
            {activeReveal && <ResultRevealOverlay gameName={activeReveal.name} winningNumber={activeReveal.number} onClose={() => setActiveReveal(null)} />}
        </div>
    );
};

function App() { return (<div className="App bg-transparent text-slate-200 h-full"><AuthProvider><AppContent /></AuthProvider></div>); }
export default App;