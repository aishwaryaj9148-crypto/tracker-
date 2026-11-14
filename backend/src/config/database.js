const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Load environment variables from backend/.env
const backendRoot = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(backendRoot, '.env') });

const dbRelativePath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
const dbPath = path.resolve(backendRoot, dbRelativePath);

// Ensure the target directory for the SQLite file exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize SQLite database instance
const db = new Database(dbPath);

// Enable foreign keys and Write-Ahead Logging for performance & integrity
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema automatically on server start
function initDatabase() {
  const schemaPath = path.join(backendRoot, 'database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  }
}

initDatabase();

module.exports = db;
