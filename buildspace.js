const BuildSpace = {
  scene: null,
  blockMeshes: new Map(),
  blocks: {},
  groundMesh: null,
  highlightMesh: null,
  texture: null,
  material: null,

  SPACE_SIZE: 60,
  MAX_REACH: 6,

  buildTexture() {
    if (this.texture) return this.texture;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    const base = { r: 196, g: 168, b: 138 };
    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 900; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const shade = (Math.random() - 0.5) * 30;
      const r = Math.min(255, Math.max(0, base.r + shade));
      const g = Math.min(255, Math.max(0, base.g + shade));
      const b = Math.min(255, Math.max(0, base.b + shade));
      ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},0.5)`;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 1.5);
    }

    const edgeGrad = ctx.createRadialGradient(size/2, size/2, size*0.3, size/2, size/2, size*0.72);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(5, 5, size - 10, size - 10);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.generateMipmaps = true;
    this.texture = tex;
    return tex;
  },

  getMaterial() {
    if (this.material) return this.material;
    this.material = new THREE.MeshLambertMaterial({ map: this.buildTexture() });
    return this.material;
  },

  build(scene, savedBlocks) {
    this.scene = scene;
    this.blocks = savedBlocks || {};
    this.blockMeshes.forEach(m => scene.remove(m));
    this.blockMeshes.clear();

    const groundGeo = new THREE.PlaneGeometry(this.SPACE_SIZE, this.SPACE_SIZE);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x232a38 });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(this.SPACE_SIZE / 2, 0, this.SPACE_SIZE / 2);
    scene.add(this.groundMesh);

    Object.keys(this.blocks).forEach(key => {
      const [x, y, z] = key.split(',').map(Number);
      this.addBlockMesh(x, y, z);
    });

    Player.setWorld((x, y, z) => this.getBlock(x, y, z), {
      minX: 0, maxX: this.SPACE_SIZE, minZ: 0, maxZ: this.SPACE_SIZE, minY: -5, maxY: 60
    });
  },

  teardown(scene) {
    if (this.groundMesh) scene.remove(this.groundMesh);
    this.blockMeshes.forEach(m => scene.remove(m));
    this.blockMeshes.clear();
    if (this.highlightMesh) { scene.remove(this.highlightMesh); this.highlightMesh = null; }
  },

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const key = `${x},${y},${z}`;
    return this.blocks.hasOwnProperty(key) ? this.blocks[key] : null;
  },

  addBlockMesh(x, y, z) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geo, this.getMaterial());
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.userData = { bx: x, by: y, bz: z };
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.blockMeshes.set(`${x},${y},${z}`, mesh);
    return mesh;
  },

  onBlockPlaced(x, y, z, blockType) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    this.blocks[key] = blockType;
    if (!this.blockMeshes.has(key)) this.addBlockMesh(Math.floor(x), Math.floor(y), Math.floor(z));
  },

  onBlockRemoved(x, y, z) {
    const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
    delete this.blocks[key];
    const mesh = this.blockMeshes.get(key);
    if (mesh) { this.scene.remove(mesh); this.blockMeshes.delete(key); }
  },

  raycastForBuild(camera) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    raycaster.far = this.MAX_REACH;

    const targets = [...this.blockMeshes.values(), this.groundMesh];
    const hits = raycaster.intersectObjects(targets);
    if (hits.length === 0) return null;

    const hit = hits[0];
    if (hit.object === this.groundMesh) {
      const x = Math.floor(hit.point.x);
      const z = Math.floor(hit.point.z);
      return { placeAt: { x, y: 0, z }, removeAt: null };
    }

    const { bx, by, bz } = hit.object.userData;
    const normal = hit.face.normal;
    const placeAt = { x: bx + Math.round(normal.x), y: by + Math.round(normal.y), z: bz + Math.round(normal.z) };
    return { placeAt, removeAt: { x: bx, y: by, z: bz } };
  },

  highlightCell(x, y, z) {
    if (this.highlightMesh) { this.scene.remove(this.highlightMesh); this.highlightMesh = null; }
    if (x === null) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8dcc4, transparent: true, opacity: 0.22, side: THREE.BackSide });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.03, 1.03, 1.03), mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    this.scene.add(mesh);
    this.highlightMesh = mesh;
  }
};
