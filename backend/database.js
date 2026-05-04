const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'database.sqlite');
let db;

// --- ROBUST LOGGING HELPER ---
function logError(context, err) {
    const msg = (err && err.message) ? err.message : JSON.stringify(err);
    console.error('--- [' + context + '] ERROR: ' + msg + ' ---');
}

// --- CENTRALIZED GAME TIMING LOGIC (PKT TIMEZONE) ---
function isGameOpen(drawTime) {
    try {
        if (!drawTime || typeof drawTime !== 'string') return false;
        const now = new Date();
        const pktBias = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const timeParts = drawTime.split(':');
        if (timeParts.length !== 2) return false;

        const drawH = parseInt(timeParts[0], 10);
        const drawM = parseInt(timeParts[1], 10);
        const pktH = pktBias.getUTCHours();

        const currentCycleStart = new Date(pktBias);
        currentCycleStart.setUTCHours(16, 0, 0, 0);
        if (pktH < 16) {
            currentCycleStart.setUTCDate(currentCycleStart.getUTCDate() - 1);
        }

        const currentCycleEnd = new Date(currentCycleStart);
        currentCycleEnd.setUTCHours(drawH, drawM, 0, 0);
        if (drawH < 16) {
            currentCycleEnd.setUTCDate(currentCycleEnd.getUTCDate() + 1);
        }

        return pktBias >= currentCycleStart && pktBias < currentCycleEnd;
    } catch (e) {
        return false;
    }
}

const connect = () => {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        console.error('--- [DATABASE] Connection established. ---');
    } catch (error) {
        logError('DB_CONNECT', error);
        process.exit(1);
    }
};

const verifySchema = () => {
    try {
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admins'");
        if (!stmt.get()) {
            console.error('--- [DATABASE] Critical: Schema missing. ---');
            process.exit(1);
        }
    } catch (error) {
        logError('SCHEMA_VERIFY', error);
        process.exit(1);
    }
};

const findAccountById = (id, table) => {
    if (!id) return null;
    try {
        const stmt = db.prepare('SELECT * FROM ' + table + ' WHERE LOWER(id) = LOWER(?)');
        const account = stmt.get(id);
        if (!account) return null;
        
        if (table !== 'games') {
            account.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(id);
        } else {
            account.isMarketOpen = isGameOpen(account.drawTime);
        }

        if (table === 'users' || table === 'dealers' || table === 'admins') {
            account.commissionRate = Number(account.commissionRate) || 0;
            if (account.prizeRates && typeof account.prizeRates === 'string') {
                account.prizeRates = JSON.parse(account.prizeRates);
            }
            if (account.betLimits && typeof account.betLimits === 'string') {
                account.betLimits = JSON.parse(account.betLimits);
            }
        }
        
        if ('isRestricted' in account) account.isRestricted = !!account.isRestricted;
        return account;
    } catch (e) {
        logError('FIND_ACCOUNT', e);
        return null;
    }
};

const findAccountForLogin = (loginId) => {
    if (!loginId || typeof loginId !== 'string' || loginId.trim().length === 0) {
        return { account: null, role: null };
    }
    
    const targetId = loginId.trim().toLowerCase();
    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' }
    ];

    for (var i = 0; i < tables.length; i++) {
        var info = tables[i];
        try {
            const stmt = db.prepare('SELECT * FROM ' + info.name + ' WHERE LOWER(id) = ?');
            const account = stmt.get(targetId);
            if (account) return { account: account, role: info.role };
        } catch (e) {
            logError('LOGIN_LOOKUP_' + info.role, e);
        }
    }
    return { account: null, role: null };
};

const updatePassword = (accountId, contact, newPassword) => {
    if (!accountId || !contact) return false;
    const tables = ['users', 'dealers'];
    for (var i = 0; i < tables.length; i++) {
        try {
            const result = db.prepare('UPDATE ' + tables[i] + ' SET password = ? WHERE id = ? AND contact = ?').run(newPassword, accountId, contact);
            if (result.changes > 0) return true;
        } catch (e) {}
    }
    return false;
};

