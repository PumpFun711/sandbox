const SKIN_COLORS = [
  '#d97757','#e8a87c','#c9a876','#8b6f47',
  '#5a4632','#f0ddb8','#7ec8a0','#7caee8',
  '#e85c5c','#b88ce8','#e8c75c','#ffffff'
];

const UI = {
  selectedSkin: SKIN_COLORS[0],
  walletPublicKey: null,
  playerNickname: 'Player',

  init() {
    document.getElementById('btn-connect-nav').onclick = () => this.openAuth();
    document.getElementById('btn-play-now').onclick    = () => this.openAuth();

    document.getElementById('btn-go-create').onclick       = () => this.showStep('create');
    document.getElementById('btn-back-create').onclick     = () => this.showStep('choose');
    document.getElementById('btn-generate-wallet').onclick = () => this.generateWallet();
    document.getElementById('btn-confirm-seed').onclick    = () => this.connectPhantom();
    document.getElementById('btn-phantom-connect').onclick = () => this.connectPhantom();
    document.getElementById('btn-phantom-enter').onclick   = () => this.enterWorld();

    document.getElementById('seed-confirm-check').onchange = (e) => {
      document.getElementById('btn-confirm-seed').disabled = !e.target.checked;
    };

    document.getElementById('btn-leave').onclick = () => {
      if (confirm('Leave Sandbox?')) Game.leave();
    };

    document.getElementById('btn-enter-build').onclick = () => Game.enterBuildSpace();
    document.getElementById('btn-back-hub').onclick    = () => Game.backToHub();

    this.buildColorPicker('create-skin-colors');
    this.buildColorPicker('phantom-skin-colors');
    this.initBgCanvas();

    Game.init();
  },

  openAuth() {
    document.getElementById('modal-auth').classList.add('open');
    this.showStep('choose');
  },

  closeAuth() {
    document.getElementById('modal-auth').classList.remove('open');
  },

  showStep(step) {
    document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`auth-step-${step}`).classList.add('active');
  },

  generateWallet() {
    const nickname = document.getElementById('create-nickname').value.trim();
    if (!nickname) { showToast('Enter a nickname first'); return; }
    this.playerNickname = nickname;

    const keypair = solanaWeb3.Keypair.generate();
    this.walletPublicKey = keypair.publicKey.toString();
    const privateKeyB58 = this.uint8ArrayToBase58(keypair.secretKey);

    document.getElementById('seed-display').textContent = privateKeyB58;
    document.getElementById('wallet-addr-display').textContent = this.walletPublicKey;
    document.getElementById('seed-confirm-check').checked = false;
    document.getElementById('btn-confirm-seed').disabled = true;

    this.showStep('seed');
  },

  async connectPhantom() {
    const phantom = window.solana;
    if (!phantom || !phantom.isPhantom) {
      showToast('Phantom not found. Install the Phantom wallet extension first.');
      window.open('https://phantom.app', '_blank');
      return;
    }

    try {
      this.showStep('connecting');
      const resp = await phantom.connect();
      this.walletPublicKey = resp.publicKey.toString();
      document.getElementById('connected-addr-display').textContent =
        this.walletPublicKey.slice(0, 6) + '...' + this.walletPublicKey.slice(-4);
      this.showStep('nickname');
    } catch (e) {
      console.error(e);
      showToast('Phantom connection cancelled.');
      this.showStep('choose');
    }
  },

  enterWorld() {
    const nicknameInput = document.getElementById('phantom-nickname');
    const nickname = nicknameInput ? nicknameInput.value.trim() : this.playerNickname;
    this.playerNickname = nickname || 'Builder';

    this.closeAuth();
    Player.nickname  = this.playerNickname;
    Player.skinColor = this.selectedSkin;

    document.getElementById('game-screen').classList.add('active');

    Network.joinHub({
      nickname:      this.playerNickname,
      skinColor:     this.selectedSkin,
      walletAddress: this.walletPublicKey || 'unknown'
    });
  },

  BASE58_ALPHABET: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',

  uint8ArrayToBase58(bytes) {
    const alpha = this.BASE58_ALPHABET;
    let digits = [0];
    for (let i = 0; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = Math.floor(carry / 58);
      }
      while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
    }
    let result = '';
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += '1';
    for (let i = digits.length - 1; i >= 0; i--) result += alpha[digits[i]];
    return result;
  },

  buildColorPicker(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    SKIN_COLORS.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'color-btn' + (i === 0 ? ' active' : '');
      btn.style.background = c;
      btn.onclick = () => {
        el.querySelectorAll('.color-btn').forEach((b, j) => b.classList.toggle('active', j === i));
        this.selectedSkin = c;
      };
      el.appendChild(btn);
    });
  },

  initBgCanvas() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    const blocks = [];

    function buildBlocks() {
      blocks.length = 0;
      for (let i = 0; i < 24; i++) {
        blocks.push({
          x: Math.random() * W, y: Math.random() * H,
          size: 30 + Math.random() * 60,
          speed: 0.1 + Math.random() * 0.3,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.012,
          alpha: 0.06 + Math.random() * 0.14
        });
      }
    }

    function resize() { W = canvas.offsetWidth; H = canvas.offsetHeight; canvas.width = W; canvas.height = H; buildBlocks(); }

    function loop() {
      requestAnimationFrame(loop);
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#10141c'); grad.addColorStop(1, '#0a0d12');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      blocks.forEach(b => {
        b.y -= b.speed; b.rot += b.rotSpeed;
        if (b.y + b.size < 0) { b.y = H + b.size; b.x = Math.random() * W; }
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.globalAlpha = b.alpha;
        ctx.fillStyle = '#d97757';
        ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size);
        ctx.globalAlpha = 1;
        ctx.restore();
      });
    }

    window.addEventListener('resize', resize);
    resize(); loop();
  }
};

window.addEventListener('DOMContentLoaded', () => { UI.init(); });
