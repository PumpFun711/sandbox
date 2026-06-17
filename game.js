const Game = {
  scene: null,
  camera: null,
  renderer: null,
  animFrame: null,
  myId: null,
  mode: 'hub',
  lastMoveUpdate: 0,
  _frameCount: 0,
  _buildBound: false,

  init() {
    this.setupScene();
    Network.connect();
  },

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10141c);
    this.scene.fog = new THREE.Fog(0x10141c, 20, 50);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 80);
    this.scene.add(this.camera);

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = false;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xfff0e0, 0.85);
    sun.position.set(15, 30, 15);
    this.scene.add(sun);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  },

  onHubInit(data) {
    this.myId = data.playerId;
    Hub.myId = this.myId;
    Hub.build(this.scene);
    Player.init(this.camera, Player.nickname, Player.skinColor);
    data.players.forEach(p => Hub.addPlayer(p.id, p));

    document.getElementById('hud-name').textContent = Player.nickname;
    document.getElementById('hud-location').textContent = 'Hub';
    document.getElementById('btn-enter-build').style.display = 'inline-block';
    document.getElementById('btn-back-hub').style.display = 'none';
    document.getElementById('build-toolbar').style.display = 'none';

    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.mode = 'hub';
    this.loop();
    showToast('Welcome to the hub');
  },

  onHubPlayerJoined(data) {
    Hub.addPlayer(data.id, data);
    showToast(data.nickname + ' joined the hub');
  },

  onHubPlayerMoved(data) {
    Hub.updatePlayer(data.id, data);
  },

  onHubPlayerLeft(data) {
    Hub.removePlayer(data.id);
  },

  enterBuildSpace() {
    this.stopMode();
    Network.enterBuildSpace();
  },

  onBuildSpaceInit(data) {
    Hub.teardown(this.scene);
    BuildSpace.build(this.scene, data.blocks);
    Player.teleportTo(BuildSpace.SPACE_SIZE / 2, 3, BuildSpace.SPACE_SIZE / 2);

    document.getElementById('hud-location').textContent = 'Your Build Space';
    document.getElementById('btn-enter-build').style.display = 'none';
    document.getElementById('btn-back-hub').style.display = 'inline-block';
    document.getElementById('build-toolbar').style.display = 'block';

    this.mode = 'build';
    this.bindBuildControls();
    showToast('This is your space. Left click to place, right click to remove.');
  },

  backToHub() {
    this.stopMode();
    BuildSpace.teardown(this.scene);
    Network.joinHub({ nickname: Player.nickname, skinColor: Player.skinColor, walletAddress: UI.walletPublicKey || 'unknown' });
  },

  onBlockPlaced(data) { BuildSpace.onBlockPlaced(data.x, data.y, data.z, data.blockType); },
  onBlockRemoved(data) { BuildSpace.onBlockRemoved(data.x, data.y, data.z); },

  stopMode() {
    this._buildBound = false;
  },

  bindBuildControls() {
    if (this._buildBound) return;
    this._buildBound = true;
    const canvas = document.getElementById('game-canvas');

    canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'build' || !Player.isPointerLocked) return;
      const result = BuildSpace.raycastForBuild(this.camera);
      if (!result) return;

      if (e.button === 0 && result.placeAt) {
        Network.placeBlock(result.placeAt.x, result.placeAt.y, result.placeAt.z, 0);
      } else if (e.button === 2 && result.removeAt) {
        Network.removeBlock(result.removeAt.x, result.removeAt.y, result.removeAt.z);
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  updateBuildHighlight() {
    if (this.mode !== 'build') return;
    const result = BuildSpace.raycastForBuild(this.camera);
    if (result && result.placeAt) {
      BuildSpace.highlightCell(result.placeAt.x, result.placeAt.y, result.placeAt.z);
    } else {
      BuildSpace.highlightCell(null, null, null);
    }
  },

  loop() {
    this.animFrame = requestAnimationFrame(() => this.loop());
    this._frameCount++;

    Player.update();

    if (this.mode === 'hub') {
      Hub.update(this.camera);
      const now = Date.now();
      if (now - this.lastMoveUpdate > 50) {
        this.lastMoveUpdate = now;
        const p = Player.getPosition();
        Network.hubMove(p.x, p.y, p.z, p.rotY, p.isWalking);
      }
    } else if (this.mode === 'build') {
      if (this._frameCount % 2 === 0) this.updateBuildHighlight();
    }

    this.renderer.render(this.scene, this.camera);
  },

  leave() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (Network.socket) Network.socket.disconnect();
    this.renderer.dispose();
    this.scene.clear();
    document.getElementById('game-screen').classList.remove('active');
    Player.isPointerLocked = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