const getAllFromTable = (table, withLedger = false) => {
    try {
        const rows = db.prepare('SELECT * FROM ' + table).all();
        return rows.map(acc => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (withLedger && acc.id) {
                        acc.ledger = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp ASC').all(acc.id);
                    }
                    if (acc.prizeRates && typeof acc.prizeRates === 'string') acc.prizeRates = JSON.parse(acc.prizeRates);
                    if (acc.betLimits && typeof acc.betLimits === 'string') acc.betLimits = JSON.parse(acc.betLimits);
                }
                if (table === 'games' && acc.drawTime) acc.isMarketOpen = isGameOpen(acc.drawTime);
                if (table === 'bets' && acc.numbers) acc.numbers = JSON.parse(acc.numbers);
                if ('isRestricted' in acc) acc.isRestricted = !!acc.isRestricted;
            } catch (inner) {}
            return acc;
        });
    } catch (e) {
        logError('GET_ALL_' + table, e);
        return [];
    }
};

const runInTransaction = (fn) => db.transaction(fn)();

const addLedgerEntry = (accountId, accountType, description, debit, credit) => {
    if (!accountId) throw new Error('Account ID is required for ledger entry.');
    
    const table = accountType.toLowerCase() + 's';
    const account = db.prepare('SELECT wallet FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(accountId);
    
    if (!account) {
        throw new Error('Account [' + accountId + '] not found in ' + table);
    }
    
    const lastBalance = Number(account.wallet) || 0;
    const debitVal = Number(debit) || 0;
    const creditVal = Number(credit) || 0;
    
    if (debitVal > 0 && accountType !== 'ADMIN' && lastBalance < debitVal) {
        throw new Error('Insufficient funds in account: ' + accountId);
    }
    
    const newBalance = Math.round((lastBalance - debitVal + creditVal) * 100) / 100;
    
    db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(uuidv4(), accountId, accountType, new Date().toISOString(), description, debitVal, creditVal, newBalance);
    
    db.prepare('UPDATE ' + table + ' SET wallet = ? WHERE LOWER(id) = LOWER(?)').run(newBalance, accountId);
};

const declareWinnerForGame = (gameId, winningNumber) => {
    let finalGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || game.winningNumber) throw new Error('Game already finalized.');
        if (game.name === 'AK') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber + '_', gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + winningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(winningNumber, gameId);
        }
        finalGame = findAccountById(gameId, 'games');
    });
    return finalGame;
};

const updateWinningNumber = (gameId, newWinningNumber) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved) throw new Error('Update not allowed.');
        if (game.name === 'AK') {
            const closeDigit = game.winningNumber.endsWith('_') ? '_' : game.winningNumber.slice(1, 2);
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber + closeDigit, gameId);
        } else if (game.name === 'AKC') {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
            const akGame = db.prepare("SELECT * FROM games WHERE name = 'AK'").get();
            if (akGame && akGame.winningNumber && !akGame.winningNumber.endsWith('_')) {
                db.prepare("UPDATE games SET winningNumber = ? WHERE name = 'AK'").run(akGame.winningNumber.slice(0, 1) + newWinningNumber);
            }
        } else {
            db.prepare('UPDATE games SET winningNumber = ? WHERE id = ?').run(newWinningNumber, gameId);
        }
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const approvePayoutsForGame = (gameId) => {
    let updatedGame;
    runInTransaction(() => {
        const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
        if (!game || !game.winningNumber || game.payoutsApproved || (game.name === 'AK' && game.winningNumber.endsWith('_'))) throw new Error("Invalid state for approval.");
        const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map(b => {
            const bet = b;
            bet.numbers = JSON.parse(b.numbers);
            return bet;
        });
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const admin = findAccountById('Guru', 'admins');
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        
        winningBets.forEach(bet => {
            const wins = bet.numbers.filter(n => {
                if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                return n === game.winningNumber;
            });
            if (wins.length > 0) {
                const user = allUsers[bet.userId], dealer = allDealers[bet.dealerId];
                if (!user || !dealer) return;
                const userPrize = Math.round(wins.length * bet.amountPerNumber * getMultiplier(user.prizeRates, bet.subGameType) * 100) / 100;
                const dProfit = Math.round(wins.length * bet.amountPerNumber * (getMultiplier(dealer.prizeRates, bet.subGameType) - getMultiplier(user.prizeRates, bet.subGameType)) * 100) / 100;
                addLedgerEntry(user.id, 'USER', 'Prize won: ' + game.name, 0, userPrize);
                addLedgerEntry(admin.id, 'ADMIN', 'Prize paid: ' + user.name, userPrize, 0);
                addLedgerEntry(dealer.id, 'DEALER', 'Profit: ' + game.name, 0, dProfit);
                addLedgerEntry(admin.id, 'ADMIN', 'Dealer cut: ' + dealer.name, dProfit, 0);
            }
        });
        db.prepare('UPDATE games SET payoutsApproved = 1 WHERE id = ?').run(gameId);
        updatedGame = findAccountById(gameId, 'games');
    });
    return updatedGame;
};

