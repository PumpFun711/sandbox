const Hub = {
  scene: null,
  groundMesh: null,
  players: new Map(),
  myId: null,

  HUB_SIZE: 48,

  build(scene) {
    this.scene = scene;
    this.players.clear();

    const groundGeo = new THREE.PlaneGeometry(this.HUB_SIZE, this.HUB_SIZE);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a3142 });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(this.HUB_SIZE / 2, 0, this.HUB_SIZE / 2);
    scene.add(this.groundMesh);

    this.buildPlatforms(scene);

    Player.setWorld(() => null, { minX: 0, maxX: this.HUB_SIZE, minZ: 0, maxZ: this.HUB_SIZE, minY: -5, maxY: 40 });
  },

  buildPlatforms(scene) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x394257 });
    const positions = [[10, 0.5, 10], [38, 0.5, 14], [22, 0.5, 36]];
    positions.forEach(([x, y, z]) => {
      const geo = new THREE.BoxGeometry(6, 1, 6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      scene.add(mesh);
    });
  },

  teardown(scene) {
    if (this.groundMesh) scene.remove(this.groundMesh);
    this.players.forEach(p => scene.remove(p.mesh));
    this.players.clear();
  },

  buildPlayerMesh(skinColor) {
    const group = new THREE.Group();
    const color = new THREE.Color(skinColor || '#d97757');

    const skinMat  = new THREE.MeshLambertMaterial({ color });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0x3a4a6e });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2a3550 });
    const hairMat  = new THREE.MeshLambertMaterial({ color: 0x3b2314 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.set(0, 1.55, 0);
    group.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.52), hairMat);
    hair.position.set(0, 1.82, 0);
    group.add(hair);

    const eyeWGeo = new THREE.BoxGeometry(0.1, 0.08, 0.02);
    const eyeWL = new THREE.Mesh(eyeWGeo, whiteMat); eyeWL.position.set(-0.12, 1.56, 0.252); group.add(eyeWL);
    const eyeWR = new THREE.Mesh(eyeWGeo, whiteMat); eyeWR.position.set(0.12, 1.56, 0.252); group.add(eyeWR);

    const pupilGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);
    const pupilL = new THREE.Mesh(pupilGeo, blackMat); pupilL.position.set(-0.12, 1.555, 0.262); group.add(pupilL);
    const pupilR = new THREE.Mesh(pupilGeo, blackMat); pupilR.position.set(0.12, 1.555, 0.262); group.add(pupilR);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), shirtMat);
    torso.position.set(0, 1.05, 0);
    group.add(torso);

    const armGeo = new THREE.BoxGeometry(0.16, 0.55, 0.16);
    const armL = new THREE.Mesh(armGeo, skinMat); armL.position.set(-0.34, 1.05, 0); armL.name = 'armL'; group.add(armL);
    const armR = new THREE.Mesh(armGeo, skinMat); armR.position.set(0.34, 1.05, 0); armR.name = 'armR'; group.add(armR);

    const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);
    const legL = new THREE.Mesh(legGeo, pantsMat); legL.position.set(-0.13, 0.5, 0); legL.name = 'legL'; group.add(legL);
    const legR = new THREE.Mesh(legGeo, pantsMat); legR.position.set(0.13, 0.5, 0); legR.name = 'legR'; group.add(legR);

    return group;
  },

  buildNameTag(nickname) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(16,20,28,0.6)';
    ctx.beginPath(); ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8); ctx.fill();
    ctx.fillStyle = '#d97757';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(nickname.slice(0, 14), canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), mat);
    sprite.position.set(0, 2.2, 0);
    sprite.name = 'nameTag';
    return sprite;
  },

  addPlayer(id, data) {
    if (id === this.myId || this.players.has(id)) return;
    const mesh = this.buildPlayerMesh(data.skinColor);
    mesh.position.set(data.x, data.y, data.z);
    mesh.rotation.y = data.rotY || 0;
    mesh.add(this.buildNameTag(data.nickname));
    this.scene.add(mesh);
    this.players.set(id, { mesh, data: { ...data }, walkTick: 0 });
  },

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) { this.scene.remove(p.mesh); this.players.delete(id); }
  },

  updatePlayer(id, data) {
    const p = this.players.get(id);
    if (!p) return;
    p.mesh.position.x += (data.x - p.mesh.position.x) * 0.2;
    p.mesh.position.y += (data.y - p.mesh.position.y) * 0.2;
    p.mesh.position.z += (data.z - p.mesh.position.z) * 0.2;
    p.mesh.rotation.y = data.rotY || 0;

    if (data.isWalking) {
      p.walkTick += 0.1;
      const swing = Math.sin(p.walkTick) * 0.4;
      const legL = p.mesh.getObjectByName('legL'); if (legL) legL.rotation.x = swing;
      const legR = p.mesh.getObjectByName('legR'); if (legR) legR.rotation.x = -swing;
      const armL = p.mesh.getObjectByName('armL'); if (armL) armL.rotation.x = -swing * 0.5;
      const armR = p.mesh.getObjectByName('armR'); if (armR) armR.rotation.x = swing * 0.5;
    } else {
      p.walkTick = 0;
      ['legL', 'legR', 'armL', 'armR'].forEach(n => {
        const o = p.mesh.getObjectByName(n);
        if (o) o.rotation.x *= 0.8;
      });
    }
    p.data = { ...p.data, ...data };
  },

  update(camera) {
    this.players.forEach(p => {
      const tag = p.mesh.getObjectByName('nameTag');
      if (tag && camera) tag.lookAt(camera.position);
    });
  }
};
