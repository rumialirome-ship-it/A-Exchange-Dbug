
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'database.sqlite');

try {
    const db = new Database(DB_PATH);
    const count = db.prepare('SELECT COUNT(*) as count FROM games').get();
    console.log('GAMES_COUNT:', count.count);
    const games = db.prepare('SELECT * FROM games').all();
    console.log('GAMES:', JSON.stringify(games));
} catch (e) {
    console.error('ERROR:', e);
}