const getFinancialSummary = () => {
    try {
        const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
        const allBets = db.prepare('SELECT * FROM bets').all().map(b => {
            const bet = b;
            bet.numbers = JSON.parse(b.numbers);
            return bet;
        });
        const allUsers = Object.fromEntries(getAllFromTable('users').map(u => [u.id, u]));
        const allDealers = Object.fromEntries(getAllFromTable('dealers').map(d => [d.id, d]));
        const getMultiplier = (r, t) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
        
        const summary = games.map(game => {
            const gameBets = allBets.filter(b => b.gameId === game.id);
            const totalStake = gameBets.reduce((s, b) => s + b.totalAmount, 0);
            let payouts = 0, dProfit = 0;
            if (!game.winningNumber.endsWith('_')) {
                gameBets.forEach(bet => {
                    const wins = bet.numbers.filter(n => {
                        if (bet.subGameType === "1 Digit Open") return game.winningNumber.length === 2 && n === game.winningNumber[0];
                        if (bet.subGameType === "1 Digit Close") return game.name === 'AKC' ? n === game.winningNumber : (game.winningNumber.length === 2 && n === game.winningNumber[1]);
                        return n === game.winningNumber;
                    });
                    if (wins.length > 0) {
                        const u = allUsers[bet.userId], d = allDealers[bet.dealerId];
                        if (u && d) {
                            payouts += wins.length * bet.amountPerNumber * getMultiplier(u.prizeRates, bet.subGameType);
                            dProfit += wins.length * bet.amountPerNumber * (getMultiplier(d.prizeRates, bet.subGameType) - getMultiplier(u.prizeRates, bet.subGameType));
                        }
                    }
                });
            }
            const comms = gameBets.reduce((s, b) => {
                const u = allUsers[b.userId], d = allDealers[b.dealerId];
                return u && d ? s + (b.totalAmount * (u.commissionRate / 100)) + (b.totalAmount * ((d.commissionRate - u.commissionRate) / 100)) : s;
            }, 0);
            return { gameName: game.name, winningNumber: game.winningNumber, totalStake, totalPayouts: payouts, totalDealerProfit: dProfit, totalCommissions: comms, netProfit: totalStake - payouts - dProfit - comms };
        });
        
        const totals = summary.reduce((t, g) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });
        return { games: summary.sort((a,b) => a.gameName.localeCompare(b.gameName)), totals: totals, totalBets: allBets.length };
    } catch (e) {
        logError('FINANCIAL_SUMMARY', e);
        return { games: [], totals: { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }, totalBets: 0 };
    }
};

const createDealer = (d) => {
    if (db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw new Error("ID taken.");
    db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
    if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial setup', 0, d.wallet);
    return findAccountById(d.id, 'dealers');
};

const updateDealer = (d, originalId) => {
    db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)')
      .run(d.id, d.name, d.password, d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
      
    if (d.id !== originalId) {
        db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
    }
    return findAccountById(d.id, 'dealers');
};

const updateAdmin = (a, adminId) => {
    db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
    return findAccountById(adminId, 'admins');
};

const findUsersByDealerId = (id) => db.prepare('SELECT id FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id).map(u => findAccountById(u.id, 'users'));
const findBetsByDealerId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => {
    const bet = b;
    bet.numbers = JSON.parse(b.numbers);
    return bet;
});
const findBetsByUserId = (id) => db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map(b => {
    const bet = b;
    bet.numbers = JSON.parse(b.numbers);
    return bet;
});
const findBetsByGameId = (id) => db.prepare('SELECT * FROM bets WHERE gameId = ?').all(id).map(b => {
    const bet = b;
    bet.numbers = JSON.parse(b.numbers);
    return bet;
});

const findUserByDealer = (uId, dId) => { 
    const stmt = db.prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)');
    const userRow = stmt.get(uId, dId);
    if (!userRow) return null;
    return findAccountById(userRow.id, 'users'); 
};

