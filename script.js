// ==========================================
// SMASH KARTS 3D - ENGINE & GAMEPLAY LOGIC
// ==========================================

const ARENA_HALF = 75;
const MATCH_DURATION = 180; // 3 menit
const KART_COLORS = [
    '#ef4444', '#3b82f6', '#22c55e', '#eab308',
    '#a855f7', '#ec4899', '#06b6d4', '#f97316'
];

const WEAPONS = {
    ROCKET: { id: 'ROCKET', name: 'ROKET', icon: '🚀', ammo: 1 },
    MINIGUN: { id: 'MINIGUN', name: 'SENAPAN MESIN', icon: '🔫', ammo: 18 },
    MINE: { id: 'MINE', name: 'RANJAU TNT', icon: '💣', ammo: 2 },
    SHIELD: { id: 'SHIELD', name: 'PERISAI KEBAL', icon: '🛡️', ammo: 1 },
    CANNON: { id: 'CANNON', name: 'MERIAM GRANAT', icon: '💥', ammo: 2 }
};

const WEAPON_KEYS = Object.keys(WEAPONS);

const BOT_NAMES = [
    'TurboMax', 'NitroZ', 'BlazeKing', 'DriftQueen',
    'ApexRacer', 'VortexX', 'ShadowKart'
];

// Audio Synthesizer (Web Audio API)
class SoundFX {
    constructor() {
        this.enabled = true;
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
    }

    playTone(freq, endFreq, duration, type = 'sawtooth', volume = 0.12) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), this.ctx.currentTime + duration);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    pickup() { this.playTone(520, 980, 0.18, 'sine', 0.15); }
    shootRocket() { this.playTone(320, 90, 0.35, 'sawtooth', 0.16); }
    shootGun() { this.playTone(650, 180, 0.08, 'square', 0.08); }
    explosion() { this.playTone(140, 28, 0.55, 'sawtooth', 0.25); }
    shield() { this.playTone(300, 720, 0.35, 'triangle', 0.14); }
}

const sfx = new SoundFX();

// Global State
let scene, camera, renderer;
let karts = [];
let playerKart = null;
let itemBoxes = [];
let projectiles = [];
let mines = [];
let particles = [];
let obstacles = [];
let ramps = [];

let gameState = 'LOBBY'; // LOBBY, PLAYING, GAMEOVER
let timeRemaining = MATCH_DURATION;
let selectedColor = KART_COLORS[0];
let selectedHat = 'helmet';
let clock = new THREE.Clock();

const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false
};

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
    const canvas = document.getElementById('game-canvas');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x60a5fa);
    scene.fog = new THREE.FogExp2(0x60a5fa, 0.0055);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 350);
    camera.position.set(0, 18, 28);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    setupLights();
    buildArena();
    setupUI();
    setupLobbyPreview();

    window.addEventListener('resize', onResize);
    animate();
}

function setupLights() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3f6212, 0.75);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.05);
    dirLight.position.set(55, 85, 45);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 220;
    const d = 85;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
}

