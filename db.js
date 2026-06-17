const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      wallet_address TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      skin_color TEXT DEFAULT '#f4b07a',
      last_seen TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS builds (
      wallet_address TEXT PRIMARY KEY REFERENCES players(wallet_address),
      blocks JSONB DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS banned_wallets (
      wallet_address TEXT PRIMARY KEY,
      reason TEXT,
      banned_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('[DB] Sandbox tables ready');
}

async function isBanned(walletAddress) {
  try {
    const res = await pool.query('SELECT 1 FROM banned_wallets WHERE wallet_address = $1', [walletAddress]);
    return res.rows.length > 0;
  } catch(e) {
    console.error('[DB] isBanned error:', e.message);
    return false;
  }
}

async function loadPlayer(walletAddress) {
  try {
    const res = await pool.query('SELECT * FROM players WHERE wallet_address = $1', [walletAddress]);
    return res.rows[0] || null;
  } catch(e) {
    console.error('[DB] loadPlayer error:', e.message);
    return null;
  }
}

async function savePlayer(walletAddress, nickname, skinColor) {
  try {
    await pool.query(`
      INSERT INTO players (wallet_address, nickname, skin_color, last_seen)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (wallet_address) DO UPDATE SET
        nickname = $2, skin_color = $3, last_seen = NOW()
    `, [walletAddress, nickname, skinColor]);
  } catch(e) {
    console.error('[DB] savePlayer error:', e.message);
  }
}

async function loadBuild(walletAddress) {
  try {
    const res = await pool.query('SELECT blocks FROM builds WHERE wallet_address = $1', [walletAddress]);
    if (res.rows.length === 0) {
      await pool.query('INSERT INTO builds (wallet_address, blocks) VALUES ($1, $2)', [walletAddress, '{}']);
      return {};
    }
    return res.rows[0].blocks || {};
  } catch(e) {
    console.error('[DB] loadBuild error:', e.message);
    return {};
  }
}

async function saveBuild(walletAddress, blocks) {
  try {
    await pool.query(`
      INSERT INTO builds (wallet_address, blocks, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (wallet_address) DO UPDATE SET
        blocks = $2, updated_at = NOW()
    `, [walletAddress, JSON.stringify(blocks)]);
  } catch(e) {
    console.error('[DB] saveBuild error:', e.message);
  }
}

async function banWallet(walletAddress, reason) {
  try {
    await pool.query(`
      INSERT INTO banned_wallets (wallet_address, reason)
      VALUES ($1, $2)
      ON CONFLICT (wallet_address) DO UPDATE SET reason = $2
    `, [walletAddress, reason || 'No reason given']);
  } catch(e) {
    console.error('[DB] banWallet error:', e.message);
  }
}

async function getAllPlayers() {
  try {
    const res = await pool.query(`
      SELECT p.wallet_address, p.nickname, p.last_seen, p.created_at,
        EXISTS(SELECT 1 FROM banned_wallets b WHERE b.wallet_address = p.wallet_address) AS banned
      FROM players p
      ORDER BY p.last_seen DESC
    `);
    return res.rows;
  } catch(e) {
    console.error('[DB] getAllPlayers error:', e.message);
    return [];
  }
}

module.exports = {
  initDB, isBanned, loadPlayer, savePlayer,
  loadBuild, saveBuild, banWallet, getAllPlayers
};
