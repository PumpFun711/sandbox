const Player = {
  camera: null,
  x: 8, y: 3, z: 8,
  velY: 0,
  onGround: false,
  jumpCooldown: 0,
  rotY: 0,
  rotX: 0,
  isWalking: false,
  isPointerLocked: false,
  nickname: 'Player',
  skinColor: '#d97757',

  SPEED: 0.045,
  SPRINT_SPEED: 0.08,
  JUMP_FORCE: 0.22,
  GRAVITY: -0.018,
  PLAYER_HEIGHT: 1.7,
  EYE_HEIGHT: 1.6,

  keys: {},
  bobTime: 0,
  bobOffset: 0,

  getBlockFn: null,
  worldBounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, minY: -5, maxY: 60 },

  init(camera, nickname, skinColor) {
    this.camera = camera;
    this.nickname = nickname;
    this.skinColor = skinColor;
    this.x = 8 + Math.random() * 4;
    this.z = 8 + Math.random() * 4;
    this.y = 3;
    this.velY = 0;
    this.setupPointerLock();
    this.setupKeyboard();
    this.updateCamera();
  },

  setWorld(getBlockFn, bounds) {
    this.getBlockFn = getBlockFn;
    if (bounds) this.worldBounds = bounds;
  },

  teleportTo(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.velY = 0;
    this.onGround = false;
  },

  setupPointerLock() {
    const canvas = document.getElementById('game-canvas');

    document.getElementById('game-screen').addEventListener('click', () => {
      canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    });

    const onLockChange = () => {
      const locked = !!(document.pointerLockElement === canvas || document.mozPointerLockElement === canvas || document.webkitPointerLockElement === canvas);
      this.isPointerLocked = locked;
      const ctp = document.getElementById('click-to-play');
      if (!ctp) return;
      if (locked) ctp.classList.add('hidden');
      else ctp.classList.remove('hidden');
    };

    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mozpointerlockchange', onLockChange);
    document.addEventListener('webkitpointerlockchange', onLockChange);

    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const sens = 0.0018;
      this.rotY -= e.movementX * sens;
      this.rotX -= e.movementY * sens;
      this.rotX = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.rotX));
    });
  },

  setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (this.onGround && this.jumpCooldown <= 0) {
          this.velY = this.JUMP_FORCE;
          this.onGround = false;
          this.jumpCooldown = 20;
        }
      }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  },

  update() {
    if (this.jumpCooldown > 0) this.jumpCooldown--;
    this.handleMovement();
    this.applyGravity();
    this.updateCamera();
  },

  handleMovement() {
    const speed = this.keys['ShiftLeft'] ? this.SPRINT_SPEED : this.SPEED;
    let dx = 0, dz = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp'])    { dx -= Math.sin(this.rotY); dz -= Math.cos(this.rotY); }
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  { dx += Math.sin(this.rotY); dz += Math.cos(this.rotY); }
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  { dx -= Math.cos(this.rotY); dz += Math.sin(this.rotY); }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { dx += Math.cos(this.rotY); dz -= Math.sin(this.rotY); }

    const moving = dx !== 0 || dz !== 0;
    this.isWalking = moving;

    if (moving) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;

      const b = this.worldBounds;
      const newX = this.x + dx;
      if (!this.collidesAt(newX, this.y, this.z)) this.x = Math.max(b.minX + 0.3, Math.min(b.maxX - 0.3, newX));

      const newZ = this.z + dz;
      if (!this.collidesAt(this.x, this.y, newZ)) this.z = Math.max(b.minZ + 0.3, Math.min(b.maxZ - 0.3, newZ));

      this.bobTime += 0.1;
      this.bobOffset = Math.sin(this.bobTime) * 0.03;
    } else {
      this.bobOffset *= 0.75;
    }
  },

  applyGravity() {
    this.velY += this.GRAVITY;
    if (this.velY < -0.5) this.velY = -0.5;

    const newY = this.y + this.velY;
    const floorY = this.getFloorY();

    if (floorY > -900 && newY <= floorY) {
      this.y = floorY;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.y = newY;
      this.onGround = false;
    }

    if (this.y < this.worldBounds.minY) this.teleportTo(8, 5, 8);
  },

  collidesAt(x, y, z) {
    if (!this.getBlockFn) return false;
    const margin = 0.3;
    for (let bx = Math.floor(x - margin); bx <= Math.floor(x + margin); bx++) {
      for (let bz = Math.floor(z - margin); bz <= Math.floor(z + margin); bz++) {
        for (let by = Math.floor(y); by <= Math.floor(y + this.PLAYER_HEIGHT); by++) {
          if (this.getBlockFn(bx, by, bz) !== null) return true;
        }
      }
    }
    return false;
  },

  getFloorY() {
    if (!this.getBlockFn) return 0;
    const margin = 0.3;
    let floor = -999;
    for (let bx = Math.floor(this.x - margin); bx <= Math.floor(this.x + margin); bx++) {
      for (let bz = Math.floor(this.z - margin); bz <= Math.floor(this.z + margin); bz++) {
        for (let by = Math.floor(this.y); by >= -10; by--) {
          if (this.getBlockFn(bx, by, bz) !== null) { floor = Math.max(floor, by + 1); break; }
        }
      }
    }
    return Math.max(floor, 0);
  },

  updateCamera() {
    this.camera.position.set(this.x, this.y + this.EYE_HEIGHT + this.bobOffset, this.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.rotY;
    this.camera.rotation.x = this.rotX;
  },

  getPosition() {
    return { x: this.x, y: this.y, z: this.z, rotY: this.rotY, isWalking: this.isWalking };
  }
};