// ==========================================
// ARENA BUILDER (SMASH ISLAND)
// ==========================================
function buildArena() {
    // Rumput Utama
    const grassGeo = new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.9 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    scene.add(grass);

    // Lintasan Aspal Melingkar
    const trackOuter = new THREE.RingGeometry(32, 54, 48);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
    const trackMesh = new THREE.Mesh(trackOuter, trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.y = 0.03;
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Alun-alun Tengah
    const plazaGeo = new THREE.CircleGeometry(20, 32);
    const plazaMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.04;
    plaza.receiveShadow = true;
    scene.add(plaza);

    // Menara Pusat
    const towerGeo = new THREE.CylinderGeometry(4.5, 5.5, 7, 16);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(0, 3.5, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
    obstacles.push({ x: 0, z: 0, r: 5.5 });

    // Dinding Pembatas Arena
    const wallMat1 = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
    const segCount = 15;
    const segLen = (ARENA_HALF * 2) / segCount;

    for (let i = 0; i < segCount; i++) {
        const offset = -ARENA_HALF + segLen * (i + 0.5);
        const mat = i % 2 === 0 ? wallMat1 : wallMat2;

        // Utara & Selatan
        addWall(offset, -ARENA_HALF, segLen, 3.5, 2.5, mat);
        addWall(offset, ARENA_HALF, segLen, 3.5, 2.5, mat);
        // Barat & Timur
        addWall(-ARENA_HALF, offset, 2.5, 3.5, segLen, mat);
        addWall(ARENA_HALF, offset, 2.5, 3.5, segLen, mat);
    }

    // Peti Rintangan
    const crateCoords = [
        [-24, -24], [24, -24], [-24, 24], [24, 24],
        [-45, 0], [45, 0], [0, -45], [0, 45]
    ];
    const crateGeo = new THREE.BoxGeometry(4, 4, 4);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7 });

    crateCoords.forEach(([x, z]) => {
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.set(x, 2, z);
        crate.castShadow = true;
        crate.receiveShadow = true;
        scene.add(crate);
        obstacles.push({ x, z, r: 2.8 });
    });

    // 4 Tanjakan Lompat (Stunt Ramps)
    const rampPositions = [
        { x: 0, z: -26, rotY: 0 },
        { x: 0, z: 26, rotY: Math.PI },
        { x: -26, z: 0, rotY: Math.PI / 2 },
        { x: 26, z: 0, rotY: -Math.PI / 2 }
    ];
    const rampGeo = new THREE.BoxGeometry(6, 1.2, 8);
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });

    rampPositions.forEach(rp => {
        const ramp = new THREE.Mesh(rampGeo, rampMat);
        ramp.position.set(rp.x, 0.4, rp.z);
        ramp.rotation.y = rp.rotY;
        ramp.rotation.x = -0.22;
        ramp.receiveShadow = true;
        scene.add(ramp);
        ramps.push({ x: rp.x, z: rp.z, r: 4.2 });
    });

    // Kotak Misteri Senjata (?)
    const boxSpots = [
        [-14, 0], [14, 0], [0, -14], [0, 14],
        [-38, -38], [38, -38], [-38, 38], [38, 38],
        [-58, 0], [58, 0], [0, -58], [0, 58]
    ];
    boxSpots.forEach(([x, z]) => spawnItemBox(x, z));
}

function addWall(x, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function spawnItemBox(x, z) {
    const geo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.3
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 1.6, z);
    mesh.castShadow = true;
    scene.add(mesh);

    itemBoxes.push({
        mesh,
        x,
        z,
        active: true,
        respawnTimer: 0
    });
}

