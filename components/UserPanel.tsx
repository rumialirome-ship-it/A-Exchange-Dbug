import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Game, SubGameType, LedgerEntry, Bet, PrizeRates, BetLimits } from '../types';
import { Icons } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../hooks/useAuth';

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const Toast: React.FC<{ message: string; type: 'success' | 'error'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-4 right-4 z-[2000] p-4 rounded-lg shadow-2xl border flex items-center gap-3 animate-slide-in max-w-[90vw] sm:max-w-md ${
            type === 'success' ? 'bg-emerald-900 border-emerald-500 text-emerald-50' : 'bg-red-900 border-red-500 text-red-50'
        }`}>
            <span className="text-xl shrink-0">{type === 'success' ? '✅' : '⚠️'}</span>
            <span className="font-semibold text-sm">{message}</span>
            <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100 p-1">{Icons.close}</button>
        </div>
    );
};

// Helper to calculate payout for a single bet (internal use)
const calculateBetPayout = (bet: Bet, game: Game | undefined, userPrizeRates: PrizeRates) => {
    if (!game || !game.winningNumber || game.winningNumber.includes('_')) return 0;

    const winningNumber = game.winningNumber;
    let winningNumbersCount = 0;

    bet.numbers.forEach(num => {
        let isWin = false;
        switch (bet.subGameType) {
            case SubGameType.OneDigitOpen:
                if (winningNumber.length === 2) { isWin = num === winningNumber[0]; }
                break;
            case SubGameType.OneDigitClose:
                if (game.name === 'AKC') { isWin = num === winningNumber; } 
                else if (winningNumber.length === 2) { isWin = num === winningNumber[1]; }
                break;
            default: // Covers TwoDigit, Bulk, Combo
                isWin = num === winningNumber;
                break;
        }
        if (isWin) winningNumbersCount++;
    });

    if (winningNumbersCount > 0) {
        const getPrizeMultiplier = (rates: PrizeRates, subGameType: SubGameType) => {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: return rates.oneDigitOpen;
                case SubGameType.OneDigitClose: return rates.oneDigitClose;
                default: return rates.twoDigit;
            }
        };
        const multiplier = getPrizeMultiplier(userPrizeRates, bet.subGameType);
        return winningNumbersCount * bet.amountPerNumber * multiplier;
    }
    return 0;
};

const GameStakeBreakdown: React.FC<{ games: Game[], bets: Bet[], user: User }> = ({ games, bets, user }) => {
    const data = useMemo(() => {
        return games.map(game => {
            const gameBets = bets.filter(b => b.gameId === game.id);
            const totalStake = gameBets.reduce((sum, b) => sum + b.totalAmount, 0);
            const totalCommission = gameBets.reduce((sum, b) => sum + (b.totalAmount * (user.commissionRate / 100)), 0);
            
            // Calculate total prize won for this specific game
            const totalPrize = gameBets.reduce((sum, bet) => {
                return sum + calculateBetPayout(bet, game, user.prizeRates);
            }, 0);

            // Net Profit for the user = (Winnings + Commissions Earned) - Stake Invested
            const netProfit = (totalPrize + totalCommission) - totalStake;

            return {
                id: game.id,
                name: game.name,
                logo: game.logo,
                totalStake,
                totalCommission,
                totalPrize,
                netProfit,
                winningNumber: game.winningNumber,
                isMarketOpen: game.isMarketOpen
            };
        }).filter(d => d.totalStake > 0).sort((a, b) => b.totalStake - a.totalStake);
    }, [games, bets, user]);

    const totals = useMemo(() => {
        return data.reduce((acc, item) => ({
            stake: acc.stake + item.totalStake,
            commission: acc.commission + item.totalCommission,
            prize: acc.prize + item.totalPrize,
            profit: acc.profit + item.netProfit
        }), { stake: 0, commission: 0, prize: 0, profit: 0 });
    }, [data]);

    if (data.length === 0) return null;

    return (
        <div className="mb-12 animate-fade-in">
            <h3 className="text-2xl font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                Game-by-Game Breakdown
                <span className="text-[10px] bg-sky-500/20 text-sky-400 px-3 py-1 rounded border border-sky-500/30 font-black tracking-tighter uppercase">Today's Performance</span>
            </h3>

            {/* Mobile View - Card based for better UX */}
            <div className="sm:hidden space-y-4">
                {data.map(item => (
                    <div key={item.id} className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700 shadow-xl backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <img src={item.logo} className="w-12 h-12 rounded-full border-2 border-slate-700" alt="" />
                            <div>
                                <div className="text-white font-black text-base uppercase tracking-tight">{item.name}</div>
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Result: {item.winningNumber || '---'}</div>
                            </div>
                            <div className="ml-auto text-right">
                                <div className="text-[9px] text-slate-500 uppercase font-black">Net Profit</div>
                                <div className={`font-mono font-bold ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {item.netProfit >= 0 ? '+' : ''}{item.netProfit.toFixed(2)}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-700/50">
                            <div className="text-center">
                                <div className="text-[8px] text-slate-500 uppercase font-black">Stake</div>
                                <div className="text-xs font-mono text-white">Rs {item.totalStake.toLocaleString()}</div>
                            </div>
                            <div className="text-center border-x border-slate-700/50">
                                <div className="text-[8px] text-emerald-500 uppercase font-black">Winning</div>
                                <div className="text-xs font-mono text-emerald-400">Rs {item.totalPrize.toLocaleString()}</div>
                            </div>
                            <div className="text-center">
                                <div className="text-[8px] text-sky-500 uppercase font-black">Comm.</div>
                                <div className="text-xs font-mono text-sky-400">Rs {item.totalCommission.toFixed(2)}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Desktop View - High density table as requested */}
            <div className="hidden sm:block bg-slate-800/40 rounded-xl overflow-hidden border border-slate-700 shadow-xl backdrop-blur-md">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/80 border-b border-slate-700">
                            <tr>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Game</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Stake</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Winning</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Commissions</th>
                                <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Net Profit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {data.map(item => (
                                <tr key={item.id} className="hover:bg-slate-700/20 transition-all">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <img src={item.logo} className="w-8 h-8 rounded-full border border-slate-700" alt="" />
                                            <div>
                                                <div className="text-white font-bold text-sm uppercase tracking-tight">{item.name}</div>
                                                {item.winningNumber && !item.winningNumber.endsWith('_') && (
                                                    <div className="text-[10px] text-emerald-500 font-mono">Result: {item.winningNumber}</div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="font-mono text-white font-bold">Rs {item.totalStake.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={`font-mono font-bold ${item.totalPrize > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            Rs {item.totalPrize.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="font-mono text-sky-400">Rs {item.totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className={`font-mono font-black ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            Rs {item.netProfit >= 0 ? '+' : ''}{item.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-900/60 border-t-2 border-slate-700">
                            <tr>
                                <td className="p-4 text-xs font-black text-slate-400 uppercase tracking-widest">Grand Total</td>
                                <td className="p-4 text-right">
                                    <div className="font-mono text-lg font-black text-white">Rs {totals.stake.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="font-mono text-lg font-black text-emerald-400">Rs {totals.prize.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="font-mono text-lg font-black text-sky-400">Rs {totals.commission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className={`font-mono text-xl font-black ${totals.profit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]' : 'text-red-400'}`}>
                                        Rs {totals.profit >= 0 ? '+' : ''}{totals.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

const LedgerView: React.FC<{ entries: LedgerEntry[] }> = ({ entries }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());

    const filteredEntries = useMemo(() => {
        if (!startDate && !endDate) return entries;
        return entries.filter(entry => {
            const entryDateStr = entry.timestamp.toISOString().split('T')[0];
            if (startDate && entryDateStr < startDate) return false;
            if (endDate && entryDateStr > endDate) return false;
            return true;
        });
    }, [entries, startDate, endDate]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
    };

    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Ledger</h3>

            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors active:translate-y-0.5">Show All History</button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                    <table className="w-full text-left min-w-[600px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Debit</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Credit</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {[...filteredEntries].reverse().map(entry => (
                                <tr key={entry.id} className="hover:bg-sky-500/10 transition-colors">
                                    <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{entry.timestamp.toLocaleString()}</td>
                                    <td className="p-4 text-white">{entry.description}</td>
                                    <td className="p-4 text-right text-red-400 font-mono">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right text-green-400 font-mono">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-semibold text-white font-mono">{entry.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500">
                                        No ledger entries found for the selected date range.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const BetHistoryView: React.FC<{ bets: Bet[], games: Game[], user: User }> = ({ bets, games, user }) => {
    const [startDate, setStartDate] = useState(getTodayDateString());
    const [endDate, setEndDate] = useState(getTodayDateString());
    const [searchTerm, setSearchTerm] = useState('');

    const getBetOutcome = (bet: Bet) => {
        const game = games.find(g => g.id === bet.gameId);
        if (!game || !user || !game.winningNumber || game.winningNumber.includes('_')) return { status: 'Pending', payout: 0, color: 'text-amber-400' };

        const payout = calculateBetPayout(bet, game, user.prizeRates);
        if (payout > 0) {
            return { status: 'Win', payout, color: 'text-green-400' };
        }
        return { status: 'Lost', payout: 0, color: 'text-red-400' };
    };

    const filteredBets = useMemo(() => {
        return bets.filter(bet => {
            const betDateStr = bet.timestamp.toISOString().split('T')[0];
            if (startDate && betDateStr < startDate) return false;
            if (endDate && betDateStr > endDate) return false;

            if (searchTerm.trim()) {
                const game = games.find(g => g.id === bet.gameId);
                const lowerSearchTerm = searchTerm.trim().toLowerCase();
                const gameNameMatch = game?.name.toLowerCase().includes(lowerSearchTerm);
                const subGameTypeMatch = bet.subGameType.toLowerCase().includes(lowerSearchTerm);
                if (!gameNameMatch && !subGameTypeMatch) return false;
            }
            return true;
        });
    }, [bets, games, startDate, endDate, searchTerm]);

    const handleClearFilters = () => {
        setStartDate('');
        setEndDate('');
        setSearchTerm('');
    };
    
    const inputClass = "w-full bg-slate-800 p-2 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white";

    return (
        <div className="mt-12">
            <h3 className="text-2xl font-bold mb-4 text-sky-400 uppercase tracking-widest">My Bet History</h3>
            
            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-400 mb-1">From Date</label>
                        <input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-400 mb-1">To Date</label>
                        <input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} font-sans`} />
                    </div>
                    <div className="md:col-span-2 lg:col-span-1">
                        <label htmlFor="search-term" className="block text-sm font-medium text-slate-400 mb-1">Game / Type</label>
                        <input id="search-term" type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="e.g., AK, 1 digit, LS3" className={inputClass} />
                    </div>
                    <div className="flex items-center">
                        <button onClick={handleClearFilters} className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md transition-colors active:translate-y-0.5">Clear Filters</button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700">
                <div className="overflow-x-auto max-h-[30rem] mobile-scroll-x">
                    <table className="w-full text-left min-w-[700px]">
                        <thead className="bg-slate-800/50 sticky top-0 backdrop-blur-sm">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bet Details</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Stake (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Payout (PKR)</th>
                                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {[...filteredBets].reverse().map(bet => {
                                const game = games.find(g => g.id === bet.gameId);
                                const outcome = getBetOutcome(bet);
                                return (
                                <tr key={bet.id} className="hover:bg-sky-500/10 transition-colors">
                                    <td className="p-4 text-sm text-slate-400 whitespace-nowrap">{bet.timestamp.toLocaleString()}</td>
                                    <td className="p-4 text-white font-medium">{game?.name || 'Unknown'}</td>
                                    <td className="p-4 text-slate-300">
                                        <div className="font-semibold">{bet.subGameType}</div>
                                        <div className="text-xs text-slate-400 break-words" title={bet.numbers.join(', ')}>{bet.numbers.join(', ')}</div>
                                    </td>
                                    <td className="p-4 text-right text-red-400 font-mono">{bet.totalAmount.toFixed(2)}</td>
                                    <td className="p-4 text-right text-green-400 font-mono">{outcome.payout > 0 ? outcome.payout.toFixed(2) : '-'}</td>
                                    <td className="p-4 text-right font-semibold"><span className={outcome.color}>{outcome.status}</span></td>
                                </tr>);
                           })}
                           {filteredBets.length === 0 && (
                               <tr>
                                   <td colSpan={6} className="p-8 text-center text-slate-500">
                                       {bets.length === 0 ? "No bets placed yet." : "No bets found matching your filters."}
                                   </td>
                               </tr>
                           )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const formatTime12h = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
};

const GameCard: React.FC<{ game: Game; onPlay: (game: Game) => void; isRestricted: boolean; }> = ({ game, onPlay, isRestricted }) => {
    const { status, text: countdownText } = useCountdown(game.drawTime);
    const hasFinalWinner = !!game.winningNumber && !game.winningNumber.endsWith('_');
    
    // CRITICAL FIX: LS3 and other games should rely on isMarketOpen from backend 
    // to prevent device clock skew from disabling the button early.
    const isPlayable = !!game.isMarketOpen && !isRestricted;
    const isMarketClosedForDisplay = !game.isMarketOpen;

    return (
        <div className={`bg-slate-800/50 rounded-lg shadow-lg p-4 flex flex-col justify-between transition-all duration-300 border border-slate-700 ${!isPlayable ? 'opacity-80' : 'hover:shadow-cyan-500/20 hover:-translate-y-1 hover:border-cyan-500/50 shadow-md'}`}>
            <div>
                <div className="flex items-center mb-3">
                    <img src={game.logo} alt={game.name} className="w-12 h-12 rounded-full mr-4 border-2 border-slate-600" />
                    <div>
                        <h3 className="text-xl text-white uppercase tracking-wider">{game.name}</h3>
                        <p className="text-sm text-slate-400">Draw at {formatTime12h(game.drawTime)}</p>
                    </div>
                </div>
                <div className={`text-center my-4 p-2 rounded-lg bg-slate-900/50 border-t border-slate-700 min-h-[70px] flex flex-col justify-center`}>
                    {hasFinalWinner ? (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">DRAW RESULT</div>
                            <div className="text-3xl font-mono font-black text-white">{game.winningNumber}</div>
                        </>
                    ) : isMarketClosedForDisplay ? (
                        <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">STATUS</div>
                            <div className="text-2xl font-mono font-bold text-red-400">MARKET CLOSED</div>
                        </>
                    ) : status === 'OPEN' ? (
                        <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">TIME LEFT</div>
                            <div className="text-3xl font-mono font-bold text-cyan-300">{countdownText}</div>
                        </>
                    ) : (
                         <>
                            <div className="text-xs uppercase tracking-wider text-slate-400">MARKET OPENS</div>
                            <div className="text-xl font-mono font-bold text-slate-400">{countdownText}</div>
                        </>
                    )}
                </div>
            </div>
            <button onClick={() => onPlay(game)} disabled={!isPlayable} className="w-full mt-2 bg-sky-600 text-white font-bold py-2.5 px-4 rounded-md transition-all duration-300 enabled:hover:bg-sky-500 enabled:hover:shadow-lg enabled:hover:shadow-sky-500/30 disabled:bg-slate-700 disabled:cursor-not-allowed active:scale-95 shadow-lg">
                PLAY NOW
            </button>
        </div>
    );
};

interface BettingModalProps {
    game: Game | null;
    games: Game[];
    user: User;
    onClose: () => void;
    onPlaceBet: (details: any) => Promise<void>;
}

const BettingModal: React.FC<BettingModalProps> = ({ game, games, user, onClose, onPlaceBet }) => {
    const { fetchWithAuth } = useAuth();
    const [subGameType, setSubGameType] = useState<SubGameType>(SubGameType.TwoDigit);
    const [manualNumbersInput, setManualNumbersInput] = useState('');
    const [manualAmountInput, setManualAmountInput] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const [comboDigitsInput, setComboDigitsInput] = useState('');
    const [generatedCombos, setGeneratedCombos] = useState<any[]>([]);
    const [comboGlobalStake, setComboGlobalStake] = useState('');

    const { text: countdownText } = useCountdown(game?.drawTime || '00:00');

    const availableSubGameTabs = useMemo(() => {
        if (!game) return [];
        const allSubGameTypes = [SubGameType.TwoDigit, SubGameType.OneDigitOpen, SubGameType.OneDigitClose, SubGameType.Bulk, SubGameType.Combo];
        if (game.name === 'AKC') return [SubGameType.OneDigitClose];
        if (game.name === 'AK') return allSubGameTypes.filter(type => type !== SubGameType.OneDigitClose);
        return allSubGameTypes;
    }, [game]);

    useEffect(() => {
        setManualNumbersInput('');
        setManualAmountInput('');
        setBulkInput('');
        setComboDigitsInput('');
        setGeneratedCombos([]);
        setComboGlobalStake('');
        setError(null);
        setIsConfirming(false);
    }, [subGameType]);

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const rawValue = e.target.value;
        const digitsOnly = rawValue.replace(/\D/g, '');
        if (digitsOnly === '') { setManualNumbersInput(''); return; }
        let formattedValue = '';
        switch (subGameType) {
            case SubGameType.OneDigitOpen:
            case SubGameType.OneDigitClose:
                formattedValue = digitsOnly.split('').join(', ');
                break;
            case SubGameType.TwoDigit:
                formattedValue = (digitsOnly.match(/.{1,2}/g) || []).join(', ');
                break;
            default:
                formattedValue = digitsOnly;
                break;
        }
        setManualNumbersInput(formattedValue);
    };
    
    useEffect(() => { 
        if (availableSubGameTabs.length > 0 && !availableSubGameTabs.includes(subGameType)) {
            setSubGameType(availableSubGameTabs[0]); 
        }
    }, [availableSubGameTabs, subGameType]);

    const handleAiLuckyPick = async () => {
        if (isAiLoading) return;
        setIsAiLoading(true);
        setError(null);
        try {
            const response = await fetchWithAuth('/api/user/ai-lucky-pick', {
                method: 'POST',
                body: JSON.stringify({ gameType: subGameType, count: 5 })
            });
            const data = await response.json();
            const numbers = data.luckyNumbers.replace(/,/g, '');
            let formatted = '';
            if (subGameType === SubGameType.TwoDigit) {
                formatted = (numbers.match(/.{1,2}/g) || []).join(', ');
            } else {
                formatted = numbers.split('').join(', ');
            }
            setManualNumbersInput(formatted);
        } catch (err: any) {
            setError(err.message || "Failed to get AI lucky numbers.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const parsedBulkBet = useMemo(() => {
        const result: any = { betsByGame: new Map(), grandTotalCost: 0, grandTotalNumbers: 0, errors: [] };
        if (!game || !bulkInput.trim()) return result;
        const gameNameMap = new Map<string, string>();
        games.forEach(g => gameNameMap.set(g.name.toLowerCase().replace(/\s+/g, ''), g.id));
        const gameNameRegex = new RegExp(`\\b(${Array.from(gameNameMap.keys()).join('|')})\\b`, 'i');
        const delimiterRegex = /[-.,_*\/+<>=%;'\s]+/; 
        let currentGameId: string | null = game.id;
        for (const line of bulkInput.trim().split('\n')) {
            let currentLine = line.trim();
            if (!currentLine) continue;
            const gameMatch = currentLine.toLowerCase().replace(/\s+/g, '').match(gameNameRegex);
            if (gameMatch) {
                const matchedGameKey = gameMatch[0];
                currentGameId = gameNameMap.get(matchedGameKey) || null;
                const originalGameNameRegex = new RegExp(`\\b(${games.find(g => g.id === currentGameId)?.name})\\b`, 'i');
                currentLine = currentLine.replace(originalGameNameRegex, '').trim();
            }
            if (!currentGameId) { result.errors.push(`Line "${line}" missing valid game.`); continue; }
            const gameNameOnLine = games.find(g => g.id === currentGameId)?.name || 'Unknown Game';
            
            // Loose Stake Detection: Support "43 rs100" and "43 100"
            const stakeMatch = currentLine.match(/(?:rs|r)?\s*(\d+\.?\d*)$/i);
            const stake = stakeMatch ? parseFloat(stakeMatch[1]) : 0;
            if (stake <= 0) { result.errors.push(`Line "${line}" missing stake.`); continue; }
            
            let betPart = stakeMatch ? currentLine.substring(0, stakeMatch.index).trim() : currentLine;
            const isCombo = /\b(k|combo)\b/i.test(betPart);
            betPart = betPart.replace(/\b(k|combo)\b/i, '').trim();
            const tokens = betPart.split(delimiterRegex).filter(Boolean);
            let betItems: any[] = [];
            const isAkcGame = gameNameOnLine === 'AKC';
            const determineType = (token: string): SubGameType | null => {
                if (isAkcGame) return /^[xX]?\d$/.test(token) ? SubGameType.OneDigitClose : null;
                if (/^\d{1,2}$/.test(token)) return SubGameType.TwoDigit;
                if (/^\d[xX]$/i.test(token)) return SubGameType.OneDigitOpen;
                if (/^[xX]\d$/i.test(token)) return SubGameType.OneDigitClose;
                return null;
            };
            if (isCombo) {
                const digits = betPart.replace(/\D/g, '');
                const uniqueDigits = [...new Set(digits.split(''))];
                if (uniqueDigits.length < 3 || uniqueDigits.length > 6) { result.errors.push(`Line "${line}": Combo 3-6 digits required.`); continue; }
                for (let i = 0; i < uniqueDigits.length; i++) {
                    for (let j = 0; j < uniqueDigits.length; j++) {
                        if (i !== j) betItems.push({ number: uniqueDigits[i] + uniqueDigits[j], subGameType: SubGameType.Combo });
                    }
                }
            } else {
                for (const token of tokens) {
                    const tokenType = determineType(token);
                    if (!tokenType) { result.errors.push(`Invalid token '${token}' in "${line}".`); continue; }
                    let numberValue = tokenType === SubGameType.TwoDigit ? token.padStart(2, '0') : (tokenType === SubGameType.OneDigitOpen ? token[0] : (token.length === 2 ? token[1] : token[0]));
                    betItems.push({ number: numberValue, subGameType: tokenType });
                }
            }
            if (betItems.length === 0) continue;
            if (!result.betsByGame.has(currentGameId)) result.betsByGame.set(currentGameId, { gameName: gameNameOnLine, totalCost: 0, totalNumbers: 0, betGroups: new Map() });
            const gameData = result.betsByGame.get(currentGameId)!;
            for (const item of betItems) {
                const groupKey = `${item.subGameType}__${stake}`;
                if (!gameData.betGroups.has(groupKey)) gameData.betGroups.set(groupKey, { subGameType: item.subGameType, numbers: [], amountPerNumber: stake });
                const group = gameData.betGroups.get(groupKey)!;
                group.numbers.push(item.number);
                gameData.totalNumbers++; gameData.totalCost += stake;
            }
        }
        result.grandTotalCost = Array.from(result.betsByGame.values()).reduce((sum: number, g: any) => sum + g.totalCost, 0);
        result.grandTotalNumbers = Array.from(result.betsByGame.values()).reduce((sum: number, g: any) => sum + g.totalNumbers, 0);
        return result;
    }, [bulkInput, games, game]);

    const handleGenerateCombos = () => {
        setError(null);
        const digits = comboDigitsInput.replace(/\D/g, '');
        const uniqueDigits = [...new Set(digits.split(''))];
        if (uniqueDigits.length < 3 || uniqueDigits.length > 6) { setError("Enter 3-6 unique digits."); setGeneratedCombos([]); return; }
        const perms: string[] = [];
        for (let i = 0; i < uniqueDigits.length; i++) {
            for (let j = 0; j < uniqueDigits.length; j++) { if (i !== j) perms.push(uniqueDigits[i] + uniqueDigits[j]); }
        }
        setGeneratedCombos(perms.map(p => ({ number: p, stake: '', selected: true })));
    };

    const handleComboSelectionChange = (index: number, selected: boolean) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, selected } : c));
    };

    const handleComboStakeChange = (index: number, stake: string) => {
        setGeneratedCombos(prev => prev.map((c, i) => i === index ? { ...c, stake } : c));
    };
    
    const handleApplyGlobalStake = () => {
        if (parseFloat(comboGlobalStake) > 0) setGeneratedCombos(prev => prev.map(c => ({...c, stake: comboGlobalStake})));
    };

    const parsedManualBet = useMemo(() => {
        const result = { numbers: [] as string[], totalCost: 0, error: null as string | null, numberCount: 0, stake: 0 };
        const amount = parseFloat(manualAmountInput);
        if (!isNaN(amount) && amount > 0) { result.stake = amount; }
        const digitsOnly = manualNumbersInput.replace(/\D/g, '');
        let numbers: string[] = [];
        if (digitsOnly.length > 0) {
            switch (subGameType) {
                case SubGameType.OneDigitOpen: case SubGameType.OneDigitClose: numbers = digitsOnly.split(''); break;
                case SubGameType.TwoDigit:
                    if (digitsOnly.length % 2 !== 0) { result.error = "Digit count must be even."; } else { numbers = digitsOnly.match(/.{2}/g) || []; }
                    break;
            }
        }
        result.numbers = [...new Set(numbers)]; 
        result.numberCount = result.numbers.length;
        if (result.stake > 0) { result.totalCost = result.numberCount * result.stake; }
        return result;
    }, [manualNumbersInput, manualAmountInput, subGameType]);

    const handleBet = async () => {
        if (!game) return;
        setError(null); setIsSubmitting(true);
        try {
            if (subGameType === SubGameType.Combo) {
                const validBets = generatedCombos.filter(c => c.selected && parseFloat(c.stake) > 0);
                if (validBets.length === 0) throw new Error("Select combinations and enter stakes.");
                const totalCost = validBets.reduce((sum, c) => sum + parseFloat(c.stake), 0);
                if (totalCost > user.wallet) throw new Error(`Insufficient balance.`);
                const groups = new Map<number, string[]>();
                validBets.forEach(bet => {
                    const stake = parseFloat(bet.stake);
                    if (!groups.has(stake)) groups.set(stake, []);
                    groups.get(stake)!.push(bet.number);
                });
                const betGroups = Array.from(groups.entries()).map(([amount, numbers]) => ({ subGameType: SubGameType.Combo, numbers, amountPerNumber: amount }));
                await onPlaceBet({ gameId: game.id, betGroups });
            } else if (subGameType === SubGameType.Bulk) {
                const { betsByGame, errors } = parsedBulkBet;
                if (errors.length > 0) throw new Error(errors[0]);
                if (betsByGame.size === 0) throw new Error("No valid bets entered.");
                
                // CRITICAL FIX: Convert Map to plain object for JSON serialization
                const multiGameBetsObj: any = {};
                betsByGame.forEach((gameData: any, gameId: string) => { 
                    multiGameBetsObj[gameId] = { 
                        gameName: gameData.gameName, 
                        betGroups: Array.from(gameData.betGroups.values()) 
                    }; 
                });
                
                await onPlaceBet({ isMultiGame: true, multiGameBets: multiGameBetsObj });
            } else {
                const { numbers, totalCost, error: parseError, stake } = parsedManualBet;
                if (stake <= 0) throw new Error("Enter valid amount.");
                if (parseError) throw new Error(parseError);
                if (numbers.length === 0) throw new Error("Enter at least one number.");
                if (totalCost > user.wallet) throw new Error(`Insufficient balance.`);
                await onPlaceBet({ gameId: game.id, betGroups: [{ subGameType, numbers, amountPerNumber: stake }] });
            }
        } catch (err: any) { setError(err.message); setIsConfirming(false); } finally { setIsSubmitting(false); }
    };

    if (!game) return null;

    const totalSelectedNumbers = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalNumbers : (subGameType === SubGameType.Combo ? generatedCombos.filter(c => c.selected).length : parsedManualBet.numberCount);
    const finalBetTotalCost = subGameType === SubGameType.Bulk ? parsedBulkBet.grandTotalCost : (subGameType === SubGameType.Combo ? generatedCombos.reduce((s, c) => c.selected ? s + (parseFloat(c.stake) || 0) : s, 0) : parsedManualBet.totalCost);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-slate-900/90 rounded-lg shadow-2xl w-full max-w-lg border border-sky-500/30 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center p-5 border-b border-slate-700 flex-shrink-0">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider">{isConfirming ? "Confirm Your Bet" : `Play: ${game.name}`}</h3>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded text-[9px] font-bold text-amber-400 uppercase tracking-widest shadow-sm">
                                <span className="w-2.5 h-2.5 text-amber-400">{Icons.clock}</span> DRAW @ {formatTime12h(game.drawTime)}
                            </div>
                            <div className="flex items-center gap-1.5 bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded text-[9px] font-bold text-cyan-400 uppercase tracking-widest shadow-sm animate-pulse">
                                TIME LEFT: <span className="font-mono">{countdownText}</span>
                            </div>
                        </div>
                    </div>
                    {!isConfirming && <button onClick={onClose} className="text-slate-400 hover:text-white self-start mt-1 p-2 rounded-full hover:bg-slate-800 transition-colors">{Icons.close}</button>}
                </div>
                <div className="p-6 overflow-y-auto">
                    {isConfirming ? (
                        <div className="animate-fade-in text-center">
                            <div className="mb-6">
                                <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/20 rounded-full border-2 border-emerald-500 mb-4 animate-bounce">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h4 className="text-lg font-bold text-white uppercase tracking-widest mb-1">Bet Summary</h4>
                                <p className="text-slate-400 text-xs tracking-tight">Review your ticket before final submission.</p>
                            </div>
                            <div className="bg-slate-800 rounded-xl border border-slate-700 divide-y divide-slate-700 overflow-hidden mb-6 shadow-inner">
                                <div className="p-4 flex justify-between items-center"><span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Category</span><span className="text-sky-400 font-black">{subGameType}</span></div>
                                <div className="p-4 text-left"><span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">Number(s)</span><div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-2 no-scrollbar">{(subGameType === SubGameType.Bulk ? [] : subGameType === SubGameType.Combo ? generatedCombos.filter(c => c.selected).map(c => c.number) : parsedManualBet.numbers).map((num, i) => (<span key={i} className="px-2 py-1 bg-slate-900 border border-slate-700 rounded font-mono text-cyan-300 text-sm">{num}</span>))}{subGameType === SubGameType.Bulk && <span className="text-white italic text-xs">Bulk Entries Loaded.</span>}</div></div>
                                <div className="p-4 grid grid-cols-2 bg-slate-900/50"><div className="text-left"><span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Count</span><span className="text-xl font-black text-white">{totalSelectedNumbers}</span></div><div className="text-right"><span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest block">Total Payable</span><span className="text-2xl font-black text-emerald-400 font-mono">Rs {finalBetTotalCost.toLocaleString()}</span></div></div>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setIsConfirming(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg border border-slate-700 transition-all uppercase tracking-widest text-xs active:translate-y-0.5">Back</button>
                                <button onClick={handleBet} disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-lg shadow-lg transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 active:translate-y-0.5">{isSubmitting ? (<div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>) : "CONFIRM & PAY"}</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="bg-slate-800/50 p-1.5 rounded-lg flex items-center space-x-2 mb-4 self-start flex-wrap border border-slate-700">
                                {availableSubGameTabs.map(tab => (<button key={tab} onClick={() => setSubGameType(tab)} className={`flex-auto py-2 px-3 text-sm font-semibold rounded-md transition-all duration-300 active:scale-95 ${subGameType === tab ? 'bg-slate-700 text-sky-400 shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>{tab}</button>))}
                            </div>
                            {subGameType === SubGameType.Bulk ? (
                                <><div className="mb-2"><label className="block text-slate-400 mb-1 text-sm font-medium">Super Bulk Entry</label><textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)} rows={6} placeholder={"Format:\n43,9x,x2 20\nLS2 01,58 50"} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono" /></div>{parsedBulkBet.betsByGame.size > 0 && (<div className="mb-4 bg-slate-800 p-3 rounded-md border border-slate-700 max-h-40 overflow-y-auto space-y-2">{Array.from(parsedBulkBet.betsByGame.entries()).map(([gameId, gameData]: any) => (<div key={gameId} className="p-2 rounded-md bg-green-500/10 border-l-4 border-green-500"><div className="flex justify-between items-center font-mono text-sm"><span className="font-bold text-white">{gameData.gameName}</span><div className="flex items-center gap-4 text-xs"><span className="text-slate-300">Bets: <span className="font-bold text-white">{gameData.totalNumbers}</span></span><span className="text-slate-300">Cost: <span className="font-bold text-white">{gameData.totalCost.toFixed(2)}</span></span></div></div></div>))}</div>)}<div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-2 gap-2 text-center border border-slate-700"><div><p className="text-slate-400 text-xs uppercase">Total Bets</p><p className="font-bold text-white text-lg">{parsedBulkBet.grandTotalNumbers}</p></div><div><p className="text-slate-400 text-xs uppercase">Total Cost</p><p className="font-bold text-red-400 text-lg font-mono">{parsedBulkBet.grandTotalCost.toFixed(2)}</p></div></div></>
                            ) : subGameType === SubGameType.Combo ? (
                                <><div className="mb-4"><label className="block text-slate-400 mb-1 text-sm font-medium">Combo Digits (3-6)</label><div className="flex gap-2"><input type="text" value={comboDigitsInput} onChange={e => setComboDigitsInput(e.target.value)} placeholder="e.g. 123" className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono" maxLength={6}/><button onClick={handleGenerateCombos} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-md whitespace-nowrap active:translate-y-0.5">Generate</button></div></div>{generatedCombos.length > 0 && (<><div className="mb-4"><label className="block text-slate-400 mb-1 text-sm font-medium">Apply Stake to All</label><div className="flex gap-2"><input type="number" value={comboGlobalStake} onChange={e => setComboGlobalStake(e.target.value)} placeholder="e.g. 10" className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono" /><button onClick={handleApplyGlobalStake} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-md active:translate-y-0.5">Apply</button></div></div><div className="bg-slate-800 p-3 rounded-md border border-slate-700 max-h-48 overflow-y-auto space-y-2">{generatedCombos.map((combo, index) => (
                                    <div key={index} className="flex items-center p-2 rounded-md hover:bg-slate-700/50">
                                        <input type="checkbox" checked={combo.selected} onChange={(e) => handleComboSelectionChange(index, e.target.checked)} className="mr-3 h-4 w-4 rounded bg-slate-900 border-slate-600 text-sky-600 focus:ring-sky-500" />
                                        <label className="w-1/3 font-mono text-lg text-white">{combo.number}</label>
                                        <div className="w-2/3">
                                            <input type="number" value={combo.stake} onChange={e => handleComboStakeChange(index, e.target.value)} placeholder="0" className="w-full bg-slate-900 p-1.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono text-right" />
                                        </div>
                                    </div>
                                ))}</div></>)}</>
                            ) : (
                                <><div className="mb-4"><div className="flex justify-between items-end mb-1"><label className="block text-slate-400 text-sm font-medium">Enter Number(s)</label><button onClick={handleAiLuckyPick} disabled={isAiLoading} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-all mb-1 active:scale-95">{isAiLoading ? <div className="w-3 h-3 border-2 border-cyan-400/20 border-t-cyan-400 rounded-full animate-spin"></div> : Icons.sparkles} AI Pick</button></div><textarea value={manualNumbersInput} onChange={handleManualNumberChange} rows={3} placeholder={subGameType === SubGameType.TwoDigit ? "e.g. 14, 05" : "e.g. 1, 2, 9"} className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono" /></div><div className="mb-4"><label className="block text-slate-400 mb-1 text-sm font-medium">Amount per Number</label><input type="number" value={manualAmountInput} onChange={e => setManualAmountInput(e.target.value)} placeholder="e.g. 10" className="w-full bg-slate-800 p-2.5 rounded-md border border-slate-600 focus:ring-2 focus:ring-sky-500 focus:outline-none text-white font-mono" /></div><div className="text-sm bg-slate-800/50 p-3 rounded-md mb-4 grid grid-cols-3 gap-2 text-center border border-slate-700"><div><p className="text-slate-400 text-xs uppercase">Count</p><p className="font-bold text-white text-lg">{parsedManualBet.numberCount}</p></div><div><p className="text-slate-400 text-xs uppercase">Stake</p><p className="font-bold text-white text-lg font-mono">{parsedManualBet.stake}</p></div><div><p className="text-slate-400 text-xs uppercase">Total</p><p className="font-bold text-red-400 text-lg font-mono">{parsedManualBet.totalCost}</p></div></div></>
                            )}
                            {error && <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-xs p-3 rounded-md mb-4">{error}</div>}
                            <div className="flex justify-end pt-2"><button onClick={() => { if (finalBetTotalCost > 0 && !error) setIsConfirming(true); }} disabled={finalBetTotalCost <= 0 || !!error} className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2.5 px-6 rounded-md transition-colors disabled:opacity-50 active:translate-y-0.5 shadow-lg">PLACE BET</button></div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

interface UserPanelProps {
  user: User;
  games: Game[];
  bets: Bet[];
  placeBet: (details: any) => Promise<void>;
}

const UserPanel: React.FC<UserPanelProps> = ({ user, games, bets, placeBet }) => {
    const [selectedGame, setSelectedGame] = useState<Game | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const handlePlaceBet = async (details: any) => {
        try {
            await placeBet(details);
            setToast({ msg: "✅ Bet placed successfully!", type: 'success' });
            setSelectedGame(null);
        } catch (err: any) {
            setToast({ msg: err.message || "Failed to place bet.", type: 'error' });
            throw err; 
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white uppercase tracking-widest">User Dashboard</h2>
                    <p className="text-slate-400">Welcome back, <span className="text-sky-400 font-bold">{user.name}</span></p>
                </div>
                <div className="bg-slate-800/50 px-6 py-3 rounded-xl border border-slate-700 shadow-lg flex flex-col items-end">
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Available Wallet</p>
                    <p className="text-2xl font-black text-cyan-400 font-mono">PKR {user.wallet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <GameStakeBreakdown games={games} bets={bets} user={user} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {games.map(game => (
                    <GameCard 
                        key={game.id} 
                        game={game} 
                        onPlay={setSelectedGame} 
                        isRestricted={user.isRestricted} 
                    />
                ))}
            </div>

            {selectedGame && (
                <BettingModal 
                    game={selectedGame} 
                    games={games}
                    user={user} 
                    onClose={() => setSelectedGame(null)} 
                    onPlaceBet={handlePlaceBet}
                />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
                <BetHistoryView bets={bets} games={games} user={user} />
                <LedgerView entries={user.ledger} />
            </div>
        </div>
    );
};

export default UserPanel;