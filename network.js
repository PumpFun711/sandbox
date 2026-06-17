const Network = {
  socket: null,
  connected: false,
  playerId: null,

  connect() {
    this.socket = io();

    this.socket.on('connect', () => {
      this.connected = true;
      this.playerId = this.socket.id;
      console.log('[Network] Connected:', this.playerId);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      showToast('Disconnected. Reconnecting...');
    });

    this.socket.on('gameError', (d) => { showToast(d.message); });

    this.socket.on('hubInit',         (d) => { Game.onHubInit(d); });
    this.socket.on('hubPlayerJoined', (d) => { Game.onHubPlayerJoined(d); });
    this.socket.on('hubPlayerMoved',  (d) => { Game.onHubPlayerMoved(d); });
    this.socket.on('hubPlayerLeft',   (d) => { Game.onHubPlayerLeft(d); });

    this.socket.on('buildSpaceInit', (d) => { Game.onBuildSpaceInit(d); });
    this.socket.on('blockPlaced',    (d) => { Game.onBlockPlaced(d); });
    this.socket.on('blockRemoved',   (d) => { Game.onBlockRemoved(d); });
  },

  joinHub(playerData) {
    if (!this.socket) return;
    this.socket.emit('joinHub', {
      nickname:      playerData.nickname,
      skinColor:     playerData.skinColor,
      walletAddress: playerData.walletAddress || 'unknown'
    });
  },

  hubMove(x, y, z, rotY, isWalking) {
    if (!this.socket) return;
    this.socket.emit('hubMove', { x, y, z, rotY, isWalking });
  },

  enterBuildSpace() {
    if (!this.socket) return;
    this.socket.emit('enterBuildSpace');
  },

  placeBlock(x, y, z, blockType) {
    if (!this.socket) return;
    this.socket.emit('placeBlock', { x, y, z, blockType });
  },

  removeBlock(x, y, z) {
    if (!this.socket) return;
    this.socket.emit('removeBlock', { x, y, z });
  }
};