// ==========================================
// 3D KART BUILDER
// ==========================================
function createKartMesh(colorHex, hatType) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.28,
        metalness: 0.25
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 });

    // Sasis Utama
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 3.6), bodyMat);
    chassis.position.y = 0.75;
    chassis.castShadow = true;
    group.add(chassis);

    // Moncong Depan
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.1), bodyMat);
    nose.position.set(0, 0.68, -2.0);
    nose.castShadow = true;
    group.add(nose);

    // Bumper Depan & Belakang
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.35), darkMat);
    frontBumper.position.set(0, 0.5, -2.55);
    group.add(frontBumper);

    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.4), darkMat);
    rearBumper.position.set(0, 0.55, 1.9);
    group.add(rearBumper);

    // Sayap Belakang
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.65), bodyMat);
    wing.position.set(0, 1.55, 1.65);
    wing.castShadow = true;
    group.add(wing);

    // Knalpot Ganda
    const pipeGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.7, 10);
    const pipeL = new THREE.Mesh(pipeGeo, chromeMat);
    pipeL.rotation.x = Math.PI / 2.4;
    pipeL.position.set(-0.55, 1.05, 1.95);
    group.add(pipeL);

    const pipeR = pipeL.clone();
    pipeR.position.x = 0.55;
    group.add(pipeR);

    // 4 Roda
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.48, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelOffsets = [
        [-1.3, 0.55, -1.25],
        [1.3, 0.55, -1.25],
        [-1.35, 0.6, 1.2],
        [1.35, 0.6, 1.2]
    ];
    wheelOffsets.forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, darkMat);
        wheel.position.set(wx, wy, wz);
        wheel.castShadow = true;
        group.add(wheel);
    });

    // Pengemudi & Topi
    const driverGroup = new THREE.Group();
    driverGroup.position.set(0, 1.35, 0.15);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.4 })
    );
    head.castShadow = true;
    driverGroup.add(head);

    // Visor / Kacamata
    const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.24, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 })
    );
    visor.position.set(0, 0.05, -0.42);
    driverGroup.add(visor);

    // Aksesori Topi
    if (hatType === 'crown') {
        const crown = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.38, 0.35, 8),
            new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
        );
        crown.position.y = 0.58;
        driverGroup.add(crown);
    } else if (hatType === 'pirate') {
        const hat = new THREE.Mesh(
            new THREE.BoxGeometry(1.1, 0.35, 0.7),
            new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        hat.position.y = 0.55;
        driverGroup.add(hat);
    } else if (hatType === 'viking') {
        const helm = new THREE.Mesh(
            new THREE.SphereGeometry(0.54, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
            chromeMat
        );
        helm.position.y = 0.05;
        driverGroup.add(helm);
    } else {
        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
            bodyMat
        );
        cap.position.y = 0.04;
        driverGroup.add(cap);
    }

    group.add(driverGroup);

    // Gelembung Perisai (Shield Bubble)
    const shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 20, 20),
        new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.35,
            emissive: 0x0284c7,
            emissiveIntensity: 0.5
        })
    );
    shieldMesh.position.y = 1.1;
    shieldMesh.visible = false;
    group.add(shieldMesh);

    return { group, shieldMesh };
}

// ==========================================
// LOBBY PREVIEW
// ==========================================
let previewKart = null;

function setupLobbyPreview() {
    updateLobbyKart();
}

function updateLobbyKart() {
    if (previewKart) scene.remove(previewKart.group);
    previewKart = createKartMesh(selectedColor, selectedHat);
    previewKart.group.position.set(0, 7.1, 0);
    scene.add(previewKart.group);
}

// ==========================================
// KART ENTITY & MATCH MANAGEMENT
// ==========================================
class Kart {
    constructor(name, color, hat, isPlayer = false) {
        this.name = name;
        this.color = color;
        this.hat = hat;
        this.isPlayer = isPlayer;

        const built = createKartMesh(color, hat);
        this.mesh = built.group;
        this.shieldMesh = built.shieldMesh;
        scene.add(this.mesh);

        this.hp = 100;
        this.score = 0;
        this.deaths = 0;
        this.speed = 0;
        this.vy = 0;
        this.angle = 0;
        this.weapon = null;
        this.ammo = 0;
        this.shieldTimer = 0;
        this.fireCooldown = 0;
        this.deadTimer = 0;

        this.aiTargetAngle = 0;
        this.aiChangeTimer = 0;

        this.respawn();
    }

    respawn() {
        const spawnRadius = 42;
        const theta = Math.random() * Math.PI * 2;
        this.mesh.position.set(Math.cos(theta) * spawnRadius, 0, Math.sin(theta) * spawnRadius);
        this.angle = theta + Math.PI / 2;
        this.speed = 0;
        this.vy = 0;
        this.hp = 100;
        this.weapon = null;
        this.ammo = 0;
        this.shieldTimer = 2.5; // Kebal sesaat saat respawn
        this.deadTimer = 0;
        this.mesh.visible = true;
    }

    giveWeapon(weaponObj) {
        this.weapon = weaponObj;
        this.ammo = weaponObj.ammo;
        if (weaponObj.id === 'SHIELD') {
            this.shieldTimer = 7.0;
            this.weapon = null;
            this.ammo = 0;
            if (this.isPlayer) sfx.shield();
        } else if (this.isPlayer) {
            sfx.pickup();
        }
        if (this.isPlayer) updateWeaponHUD();
    }

