
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const DB_PATH = path.join(__dirname, 'database.sqlite');
const JSON_DB_PATH = path.join(__dirname, 'backend', 'db.json');

// --- DATABASE SETUP ---
let db: any;

function initDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        console.log('--- Initializing Database ---');
        db = new Database(DB_PATH);
        
        // Use the contents of setup-database.js to create schema
        db.exec(`
            CREATE TABLE admins (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                wallet REAL NOT NULL,
                prizeRates TEXT NOT NULL,
                avatarUrl TEXT
            );
            CREATE TABLE dealers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                area TEXT,
                contact TEXT,
                wallet REAL NOT NULL,
                commissionRate REAL NOT NULL,
                isRestricted INTEGER NOT NULL DEFAULT 0,
                prizeRates TEXT NOT NULL,
                avatarUrl TEXT
            );
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                dealerId TEXT NOT NULL,
                area TEXT,
                contact TEXT,
                wallet REAL NOT NULL,
                commissionRate REAL NOT NULL,
                isRestricted INTEGER NOT NULL DEFAULT 0,
                prizeRates TEXT NOT NULL,
                betLimits TEXT,
                avatarUrl TEXT,
                FOREIGN KEY (dealerId) REFERENCES dealers(id)
            );
            CREATE TABLE games (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                drawTime TEXT NOT NULL,
                winningNumber TEXT,
                payoutsApproved INTEGER DEFAULT 0
            );
            CREATE TABLE bets (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                dealerId TEXT NOT NULL,
                gameId TEXT NOT NULL,
                subGameType TEXT NOT NULL,
                numbers TEXT NOT NULL,
                amountPerNumber REAL NOT NULL,
                totalAmount REAL NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (userId) REFERENCES users(id),
                FOREIGN KEY (dealerId) REFERENCES dealers(id),
                FOREIGN KEY (gameId) REFERENCES games(id)
            );
            CREATE TABLE ledgers (
                id TEXT PRIMARY KEY,
                accountId TEXT NOT NULL,
                accountType TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                description TEXT NOT NULL,
                debit REAL NOT NULL,
                credit REAL NOT NULL,
                balance REAL NOT NULL
            );
            CREATE TABLE number_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gameType TEXT NOT NULL,
                numberValue TEXT NOT NULL,
                limitAmount REAL NOT NULL,
                UNIQUE(gameType, numberValue)
            );
            CREATE INDEX idx_ledgers_accountId ON ledgers(accountId);
            CREATE INDEX idx_bets_userId ON bets(userId);
            CREATE INDEX idx_users_dealerId ON users(dealerId);
        `);

        if (fs.existsSync(JSON_DB_PATH)) {
            console.log('--- Migrating initial data from db.json ---');
            const jsonData = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
            
            const insertAdmin = db.prepare('INSERT INTO admins (id, name, password, wallet, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?)');
            const insertDealer = db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const insertUser = db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            const insertGame = db.prepare('INSERT INTO games (id, name, drawTime, winningNumber, payoutsApproved) VALUES (?, ?, ?, ?, ?)');
            const insertLedger = db.prepare('INSERT INTO ledgers (id, accountId, accountType, timestamp, description, debit, credit, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

            db.transaction(() => {
                // Admin
                const admin = jsonData.admin;
                insertAdmin.run(admin.id, admin.name, admin.password, admin.wallet, JSON.stringify(admin.prizeRates), admin.avatarUrl);
                admin.ledger.forEach((l: any) => insertLedger.run(uuidv4(), admin.id, 'ADMIN', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
                
                // Dealers
                jsonData.dealers.forEach((dealer: any) => {
                    insertDealer.run(dealer.id, dealer.name, dealer.password, dealer.area, dealer.contact, dealer.wallet, dealer.commissionRate, dealer.isRestricted ? 1 : 0, JSON.stringify(dealer.prizeRates), dealer.avatarUrl);
                    dealer.ledger.forEach((l: any) => insertLedger.run(uuidv4(), dealer.id, 'DEALER', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
                });

                // Users
                jsonData.users.forEach((user: any) => {
                    insertUser.run(user.id, user.name, user.password, user.dealerId, user.area, user.contact, user.wallet, user.commissionRate, user.isRestricted ? 1 : 0, JSON.stringify(user.prizeRates), user.betLimits ? JSON.stringify(user.betLimits) : null, user.avatarUrl);
                    user.ledger.forEach((l: any) => insertLedger.run(uuidv4(), user.id, 'USER', new Date(l.timestamp).toISOString(), l.description, l.debit, l.credit, l.balance));
                });

                // Games
                jsonData.games.forEach((game: any) => {
                    insertGame.run(game.id, game.name, game.drawTime, game.winningNumber || null, game.payoutsApproved ? 1 : 0);
                });
            })();
        }
    } else {
        db = new Database(DB_PATH);
        console.log('--- Database Opened [Path: ' + DB_PATH + '] ---');
    }
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
}

// --- DATABASE ACCESS HELPER ---
function getDb() {
    if (!db) {
        console.warn('[SERVER] Database was closed or not initialized. Re-initializing...');
        initDatabase();
    }
    return db;
}

// --- HELPERS (From original backend) ---

function isGameOpen(drawTime: string) {
    try {
        if (!drawTime || typeof drawTime !== 'string' || !drawTime.includes(':')) return false;
        
        const now = new Date();
        // PKT is UTC+5. Calculate current time in PKT.
        const pktTime = new Date(now.getTime() + (5 * 60 * 60 * 1000));
        const parts = drawTime.split(':');
        const drawH = parseInt(parts[0], 10);
        const drawM = parseInt(parts[1], 10);
        
        if (isNaN(drawH) || isNaN(drawM)) return false;
        
        // Logical Draw Date Strategy:
        // Market opens at 4:00 PM PKT (16:00) the day BEFORE the draw or same day if draw > 16:00.
        // Simplified: Market is open IF (CurrentTime < DrawTime) AND (CurrentTime >= MostRecent 4PM).
        
        const currentDraw = new Date(pktTime);
        currentDraw.setUTCHours(drawH, drawM, 0, 0);

        const mostRecent4PM = new Date(pktTime);
        mostRecent4PM.setUTCHours(16, 0, 0, 0);
        if (pktTime.getUTCHours() < 16) {
            mostRecent4PM.setUTCDate(mostRecent4PM.getUTCDate() - 1);
        }

        // If draw is before 4PM (like 11AM), it belongs to the previous day's 4pm cycle
        if (drawH < 16 && pktTime.getUTCHours() >= 16) {
            currentDraw.setUTCDate(currentDraw.getUTCDate() + 1);
        } else if (drawH >= 16 && pktTime.getUTCHours() < 16) {
            currentDraw.setUTCDate(currentDraw.getUTCDate() - 1);
        }

        return pktTime >= mostRecent4PM && pktTime < currentDraw;
    } catch (e) {
        return false;
    }
}

const findAccountById = (id: string, table: string) => {
    if (!id) return null;
    try {
        const _db = getDb();
        const stmt = _db.prepare('SELECT * FROM ' + table + ' WHERE LOWER(id) = LOWER(?)');
        const account = stmt.get(id);
        if (!account) return null;
        
        if (table !== 'games') {
            account.ledger = _db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT 50').all(id).reverse();
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
        console.error('FIND_ACCOUNT Error', e);
        return null;
    }
};

const findAccountForLogin = (loginId: string) => {
    if (!loginId || typeof loginId !== 'string' || loginId.trim().length === 0) {
        return { account: null, role: null };
    }
    
    const targetId = loginId.trim().toLowerCase();
    const tables = [
        { name: 'users', role: 'USER' },
        { name: 'dealers', role: 'DEALER' },
        { name: 'admins', role: 'ADMIN' }
    ];

    const _db = getDb();
    for (var i = 0; i < tables.length; i++) {
        var info = tables[i];
        try {
            const stmt = _db.prepare('SELECT * FROM ' + info.name + ' WHERE LOWER(id) = ?');
            const account = stmt.get(targetId);
            if (account) return { account: account, role: info.role };
        } catch (e) {
            console.error('LOGIN_LOOKUP_' + info.role, e);
        }
    }
    return { account: null, role: null };
};

const getAllFromTable = (table: string, withLedger = false) => {
    try {
        const _db = getDb();
        const rows = _db.prepare('SELECT * FROM ' + table).all();
        return rows.map((acc: any) => {
            try {
                if (table === 'users' || table === 'dealers' || table === 'admins') {
                    acc.commissionRate = Number(acc.commissionRate) || 0;
                    if (withLedger && acc.id) {
                        acc.ledger = _db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) ORDER BY timestamp DESC LIMIT 20').all(acc.id).reverse();
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
        console.error('GET_ALL_' + table, e);
        return [];
    }
};

const addLedgerEntry = (accountId: string, accountType: string, description: string, debit: number, credit: number) => {
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

const findUsersByDealerId = (id: string) => {
    try {
        const rows = db.prepare('SELECT * FROM users WHERE LOWER(dealerId) = LOWER(?)').all(id);
        return rows.map((u: any) => {
            u.commissionRate = Number(u.commissionRate) || 0;
            if (u.prizeRates && typeof u.prizeRates === 'string') u.prizeRates = JSON.parse(u.prizeRates);
            if (u.betLimits && typeof u.betLimits === 'string') u.betLimits = JSON.parse(u.betLimits);
            u.isRestricted = !!u.isRestricted;
            return u;
        });
    } catch (e) {
        console.error('findUsersByDealerId Error', e);
        return [];
    }
};

const findBetsByDealerId = (id: string) => {
    try {
        return db.prepare('SELECT * FROM bets WHERE LOWER(dealerId) = LOWER(?) ORDER BY timestamp DESC').all(id).map((b: any) => {
            try { b.numbers = JSON.parse(b.numbers); } catch (e) { b.numbers = []; }
            return b;
        });
    } catch (e) {
        return [];
    }
};

const findBetsByUserId = (id: string) => {
    try {
        return db.prepare('SELECT * FROM bets WHERE LOWER(userId) = LOWER(?) ORDER BY timestamp DESC').all(id).map((b: any) => {
            try { b.numbers = JSON.parse(b.numbers); } catch (e) { b.numbers = []; }
            return b;
        });
    } catch (e) {
        return [];
    }
};

const placeBulkBets = (uId: string, gId: string, groups: any[]) => {
    let result = null;
    db.transaction(() => {
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
            const b: any = { 
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
    })();
    return result;
};

// --- MIDDLEWARE ---

const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};

// --- AUTOMATIC GAME RESET SCHEDULER ---
const PKT_OFFSET_HOURS = 5;
const RESET_HOUR_PKT = 16; // 4:00 PM PKT
let resetTimer: NodeJS.Timeout | null = null;

function scheduleNextGameReset() {
    if (resetTimer) clearTimeout(resetTimer);
    
    const now = new Date();
    const resetHourUTC = RESET_HOUR_PKT - PKT_OFFSET_HOURS;
    let resetTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), resetHourUTC, 0, 5, 0));

    if (now >= resetTime) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }

    const delay = resetTime.getTime() - now.getTime();
    console.log('--- [SCHEDULER] Next reset at: ' + resetTime.toUTCString() + ' ---');
    
    resetTimer = setTimeout(() => {
        try { 
            db.transaction(() => {
                db.prepare('UPDATE games SET winningNumber = NULL, payoutsApproved = 0').run();
                db.prepare('DELETE FROM bets').run(); 
            })();
            console.log('--- [DATABASE] Daily Reset Triggered. ---');
        } catch (e: any) { 
            console.error('--- [SCHEDULER] Error: ' + (e.message || e) + ' ---'); 
        }
        scheduleNextGameReset();
    }, delay);
}

// --- SERVER SETUP ---

async function startServer() {
    initDatabase();
    scheduleNextGameReset();
    
    const app = express();
    const port = process.env.PORT || 3000;

    app.use((req, res, next) => {
        console.log(`[SERVER] ${req.method} ${req.url}`);
        next();
    });

    app.use(cors());
    app.use(express.json());

    // --- AUTH ROUTES ---
    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', time: new Date().toISOString(), db: !!db });
    });

    app.post('/api/auth/login', (req, res) => {
        try {
            if (!req.body || !req.body.loginId) return res.status(400).json({ message: 'Input required.' });
            const result = findAccountForLogin(req.body.loginId);
            if (result.account && result.account.password === req.body.password) {
                const table = result.role.toLowerCase() + 's';
                const fullAccount = findAccountById(result.account.id, table);
                const token = jwt.sign({ id: result.account.id, role: result.role }, JWT_SECRET, { expiresIn: '1d' });
                return res.json({ token: token, role: result.role, account: fullAccount });
            }
            res.status(401).json({ message: 'ID or Password incorrect.' });
        } catch (e: any) {
            console.error('Login error', e);
            res.status(500).json({ message: 'Server error' });
        }
    });

    app.get('/api/auth/verify', authMiddleware, (req: any, res) => {
        try {
            const role = req.user.role;
            const table = role.toLowerCase() + 's';
            const account = findAccountById(req.user.id, table);
            if (!account) return res.status(404).json({ message: 'User not found.' });
            
            let extra: any = {};
            if (role === 'DEALER') {
                extra.users = findUsersByDealerId(req.user.id);
                extra.bets = findBetsByDealerId(req.user.id);
            } else if (role === 'USER') {
                extra.bets = findBetsByUserId(req.user.id);
            } else if (role === 'ADMIN') {
                extra.dealers = getAllFromTable('dealers', true);
                extra.users = getAllFromTable('users', true);
                extra.bets = getAllFromTable('bets');
            }
            res.json(Object.assign({ account: account, role: role }, extra));
        } catch (e) {
            res.sendStatus(500);
        }
    });

    // --- DATA ROUTES ---
    app.get('/api/games', (req, res) => {
        try {
            const data = getAllFromTable('games');
            res.json(data || []);
        } catch (e) {
            res.status(500).json([]);
        }
    });

    app.get('/api/user/data', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'USER') return res.sendStatus(403);
        res.json({ 
            account: findAccountById(req.user.id, 'users'), 
            games: getAllFromTable('games'), 
            bets: findBetsByUserId(req.user.id) 
        });
    });

    app.get('/api/dealer/data', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        res.json({ 
            account: findAccountById(req.user.id, 'dealers'), 
            users: findUsersByDealerId(req.user.id), 
            bets: findBetsByDealerId(req.user.id) 
        });
    });

    app.get('/api/admin/data', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        res.json({ 
            account: findAccountById(req.user.id, 'admins'), 
            dealers: getAllFromTable('dealers', false), 
            users: getAllFromTable('users', false), 
            games: getAllFromTable('games'), 
            bets: getAllFromTable('bets') 
        });
    });

    app.get('/api/admin/accounts/:type/:id/ledger', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        const { type, id } = req.params;
        try {
            const table = type.toLowerCase() + 's';
            const entries = db.prepare('SELECT * FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ? ORDER BY timestamp DESC LIMIT 50').all(id, type.toUpperCase()).reverse();
            res.json(entries);
        } catch (e) {
            res.status(500).json({ message: 'Failed to fetch ledger' });
        }
    });

    // --- ACTION ROUTES ---
    app.post('/api/user/bets', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'USER') return res.sendStatus(403);
        const body = req.body;
        try {
            if (body.isMultiGame && body.multiGameBets) {
                const results: any[] = [];
                db.transaction(() => {
                    Object.entries(body.multiGameBets).forEach(([gameId, entry]: [string, any]) => {
                        const processed = placeBulkBets(req.user.id, gameId, entry.betGroups);
                        if (processed) results.push(...processed);
                    });
                })();
                res.status(201).json(results);
            } else {
                res.status(201).json(placeBulkBets(req.user.id, body.gameId, body.betGroups));
            }
        } catch (e: any) {
            res.status(400).json({ message: e.message || 'Processing failed' });
        }
    });

    app.post('/api/dealer/bets/bulk', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            res.status(201).json(placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups));
        } catch (e: any) {
            res.status(400).json({ message: e.message });
        }
    });

    app.post('/api/dealer/users', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const u = req.body.userData;
            const dId = req.user.id;
            const dep = req.body.initialDeposit || 0;
            if (db.prepare('SELECT id FROM users WHERE LOWER(id) = ?').get(u.id.toLowerCase())) throw new Error("Username exists.");
            
            let newUser;
            db.transaction(() => {
                db.prepare('INSERT INTO users (id, name, password, dealerId, area, contact, wallet, commissionRate, isRestricted, prizeRates, betLimits, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(u.id, u.name, u.password, dId, u.area, u.contact, 0, u.commissionRate, 0, JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl);
                if (dep > 0) {
                    addLedgerEntry(dId, 'DEALER', 'Seed funding: ' + u.name, dep, 0);
                    addLedgerEntry(u.id, 'USER', 'Initial deposit', 0, dep);
                }
                newUser = findAccountById(u.id, 'users');
            })();
            res.status(201).json(newUser);
        } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

    app.put('/api/dealer/users/:id', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const u = req.body;
            const uId = req.params.id;
            const dId = req.user.id;
            db.transaction(() => {
                db.prepare('UPDATE users SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)')
                  .run(u.id, u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId, dId);
                
                if (u.id.toLowerCase() !== uId.toLowerCase()) {
                    db.prepare('UPDATE bets SET userId = ? WHERE LOWER(userId) = LOWER(?)').run(u.id, uId);
                    db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(u.id, uId, 'USER');
                }
            })();
            res.json(findAccountById(u.id, 'users'));
        } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

    app.delete('/api/dealer/users/:id', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const uId = req.params.id;
            const dId = req.user.id;
            db.transaction(() => {
                db.prepare('DELETE FROM ledgers WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(uId, 'USER');
                db.prepare('DELETE FROM bets WHERE LOWER(userId) = LOWER(?)').run(uId);
                db.prepare('DELETE FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').run(uId, dId);
            })();
            res.sendStatus(204);
        } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

    app.post('/api/dealer/topup/user', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const { userId, amount } = req.body;
            const user = db.prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(userId, req.user.id);
            if (!user) throw new Error('User not found in your network.');

            db.transaction(() => {
                addLedgerEntry(req.user.id, 'DEALER', 'User funding: ' + userId, amount, 0);
                addLedgerEntry(userId, 'USER', 'Wallet refill', 0, amount);
            })();
            res.json({ message: "Success" });
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/dealer/withdraw/user', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const { userId, amount } = req.body;
            const user = db.prepare('SELECT id FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(userId, req.user.id);
            if (!user) throw new Error('User not found in your network.');
            
            db.transaction(() => {
                addLedgerEntry(userId, 'USER', 'Withdrawal by Dealer', amount, 0);
                addLedgerEntry(req.user.id, 'DEALER', 'User withdrawal credit: ' + userId, 0, amount);
            })();
            res.json({ message: "Success" });
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/dealer/users/:id/toggle-restriction', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'DEALER') return res.sendStatus(403);
        try {
            const uId = req.params.id;
            const user = db.prepare('SELECT isRestricted FROM users WHERE LOWER(id) = LOWER(?) AND LOWER(dealerId) = LOWER(?)').get(uId, req.user.id);
            if (!user) throw new Error('Not found.');
            db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(user.isRestricted ? 0 : 1, uId);
            res.json(findAccountById(uId, 'users'));
        } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

    // --- ADMIN ROUTES ---
    app.get('/api/admin/summary', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const games = db.prepare('SELECT * FROM games WHERE winningNumber IS NOT NULL').all();
            const allBets = db.prepare('SELECT * FROM bets').all().map((b: any) => ({ ...b, numbers: JSON.parse(b.numbers) }));
            const allUsers = Object.fromEntries(getAllFromTable('users').map((u: any) => [u.id, u]));
            const allDealers = Object.fromEntries(getAllFromTable('dealers').map((d: any) => [d.id, d]));
            const getMultiplier = (r: any, t: string) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
            
            const summary = games.map((game: any) => {
                const gameBets = allBets.filter((b: any) => b.gameId === game.id);
                const totalStake = gameBets.reduce((s: number, b: any) => s + b.totalAmount, 0);
                let payouts = 0, dProfit = 0;
                if (!game.winningNumber.endsWith('_')) {
                    gameBets.forEach((bet: any) => {
                        const wins = bet.numbers.filter((n: string) => {
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
                const comms = gameBets.reduce((s: number, b: any) => {
                    const u = allUsers[b.userId], d = allDealers[b.dealerId];
                    return u && d ? s + (b.totalAmount * (u.commissionRate / 100)) + (b.totalAmount * ((d.commissionRate - u.commissionRate) / 100)) : s;
                }, 0);
                return { gameName: game.name, winningNumber: game.winningNumber, totalStake, totalPayouts: payouts, totalDealerProfit: dProfit, totalCommissions: comms, netProfit: totalStake - payouts - dProfit - comms };
            });
            
            const totals = summary.reduce((t: any, g: any) => { t.totalStake += g.totalStake; t.totalPayouts += g.totalPayouts; t.totalDealerProfit += g.totalDealerProfit; t.totalCommissions += g.totalCommissions; t.netProfit += g.netProfit; return t; }, { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 });
            res.json({ games: summary.sort((a: any, b: any) => a.gameName.localeCompare(b.gameName)), totals: totals, totalBets: allBets.length });
        } catch (e) {
            res.json({ games: [], totals: { totalStake: 0, totalPayouts: 0, totalDealerProfit: 0, totalCommissions: 0, netProfit: 0 }, totalBets: 0 });
        }
    });

    app.get('/api/admin/number-summary', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        const params: any = req.query;
        try {
            let query = 'SELECT gameId, subGameType, numbers, amountPerNumber, totalAmount FROM bets';
            const vals: any[] = [], conds: string[] = [];
            if (params.gameId) { conds.push('gameId = ?'); vals.push(params.gameId); }
            if (params.dealerId) { conds.push('LOWER(dealerId) = LOWER(?)'); vals.push(params.dealerId); }
            if (params.date) { conds.push('date(timestamp) = ?'); vals.push(params.date); }
            if (conds.length > 0) query += ' WHERE ' + conds.join(' AND ');
            
            const bets = db.prepare(query).all(...vals);
            const map2 = new Map(), mapO = new Map(), mapC = new Map(), mapG = new Map();
            
            bets.forEach((b: any) => {
                mapG.set(b.gameId, (mapG.get(b.gameId) || 0) + b.totalAmount);
                try {
                    const nums = JSON.parse(b.numbers), amt = b.amountPerNumber;
                    let target;
                    if (b.subGameType === '1 Digit Open') target = mapO;
                    else if (b.subGameType === '1 Digit Close') target = mapC;
                    else target = map2;
                    nums.forEach((n: string) => target.set(n, (target.get(n) || 0) + amt));
                } catch (e) {}
            });
            
            const sort = (m: Map<any, any>) => Array.from(m.entries()).map(e => ({ number: e[0], stake: e[1] })).sort((a, b) => b.stake - a.stake);
            res.json({ 
                twoDigit: sort(map2), 
                oneDigitOpen: sort(mapO), 
                oneDigitClose: sort(mapC), 
                gameBreakdown: Array.from(mapG.entries()).map(e => ({ gameId: e[0], stake: e[1] })) 
            });
        } catch (e) {
            res.json({ twoDigit: [], oneDigitOpen: [], oneDigitClose: [], gameBreakdown: [] });
        }
    });

     app.post('/api/admin/games/:id/declare-winner', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const gameId = req.params.id;
            const winningNumber = req.body.winningNumber;
            let finalGame;
            db.transaction(() => {
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
            })();
            res.json(finalGame);
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/admin/games/:id/approve-payouts', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const gameId = req.params.id;
            let updatedGame;
            db.transaction(() => {
                const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
                if (!game || !game.winningNumber || game.payoutsApproved || (game.name === 'AK' && game.winningNumber.endsWith('_'))) throw new Error("Invalid state for approval.");
                const winningBets = db.prepare('SELECT * FROM bets WHERE gameId = ?').all(gameId).map((b: any) => ({ ...b, numbers: JSON.parse(b.numbers) }));
                const allUsers = Object.fromEntries(getAllFromTable('users').map((u: any) => [u.id, u]));
                const allDealers = Object.fromEntries(getAllFromTable('dealers').map((d: any) => [d.id, d]));
                const admin = findAccountById('Guru', 'admins');
                const getMultiplier = (r: any, t: string) => t === "1 Digit Open" ? r.oneDigitOpen : t === "1 Digit Close" ? r.oneDigitClose : r.twoDigit;
                
                winningBets.forEach((bet: any) => {
                    const wins = bet.numbers.filter((n: string) => {
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
            })();
            res.json(updatedGame);
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/admin/dealers', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const d = req.body;
            if (db.prepare('SELECT id FROM dealers WHERE LOWER(id) = ?').get(d.id.toLowerCase())) throw new Error("ID taken.");
            db.transaction(() => {
                db.prepare('INSERT INTO dealers (id, name, password, area, contact, wallet, commissionRate, isRestricted, prizeRates, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.name, d.password, d.area, d.contact, d.wallet || 0, d.commissionRate, 0, JSON.stringify(d.prizeRates), d.avatarUrl);
                if (d.wallet > 0) addLedgerEntry(d.id, 'DEALER', 'Initial setup', 0, d.wallet);
            })();
            res.status(201).json(findAccountById(d.id, 'dealers'));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/admin/dealers/:id', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const d = req.body;
            const originalId = req.params.id;
            db.transaction(() => {
                db.prepare('UPDATE dealers SET id = ?, name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)')
                  .run(d.id, d.name, d.password, d.area, d.contact, Number(d.commissionRate), JSON.stringify(d.prizeRates), d.avatarUrl, originalId);
                  
                if (d.id !== originalId) {
                    db.prepare('UPDATE users SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
                    db.prepare('UPDATE bets SET dealerId = ? WHERE LOWER(dealerId) = LOWER(?)').run(d.id, originalId);
                    db.prepare('UPDATE ledgers SET accountId = ? WHERE LOWER(accountId) = LOWER(?) AND accountType = ?').run(d.id, originalId, 'DEALER');
                }
            })();
            res.json(findAccountById(d.id, 'dealers'));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/admin/users/:id', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const u = req.body;
            const uId = req.params.id;
            db.prepare('UPDATE users SET name = ?, password = ?, area = ?, contact = ?, commissionRate = ?, prizeRates = ?, betLimits = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(u.name, u.password, u.area, u.contact, Number(u.commissionRate), JSON.stringify(u.prizeRates), JSON.stringify(u.betLimits), u.avatarUrl, uId);
            res.json(findAccountById(uId, 'users'));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/admin/profile', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const a = req.body;
            const adminId = req.user.id;
            db.prepare('UPDATE admins SET name = ?, prizeRates = ?, avatarUrl = ? WHERE LOWER(id) = LOWER(?)').run(a.name, JSON.stringify(a.prizeRates), a.avatarUrl, adminId);
            res.json(findAccountById(adminId, 'admins'));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/admin/topup/dealer', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const { dealerId, amount } = req.body;
            db.transaction(() => {
                addLedgerEntry(req.user.id, 'ADMIN', `Funding Dealer ${dealerId}`, amount, 0);
                addLedgerEntry(dealerId, 'DEALER', 'Deposit from Admin', 0, amount);
            })();
            res.json({ message: "Success" });
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/admin/withdraw/dealer', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const { dealerId, amount } = req.body;
            db.transaction(() => {
                addLedgerEntry(dealerId, 'DEALER', 'Withdrawal by Admin', amount, 0);
                addLedgerEntry(req.user.id, 'ADMIN', `Withdrawal from ${dealerId}`, 0, amount);
            })();
            res.json({ message: "Success" });
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/admin/accounts/:type/:id/toggle-restriction', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const type = req.params.type;
            const id = req.params.id;
            let result;
            db.transaction(() => {
                const table = type.toLowerCase() + 's';
                const acc = db.prepare('SELECT isRestricted FROM ' + table + ' WHERE LOWER(id) = LOWER(?)').get(id);
                if (!acc) throw new Error('Not found.');
                const status = acc.isRestricted ? 0 : 1;
                db.prepare('UPDATE ' + table + ' SET isRestricted = ? WHERE LOWER(id) = LOWER(?)').run(status, id);
                if (type.toLowerCase() === 'dealer') db.prepare('UPDATE users SET isRestricted = ? WHERE LOWER(dealerId) = LOWER(?)').run(status, id);
                result = findAccountById(id, table);
            })();
            res.json(result);
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/admin/bulk-bet', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try { res.status(201).json(placeBulkBets(req.body.userId, req.body.gameId, req.body.betGroups)); }
        catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.put('/api/admin/games/:id/draw-time', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            db.prepare('UPDATE games SET drawTime = ? WHERE id = ?').run(req.body.newDrawTime, req.params.id);
            res.json(findAccountById(req.params.id, 'games'));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    // --- NUMBER LIMITS ---
    app.get('/api/admin/number-limits', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        res.json(db.prepare('SELECT * FROM number_limits').all());
    });

    app.post('/api/admin/number-limits', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            const limit = req.body;
            db.prepare('INSERT OR REPLACE INTO number_limits (gameType, numberValue, limitAmount) VALUES (?, ?, ?)').run(limit.gameType, limit.numberValue, limit.limitAmount);
            res.json(db.prepare('SELECT * FROM number_limits WHERE gameType = ? AND numberValue = ?').get(limit.gameType, limit.numberValue));
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.delete('/api/admin/number-limits/:id', authMiddleware, (req: any, res) => {
        if (req.user.role !== 'ADMIN') return res.sendStatus(403);
        try {
            db.prepare('DELETE FROM number_limits WHERE id = ?').run(req.params.id);
            res.sendStatus(204);
        } catch (e: any) { res.status(400).json({ message: e.message }); }
    });

    app.post('/api/user/ai-lucky-pick', authMiddleware, async (req, res) => {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
            console.error('--- [AI] Gemini API Key missing. Service unavailable. ---');
            return res.status(503).json({ message: "AI disabled" });
        }
        try {
            const ai = new GoogleGenAI(key);
            const { gameType, count = 5 } = req.body;
            const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const prompt = `Give ${count} lucky numbers for ${gameType}. Return only a comma-separated list of numbers. For 1 Digit games, numbers are 0-9. For 2 Digit games, numbers are 00-99.`;
            const result = await model.generateContent(prompt);
            res.json({ luckyNumbers: result.response.text() });
        } catch (e) { res.status(500).json({ message: "AI error" }); }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: 'spa',
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    // Standard 404 Handler (matches anything not handled above)
    app.use((req, res) => {
        res.status(404).send("Not Found");
    });

    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${port}`);
    });
}

startServer();