const createUser = (u, dId, dep = 0) => {
    if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw new Error("Username exists.");
    db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, u.password, dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
    if (dep > 0) { addLedgerEntry(dId, 'DEALER', 'Seed funding: ' + u.name, dep, 0); addLedgerEntry(u.id, 'USER', 'Initial deposit', 0, dep); }
    return findAccountById(u.id, 'users');
};

const updateUser = (u, uId, dId) => {
    db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)')
      .run(u.id, u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId, dId);
    
    if (u.id.toLowerCase() !== uId.toLowerCase()) {
        db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
        db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
    }
    return findAccountById(u.id, 'users');
};

const updateUserByAdmin = (u, uId) => {
    db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
    return findAccountById(uId, 'users');
};

const deleteUserByDealer = (uId, dId) => {
    runInTransaction(() => {
        db.prepare('DELETE FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(uId, 'USER');
        db.prepare('DELETE FROM bets WHERE LOWER(userId) = LOWER(?)').run(uId);
        db.prepare('DELETE FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').run(uId, dId);
    });
    return true;
};

const toggleAccountRestrictionByAdmin = (id, type) => {
    let result;
    runInTransaction(() => {
        const table = type.toLowerCase() + 's';
        const acc = db.prepare('SELECT isRestricted FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(id);
        if (!acc) throw new Error('Not found.');
        const status = acc.isRestricted ? 0 : 1;
        db.prepare('UPDATE ' + table + ' SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(status, id);
        if (type.toLowerCase() === 'dealer') db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(dealerId) = LOWER(?)').run(status, id);
        result = findAccountById(id, table);
    });
    return result;
};

const toggleUserRestrictionByDealer = (uId, dId) => {
    const user = db.prepare('SELECT isRestricted FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(uId, dId);
    if (!user) throw new Error('Not found.');
    db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(user.isRestricted ? 0 : 1, uId);
    return findAccountById(uId, 'users');
};

/**
 * FORMAL FUNCTION DECLARATION FOR NUMBER STAKE SUMMARY
 * This ensures the function is properly defined in the scope before export.
 */
function getNumberStakeSummary(params) {
    try {
        let query = 'SELECT gameId, subGameType, numbers, amountPerNumber, totalAmount FROM bets';
        const vals = [], conds = [];
        if (params.gameId) { conds.push('gameId = ?'); vals.push(params.gameId); }
        if (params.dealerId) { conds.push('LOWER(dealerId) = LOWER(?)'); vals.push(params.dealerId); }
        if (params.date) { conds.push('date(timestamp) = ?'); vals.push(params.date); }
        if (conds.length > 0) query += ' WHERE ' + conds.join(' AND ');
        
        const bets = db.prepare(query).all(...vals);
        const map2 = new Map(), mapO = new Map(), mapC = new Map(), mapG = new Map();
        
        bets.forEach(b => {
            mapG.set(b.gameId, (mapG.get(b.gameId) || 0) + b.totalAmount);
            try {
                const nums = JSON.parse(b.numbers), amt = b.amountPerNumber;
                let target;
                if (b.subGameType === '1 Digit Open') target = mapO;
                else if (b.subGameType === '1 Digit Close') target = mapC;
                else target = map2;
                nums.forEach(n => target.set(n, (target.get(n) || 0) + amt));
            } catch (e) {}
        });
        
        const sort = (m) => Array.from(m.entries()).map(e => ({ number: e[0], stake: e[1] })).sort((a, b) => b.stake - a.stake);
        return { 
            twoDigit: sort(map2), 
            oneDigitOpen: sort(mapO), 
            oneDigitClose: sort(mapC), 
            gameBreakdown: Array.from(mapG.entries()).map(e => ({ gameId: e[0], stake: e[1] })) 
        };
    } catch (e) {
        logError('NUMBER_SUMMARY', e);
        return { twoDigit: [], oneDigitOpen: [], oneDigitClose: [], gameBreakdown: [] };
    }
}

const placeBulkBets = (uId, gId, groups) => {
    let result = null;
    runInTransaction(() => {
        const user = findAccountById(uId, 'users');
        if (!user || user.isRestricted) throw new Error('Access denied.');
        const game = findAccountById(gId, 'games');
        if (!game || !isGameOpen(game.drawTime)) throw new Error("Market is closed.");
        const dealer = findAccountById(user.dealerId, 'dealers');
        const requestTotal = groups.reduce((s, g) => s + g.numbers.length * g.amountPerNumber, 0);
        if (user.wallet < requestTotal) throw new Error('Balance too low.');
        
        const admin = findAccountById('Guru', 'admins');
        const userComm = Math.round(requestTotal * (user.commissionRate / 100) * 100) / 100;
        const dComm = Math.round(requestTotal * ((dealer.commissionRate - user.commissionRate) / 100) * 100) / 100;
        
        addLedgerEntry(user.id, 'USER', 'Bet: ' + game.name, requestTotal, 0);
        if (userComm > 0) addLedgerEntry(user.id, 'USER', 'Comm earned', 0, userComm);
        addLedgerEntry(admin.id, 'ADMIN', 'Stake: ' + user.name, 0, requestTotal);
        if (userComm > 0) addLedgerEntry(admin.id, 'ADMIN', 'Comm paid', userComm, 0);
        if (dComm > 0) { 
            addLedgerEntry(admin.id, 'ADMIN', 'Override payout', dComm, 0); 
            addLedgerEntry(dealer.id, 'DEALER', 'Comm cut: ' + user.name, 0, dComm); 
        }

        const created = [];
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            const b = { 
                id: uuidv4(), userId: uId, dealerId: dealer.id, gameId: game.id, 
                subGameType: g.subGameType, numbers: JSON.stringify(g.numbers), 
                amountPerNumber: g.amountPerNumber, totalAmount: g.numbers.length * g.amountPerNumber, 
                timestamp: new Date().toISOString() 
            };
            db.prepare('INSERT INTO bets (id, userId, dealerId, gameId, subGameType, numbers, amountPerNumber, totalAmount, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(b.id, b.userId, b.dealerId, b.gameId, b.subGameType, b.numbers, b.amountPerNumber, b.totalAmount, b.timestamp);
            b.numbers = g.numbers;
            created.push(b);
        }
        result = created;
    });
    return result;
};

const updateGameDrawTime = (id, time) => {
    db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(time, id);
    return findAccountById(id, 'games');
};

function getAllNumberLimits() { return db.prepare('SELECT * FROM number_limits').all(); }
function saveNumberLimit(limit) {
    db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)').run(limit.gameType, limit.numberValue, limit.limitAmount);
    return db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue);
}
function deleteNumberLimit(id) { db.prepare('DELETE FROM number_limits WHERE id = ?').run(id); }

function resetAllGames() {
    try {
        runInTransaction(() => {
            db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
            db.prepare('DELETE FROM bets').run(); 
        });
        console.error('--- [DATABASE] Daily Reset Triggered. ---');
    } catch (e) {
        logError('DAILY_RESET', e);
    }
}

module.exports = {
    connect, verifySchema, findAccountById, findAccountForLogin, updatePassword, getAllFromTable, runInTransaction, addLedgerEntry, createDealer, updateDealer, updateAdmin, findUsersByDealerId, findUserByDealer, findBetsByUserId, createUser, updateUser, updateUserByAdmin, deleteUserByDealer, toggleAccountRestrictionByAdmin, toggleUserRestrictionByDealer, declareWinnerForGame, updateWinningNumber, approvePayoutsForGame, getFinancialSummary, getNumberStakeSummary, placeBulkBets, updateGameDrawTime, resetAllGames, getAllNumberLimits, saveNumberLimit, deleteNumberLimit, findBetsByDealerId, findBetsByGameId
};