    takeDamage(amount, attacker) {
        if (this.deadTimer > 0 || this.shieldTimer > 0) return;
        this.hp -= amount;
        spawnExplosion(this.mesh.position, 0xfbbf24, 6);

        if (this.hp <= 0) {
            this.hp = 0;
            this.deaths++;
            this.deadTimer = 2.5;
            this.mesh.visible = false;
            spawnExplosion(this.mesh.position, 0xef4444, 22);
            sfx.explosion();

            if (attacker && attacker !== this) {
                attacker.score++;
                addKillFeed(`${attacker.name} menghancurkan ${this.name}!`);
            } else {
                addKillFeed(`${this.name} meledak!`);
            }

            if (this.isPlayer) {
                showBanner('KART HANCUR! RESPAWN...');
            }
        }
        if (this.isPlayer) updateHealthHUD();
    }
}

function startMatch() {
    if (previewKart) {
        scene.remove(previewKart.group);
        previewKart = null;
    }

    // Bersihkan entity lama
    karts.forEach(k => scene.remove(k.mesh));
    projectiles.forEach(p => scene.remove(p.mesh));
    mines.forEach(m => scene.remove(m.mesh));
    karts = [];
    projectiles = [];
    mines = [];

    const playerName = document.getElementById('player-name').value.trim() || 'Pemain 1';
    playerKart = new Kart(playerName, selectedColor, selectedHat, true);
    karts.push(playerKart);

    const hats = ['helmet', 'crown', 'pirate', 'viking'];
    for (let i = 0; i < 7; i++) {
        const botColor = KART_COLORS[(i + 1) % KART_COLORS.length];
        const botHat = hats[i % hats.length];
        karts.push(new Kart(BOT_NAMES[i], botColor, botHat, false));
    }

    timeRemaining = MATCH_DURATION;
    gameState = 'PLAYING';

    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    updateHealthHUD();
    updateWeaponHUD();
    updateLeaderboard();
}

// ==========================================
// WEAPONS & PROJECTILES
// ==========================================
function fireWeapon(kart) {
    if (!kart.weapon || kart.fireCooldown > 0 || kart.deadTimer > 0) return;

    const dirX = -Math.sin(kart.angle);
    const dirZ = -Math.cos(kart.angle);
    const startPos = kart.mesh.position.clone().add(new THREE.Vector3(dirX * 3.0, 1.1, dirZ * 3.0));

    if (kart.weapon.id === 'ROCKET' || kart.weapon.id === 'CANNON') {
        const isCannon = kart.weapon.id === 'CANNON';
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(isCannon ? 0.65 : 0.45, 10, 10),
            new THREE.MeshStandardMaterial({
                color: isCannon ? 0x1e293b : 0xef4444,
                emissive: 0xf97316,
                emissiveIntensity: 0.8
            })
        );
        mesh.position.copy(startPos);
        scene.add(mesh);

        projectiles.push({
            mesh,
            vx: dirX * (isCannon ? 48 : 65),
            vy: isCannon ? 12 : 0,
            vz: dirZ * (isCannon ? 48 : 65),
            gravity: isCannon ? 28 : 0,
            damage: isCannon ? 75 : 65,
            radius: isCannon ? 7.5 : 4.5,
            owner: kart,
            life: 3.0
        });

        kart.fireCooldown = 0.35;
        if (kart.isPlayer) sfx.shootRocket();

    } else if (kart.weapon.id === 'MINIGUN') {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xfacc15 })
        );
        mesh.position.copy(startPos);
        scene.add(mesh);

        const spread = (Math.random() - 0.5) * 0.08;
        const a = kart.angle + spread;
        projectiles.push({
            mesh,
            vx: -Math.sin(a) * 85,
            vy: 0,
            vz: -Math.cos(a) * 85,
            gravity: 0,
            damage: 14,
            radius: 2.2,
            owner: kart,
            life: 1.5
        });

        kart.fireCooldown = 0.11;
        if (kart.isPlayer) sfx.shootGun();

    } else if (kart.weapon.id === 'MINE') {
        const rearPos = kart.mesh.position.clone().add(new THREE.Vector3(-dirX * 2.8, 0.5, -dirZ * 2.8));
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.9, 1.0, 0.6, 12),
            new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b })
        );
        mesh.position.copy(rearPos);
        scene.add(mesh);

        mines.push({
            mesh,
            owner: kart,
            armTimer: 0.6,
            life: 25
        });

        kart.fireCooldown = 0.4;
        if (kart.isPlayer) sfx.shootRocket();
    }

    kart.ammo--;
    if (kart.ammo <= 0) {
        kart.weapon = null;
    }
    if (kart.isPlayer) updateWeaponHUD();
}

