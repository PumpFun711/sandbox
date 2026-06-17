const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { initDB, isBanned, loadPlayer, savePlayer, loadBuild, saveBuild, banWallet, getAllPlayers } = require('./db');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

app.get('/api/admin/players', async (req, res) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await getAllPlayers());
});

app.post('/api/admin/ban', async (req, res) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  const { walletAddress, reason } = req.body;
  await banWallet(walletAddress, reason);
  const target = Array.from(io.sockets.sockets.values()).find(s => s.walletAddress === walletAddress);
  if (target) target.disconnect();
  res.json({ success: true });
});

const BANNED_WORDS = [
  'nigger','nigga','chink','spic','kike','faggot','retard',
  'cunt','whore','tranny','beaner','wetback','gook','cracker'
];

function normalizeForFilter(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s').replace(/7/g,'t').replace(/\$/g,'s')
    .replace(/[^a-z0-9]/g, '');
}

function isNicknameClean(nickname) {
  const normalized = normalizeForFilter(nickname);
  return !BANNED_WORDS.some(word => normalized.includes(word));
}

const hubPlayers = new Map();
const connectedWallets = new Map();
const placeRates = new Map();

function checkPlaceRate(socketId) {
  const now = Date.now();
  if (!placeRates.has(socketId)) placeRates.set(socketId, { count: 0, resetAt: now + 1000 });
  const rate = placeRates.get(socketId);
  if (now > rate.resetAt) { rate.count = 0; rate.resetAt = now + 1000; }
  rate.count++;
  return rate.count <= 15;
}

const MAX_BUILD_BLOCKS = 20000;

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('joinHub', async (data) => {
    const { nickname, skinColor, walletAddress } = data;

    if (!walletAddress || walletAddress === 'unknown') {
      socket.emit('gameError', { message: '❌ Wallet required to join.' });
      socket.disconnect();
      return;
    }

    if (await isBanned(walletAddress)) {
      socket.emit('gameError', { message: '🚫 This wallet has been banned.' });
      socket.disconnect();
      return;
    }

    if (!isNicknameClean(nickname || '')) {
      socket.emit('gameError', { message: '❌ Nickname not allowed. Please choose another.' });
      socket.disconnect();
      return;
    }

    const cleanNickname = (nickname || 'Player').slice(0, 16).trim() || 'Player';

    if (connectedWallets.has(walletAddress)) {
      const existingId = connectedWallets.get(walletAddress);
      const existingSocket = io.sockets.sockets.get(existingId);
      if (existingSocket) {
        existingSocket.emit('gameError', { message: '⚠️ Connected from another device. Disconnecting this session.' });
        existingSocket.disconnect();
      }
    }
    connectedWallets.set(walletAddress, socket.id);
    socket.walletAddress = walletAddress;

    await savePlayer(walletAddress, cleanNickname, skinColor || '#f4b07a');

    const playerState = {
      walletAddress, nickname: cleanNickname, skinColor: skinColor || '#f4b07a',
      x: 8 + Math.random() * 4, y: 2, z: 8 + Math.random() * 4,
      rotY: 0, isWalking: false
    };
    hubPlayers.set(socket.id, playerState);
    socket.join('hub');

    socket.emit('hubInit', {
      playerId: socket.id,
      players: Array.from(hubPlayers.entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, p]) => ({ id, ...p }))
    });

    socket.to('hub').emit('hubPlayerJoined', { id: socket.id, ...playerState });
    console.log(`[Hub] ${cleanNickname} (${walletAddress.slice(0,8)}...) joined`);
  });

  socket.on('hubMove', (data) => {
    const p = hubPlayers.get(socket.id);
    if (!p) return;
    p.x = Math.max(0, Math.min(data.x, 64));
    p.y = Math.max(-5, Math.min(data.y, 30));
    p.z = Math.max(0, Math.min(data.z, 64));
    p.rotY = data.rotY;
    p.isWalking = data.isWalking;
    socket.to('hub').emit('hubPlayerMoved', { id: socket.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY, isWalking: p.isWalking });
  });

  socket.on('enterBuildSpace', async () => {
    if (!socket.walletAddress) return;
    const blocks = await loadBuild(socket.walletAddress);
    socket.emit('buildSpaceInit', { blocks });
  });

  socket.on('placeBlock', async (data) => {
    if (!socket.walletAddress) return;
    if (!checkPlaceRate(socket.id)) {
      socket.emit('gameError', { message: '⚠️ Placing too fast! Slow down.' });
      return;
    }

    const { x, y, z, blockType } = data;
    if (Math.abs(x) > 500 || Math.abs(y) > 200 || Math.abs(z) > 500) return;

    const blocks = await loadBuild(socket.walletAddress);
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;

    if (Object.keys(blocks).length >= MAX_BUILD_BLOCKS && !blocks[key]) {
      socket.emit('gameError', { message: `⚠️ Build limit reached (${MAX_BUILD_BLOCKS} blocks max).` });
      return;
    }

    blocks[key] = blockType;
    await saveBuild(socket.walletAddress, blocks);
    socket.emit('blockPlaced', { x, y, z, blockType });
  });

  socket.on('removeBlock', async (data) => {
    if (!socket.walletAddress) return;
    if (!checkPlaceRate(socket.id)) return;

    const { x, y, z } = data;
    const blocks = await loadBuild(socket.walletAddress);
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    delete blocks[key];
    await saveBuild(socket.walletAddress, blocks);
    socket.emit('blockRemoved', { x, y, z });
  });

  socket.on('disconnect', () => {
    if (socket.walletAddress && connectedWallets.get(socket.walletAddress) === socket.id) {
      connectedWallets.delete(socket.walletAddress);
    }
    placeRates.delete(socket.id);

    if (hubPlayers.has(socket.id)) {
      const p = hubPlayers.get(socket.id);
      hubPlayers.delete(socket.id);
      io.to('hub').emit('hubPlayerLeft', { id: socket.id });
      console.log(`[-] ${p.nickname} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`\n🧊 Sandbox server running on port ${PORT}\n`);
  });
});