function spawnExplosion(pos, colorHex, count = 14) {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(pos);
        m.position.y += 0.8;
        scene.add(m);
        particles.push({
            mesh: m,
            vx: (Math.random() - 0.5) * 24,
            vy: Math.random() * 16 + 4,
            vz: (Math.random() - 0.5) * 24,
            life: 0.55
        });
    }
}

// ==========================================
// GAME LOOP & PHYSICS UPDATE
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameState === 'LOBBY') {
        if (previewKart) {
            previewKart.group.rotation.y += dt * 0.9;
        }
        const t = performance.now() * 0.00025;
        camera.position.set(Math.cos(t) * 24, 14, Math.sin(t) * 24);
        camera.lookAt(0, 7.5, 0);
    } else if (gameState === 'PLAYING') {
        updateMatchTimer(dt);
        updateKarts(dt);
        updateItemBoxes(dt);
        updateProjectiles(dt);
        updateMines(dt);
        updateParticles(dt);
        updateCamera(dt);
    }

    renderer.render(scene, camera);
}

function updateMatchTimer(dt) {
    timeRemaining -= dt;
    if (timeRemaining <= 0) {
        timeRemaining = 0;
        endMatch();
    }
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    document.getElementById('timer-display').textContent =
        `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateKarts(dt) {
    karts.forEach(kart => {
        if (kart.deadTimer > 0) {
            kart.deadTimer -= dt;
            if (kart.deadTimer <= 0) {
                kart.respawn();
                if (kart.isPlayer) {
                    hideBanner();
                    updateHealthHUD();
                    updateWeaponHUD();
                }
            }
            return;
        }

        if (kart.fireCooldown > 0) kart.fireCooldown -= dt;
        if (kart.shieldTimer > 0) {
            kart.shieldTimer -= dt;
            kart.shieldMesh.visible = true;
            kart.shieldMesh.rotation.y += dt * 3;
        } else {
            kart.shieldMesh.visible = false;
        }

        let accel = 0;
        let turn = 0;

        if (kart.isPlayer) {
            if (input.up) accel = 1;
            if (input.down) accel = -0.65;
            if (input.left) turn = 1;
            if (input.right) turn = -1;
            if (input.fire) fireWeapon(kart);
        } else {
            // Logika AI Bot
            kart.aiChangeTimer -= dt;
            if (kart.aiChangeTimer <= 0) {
                kart.aiChangeTimer = 0.8 + Math.random() * 1.2;
                let targetPos = null;

                if (!kart.weapon) {
                    // Cari kotak senjata terdekat
                    let bestDist = Infinity;
                    itemBoxes.forEach(box => {
                        if (box.active) {
                            const d = Math.hypot(box.x - kart.mesh.position.x, box.z - kart.mesh.position.z);
                            if (d < bestDist) {
                                bestDist = d;
                                targetPos = { x: box.x, z: box.z };
                            }
                        }
                    });
                } else {
                    // Kejar lawan terdekat
                    let bestDist = Infinity;
                    karts.forEach(other => {
                        if (other !== kart && other.deadTimer <= 0) {
                            const d = kart.mesh.position.distanceTo(other.mesh.position);
                            if (d < bestDist) {
                                bestDist = d;
                                targetPos = { x: other.mesh.position.x, z: other.mesh.position.z };
                            }
                        }
                    });
                }

                if (targetPos) {
                    const dx = targetPos.x - kart.mesh.position.x;
                    const dz = targetPos.z - kart.mesh.position.z;
                    kart.aiTargetAngle = Math.atan2(-dx, -dz);
                } else {
                    kart.aiTargetAngle += (Math.random() - 0.5) * 2;
                }
            }

            let diff = kart.aiTargetAngle - kart.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            turn = Math.max(-1, Math.min(1, diff * 2.5));
            accel = 0.88;

            // Tembak jika ada musuh di depan
            if (kart.weapon) {
                karts.forEach(other => {
                    if (other !== kart && other.deadTimer <= 0) {
                        const dx = other.mesh.position.x - kart.mesh.position.x;
                        const dz = other.mesh.position.z - kart.mesh.position.z;
                        const dist = Math.hypot(dx, dz);
                        const angleToOther = Math.atan2(-dx, -dz);
                        let aDiff = Math.abs(angleToOther - kart.angle);
                        if (aDiff > Math.PI) aDiff = Math.PI * 2 - aDiff;
                        if (dist < 42 && aDiff < 0.35) {
                            fireWeapon(kart);
                        }
                    }
                });
            }
        }

        // Fisika Akselerasi & Kemudi
        const maxSpeed = 34;
        kart.speed += accel * 48 * dt;
        kart.speed *= Math.pow(0.25, dt); // Gesekan aspal
        kart.speed = Math.max(-16, Math.min(maxSpeed, kart.speed));

        if (Math.abs(kart.speed) > 0.5) {
            const steerFactor = kart.speed >= 0 ? 1 : -1;
            kart.angle += turn * 2.7 * dt * steerFactor;
        }

        kart.mesh.position.x += -Math.sin(kart.angle) * kart.speed * dt;
        kart.mesh.position.z += -Math.cos(kart.angle) * kart.speed * dt;
        kart.mesh.rotation.y = kart.angle;

        // Tanjakan Lompat
        ramps.forEach(r => {
            const d = Math.hypot(kart.mesh.position.x - r.x, kart.mesh.position.z - r.z);
            if (d < r.r && kart.mesh.position.y <= 0.2 && Math.abs(kart.speed) > 15) {
                kart.vy = 11.5;
            }
        });

        // Gravitasi Vertikal
        if (kart.mesh.position.y > 0 || kart.vy > 0) {
            kart.mesh.position.y += kart.vy * dt;
            kart.vy -= 28 * dt;
            if (kart.mesh.position.y <= 0) {
                kart.mesh.position.y = 0;
                kart.vy = 0;
            }
        }

        // Batas Dinding Arena
        const limit = ARENA_HALF - 3.2;
        if (kart.mesh.position.x < -limit) { kart.mesh.position.x = -limit; kart.speed *= 0.5; }
        if (kart.mesh.position.x > limit) { kart.mesh.position.x = limit; kart.speed *= 0.5; }
        if (kart.mesh.position.z < -limit) { kart.mesh.position.z = -limit; kart.speed *= 0.5; }
        if (kart.mesh.position.z > limit) { kart.mesh.position.z = limit; kart.speed *= 0.5; }

        // Tabrakan dengan Rintangan
        obstacles.forEach(obs => {
            const dx = kart.mesh.position.x - obs.x;
            const dz = kart.mesh.position.z - obs.z;
            const dist = Math.hypot(dx, dz);
            const minDist = obs.r + 1.8;
            if (dist < minDist && dist > 0.001) {
                const nx = dx / dist;
                const nz = dz / dist;
                kart.mesh.position.x = obs.x + nx * minDist;
                kart.mesh.position.z = obs.z + nz * minDist;
                kart.speed *= 0.6;
            }
        });

        // Tabrakan Antar Gokart
        karts.forEach(other => {
            if (other === kart || other.deadTimer > 0) return;
            const dx = kart.mesh.position.x - other.mesh.position.x;
            const dz = kart.mesh.position.z - other.mesh.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 3.2 && dist > 0.001) {
                const nx = dx / dist;
                const nz = dz / dist;
                const push = (3.2 - dist) * 0.5;
                kart.mesh.position.x += nx * push;
                kart.mesh.position.z += nz * push;
                other.mesh.position.x -= nx * push;
                other.mesh.position.z -= nz * push;
            }
        });
    });

    updateLeaderboard();
}

function updateItemBoxes(dt) {
    itemBoxes.forEach(box => {
        if (!box.active) {
            box.respawnTimer -= dt;
            if (box.respawnTimer <= 0) {
                box.active = true;
                box.mesh.visible = true;
            }
            return;
        }

        box.mesh.rotation.y += dt * 2.2;
        box.mesh.position.y = 1.6 + Math.sin(performance.now() * 0.005) * 0.25;

        karts.forEach(kart => {
            if (kart.deadTimer > 0 || !box.active) return;
            const dist = Math.hypot(kart.mesh.position.x - box.x, kart.mesh.position.z - box.z);
            if (dist < 2.8) {
                box.active = false;
                box.mesh.visible = false;
                box.respawnTimer = 6.0;
                const randomKey = WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)];
                kart.giveWeapon(WEAPONS[randomKey]);
            }
        });
    });
}

function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt;
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;

        let hit = p.life <= 0 || p.mesh.position.y <= 0 ||
            Math.abs(p.mesh.position.x) > ARENA_HALF ||
            Math.abs(p.mesh.position.z) > ARENA_HALF;

        if (!hit) {
            for (const kart of karts) {
                if (kart === p.owner || kart.deadTimer > 0) continue;
                if (p.mesh.position.distanceTo(kart.mesh.position) < 2.4) {
                    hit = true;
                    break;
                }
            }
        }

        if (hit) {
            spawnExplosion(p.mesh.position, 0xf97316, 10);
            karts.forEach(kart => {
                if (kart !== p.owner && kart.deadTimer <= 0) {
                    if (p.mesh.position.distanceTo(kart.mesh.position) <= p.radius) {
                        kart.takeDamage(p.damage, p.owner);
                    }
                }
            });
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
        }
    }
}

function updateMines(dt) {
    for (let i = mines.length - 1; i >= 0; i--) {
        const m = mines[i];
        m.life -= dt;
        if (m.armTimer > 0) m.armTimer -= dt;

        let triggered = m.life <= 0;
        if (!triggered && m.armTimer <= 0) {
            for (const kart of karts) {
                if (kart === m.owner || kart.deadTimer > 0) continue;
                if (m.mesh.position.distanceTo(kart.mesh.position) < 2.8) {
                    triggered = true;
                    break;
                }
            }
        }

        if (triggered) {
            spawnExplosion(m.mesh.position, 0xef4444, 18);
            sfx.explosion();
            karts.forEach(kart => {
                if (kart.deadTimer <= 0 && m.mesh.position.distanceTo(kart.mesh.position) <= 6.5) {
                    kart.takeDamage(80, m.owner);
                }
            });
            scene.remove(m.mesh);
            mines.splice(i, 1);
        }
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life -= dt;
        pt.vy -= 30 * dt;
        pt.mesh.position.x += pt.vx * dt;
        pt.mesh.position.y += pt.vy * dt;
        pt.mesh.position.z += pt.vz * dt;
        pt.mesh.scale.setScalar(Math.max(0.01, pt.life * 1.8));
        if (pt.life <= 0) {
            scene.remove(pt.mesh);
            particles.splice(i, 1);
        }
    }
}

function updateCamera(dt) {
    if (!playerKart) return;
    const targetPos = playerKart.mesh.position;
    const camDist = 14.5;
    const camHeight = 7.2;

    const desiredX = targetPos.x + Math.sin(playerKart.angle) * camDist;
    const desiredZ = targetPos.z + Math.cos(playerKart.angle) * camDist;
    const desiredY = targetPos.y + camHeight;

    camera.position.lerp(new THREE.Vector3(desiredX, desiredY, desiredZ), 1 - Math.pow(0.001, dt));
    camera.lookAt(
        targetPos.x - Math.sin(playerKart.angle) * 6,
        targetPos.y + 1.8,
        targetPos.z - Math.cos(playerKart.angle) * 6
    );
}

// ==========================================
// UI & CONTROLS
// ==========================================
function setupUI() {
    const picker = document.getElementById('color-picker');
    KART_COLORS.forEach((col, idx) => {
        const btn = document.createElement('div');
        btn.className = 'color-swatch' + (idx === 0 ? ' active' : '');
        btn.style.backgroundColor = col;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = col;
            updateLobbyKart();
        });
        picker.appendChild(btn);
    });

    document.querySelectorAll('.hat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.hat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedHat = btn.dataset.hat;
            updateLobbyKart();
        });
    });

    document.getElementById('play-btn').addEventListener('click', startMatch);
    document.getElementById('rematch-btn').addEventListener('click', startMatch);

    document.getElementById('sound-btn').addEventListener('click', (e) => {
        sfx.enabled = !sfx.enabled;
        e.target.textContent = sfx.enabled ? '🔊' : '🔇';
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = true;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = true;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
        if (e.code === 'Space') input.fire = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') input.up = false;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') input.down = false;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
        if (e.code === 'Space') input.fire = false;
    });

    // Touch Controls
    bindTouch('btn-left', 'left');
    bindTouch('btn-right', 'right');
    bindTouch('btn-gas', 'up');
    bindTouch('btn-brake', 'down');
    bindTouch('btn-fire', 'fire');
}

function bindTouch(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); input[key] = true; });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); input[key] = false; });
    el.addEventListener('pointerleave', () => { input[key] = false; });
    el.addEventListener('pointercancel', () => { input[key] = false; });
}

function updateHealthHUD() {
    if (!playerKart) return;
    const pct = Math.max(0, playerKart.hp);
    const fill = document.getElementById('health-fill');
    fill.style.width = `${pct}%`;
    fill.style.background = pct > 50 ? 'linear-gradient(90deg, #22c55e, #4ade80)' :
        pct > 25 ? '#eab308' : '#ef4444';
    document.getElementById('health-text').textContent = `${pct} HP`;
    document.getElementById('score-display').textContent = playerKart.score;
    document.getElementById('deaths-display').textContent = playerKart.deaths;
}

function updateWeaponHUD() {
    if (!playerKart) return;
    const iconEl = document.getElementById('weapon-icon');
    const nameEl = document.getElementById('weapon-name');
    const ammoEl = document.getElementById('weapon-ammo');

    if (playerKart.weapon) {
        iconEl.textContent = playerKart.weapon.icon;
        nameEl.textContent = playerKart.weapon.name;
        ammoEl.textContent = `x${playerKart.ammo}`;
    } else if (playerKart.shieldTimer > 0) {
        iconEl.textContent = '🛡️';
        nameEl.textContent = 'PERISAI AKTIF';
        ammoEl.textContent = `${playerKart.shieldTimer.toFixed(1)}d`;
    } else {
        iconEl.textContent = '?';
        nameEl.textContent = 'KOSONG';
        ammoEl.textContent = '';
    }
}

function updateLeaderboard() {
    const sorted = [...karts].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    sorted.slice(0, 5).forEach((k, idx) => {
        const li = document.createElement('li');
        if (k.isPlayer) li.className = 'is-player';
        li.innerHTML = `<span>#${idx + 1} ${k.name}</span><span>${k.score}</span>`;
        list.appendChild(li);
    });
}

function addKillFeed(text) {
    const feed = document.getElementById('kill-feed');
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.textContent = text;
    feed.prepend(item);
    setTimeout(() => item.remove(), 3500);
}

function showBanner(msg) {
    const b = document.getElementById('banner-msg');
    b.textContent = msg;
    b.classList.remove('hidden');
}

function hideBanner() {
    document.getElementById('banner-msg').classList.add('hidden');
}

function endMatch() {
    gameState = 'GAMEOVER';
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('gameover-screen').classList.remove('hidden');

    const sorted = [...karts].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    document.getElementById('winner-text').textContent = `Pemenang: ${sorted[0].name} (${sorted[0].score} Poin)`;

    const finalList = document.getElementById('final-leaderboard');
    finalList.innerHTML = '';
    sorted.forEach((k, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${idx + 1} ${k.name}</span><span>${k.score} Kill / ${k.deaths} Mati</span>`;
        finalList.appendChild(li);
    });
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('DOMContentLoaded', init);
