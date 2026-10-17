import * as THREE from 'three';

const lanePositions = [-3, 0, 3];
const roadSegmentLength = 18;
const roadSegmentCount = 12;
const HIGH_SCORE_KEY = 'pesatRunnerHighScore';

const state = {
  gameStarted: false,
  gameOver: false,
  score: 0,
  coins: 0,
  speed: 1.0,
  maxSpeed: 3.6,
  scoreTimer: 0,
  spawnTimer: 0,
  coinTimer: 0,
  targetLane: 1,
  laneX: 0,
  jumpVelocity: 0,
  jumpHeight: 0,
  basePlayerY: 0.7,
  lastSpawnAt: 0,
  lastCoinSpawnAt: 0,
  elapsed: 0,
  audioReady: false,
};

const world = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  roadSegments: [],
  envSegments: [],
  obstacles: [],
  coins: [],
  activeText: null,
};

let playerRoot = null;
let leftArm = null;
let rightArm = null;
let leftLeg = null;
let rightLeg = null;
let audioContext = null;

const ui = {
  scoreValue: null,
  coinValue: null,
  speedValue: null,
  menuHighScore: null,
  finalScore: null,
  finalCoins: null,
  finalHighScore: null,
  hud: null,
  menuOverlay: null,
  gameOverOverlay: null,
  howOverlay: null,
  playButton: null,
  playAgainButton: null,
  mainMenuButton: null,
  closeHowButton: null,
  howButton: null,
};

function formatScore(value) {
  return String(Math.floor(value)).padStart(4, '0');
}

function formatCoins(value) {
  return String(Math.floor(value)).padStart(2, '0');
}

function setHighScore(value) {
  localStorage.setItem(HIGH_SCORE_KEY, String(value));
}

function getHighScore() {
  const value = Number(localStorage.getItem(HIGH_SCORE_KEY));
  return Number.isFinite(value) ? value : 0;
}

function updateHud() {
  ui.scoreValue.textContent = formatScore(state.score);
  ui.coinValue.textContent = formatCoins(state.coins);
  ui.speedValue.textContent = `${state.speed.toFixed(1)}x`;
  ui.menuHighScore.textContent = formatScore(getHighScore());
  ui.finalHighScore.textContent = formatScore(getHighScore());
}

function showFloatingText(message, x, y) {
  let textEl = world.activeText;
  if (!textEl) {
    textEl = document.createElement('div');
    textEl.id = 'floatingScore';
    document.getElementById('gameContainer').appendChild(textEl);
    world.activeText = textEl;
  }

  textEl.textContent = message;
  textEl.style.left = `${x}px`;
  textEl.style.top = `${y}px`;
  textEl.style.opacity = '1';
  textEl.style.transform = 'translate(-50%, -50%) scale(1)';
  textEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

  requestAnimationFrame(() => {
    textEl.style.opacity = '0';
    textEl.style.transform = 'translate(-50%, -50%) scale(1.2)';
  });

  window.setTimeout(() => {
    if (textEl) {
      textEl.style.opacity = '0';
    }
  }, 500);
}

function initAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  state.audioReady = true;
}

function playTone(frequency, duration, type = 'sine', volume = 0.04, slideTo = null) {
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, audioContext.currentTime + duration);
  }

  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, audioContext.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playJumpSound() {
  playTone(330, 0.12, 'square', 0.04, 450);
}

function playCoinSound() {
  playTone(880, 0.1, 'triangle', 0.06, 1200);
}

function playGameOverSound() {
  playTone(180, 0.2, 'sawtooth', 0.06, 80);
  window.setTimeout(() => playTone(120, 0.25, 'sawtooth', 0.05, 60), 120);
}

function createWorld() {
  world.scene = new THREE.Scene();
  world.scene.background = new THREE.Color(0x9ed1ff);
  world.scene.fog = new THREE.Fog(0x9ed1ff, 30, 170);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6d8b8d, 1.15);
  world.scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(10, 24, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 1024;
  dir.shadow.mapSize.height = 1024;
  dir.shadow.camera.left = -30;
  dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30;
  dir.shadow.camera.bottom = -30;
  world.scene.add(dir);

  world.clock = new THREE.Clock();
  world.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  world.camera.position.set(0, 6.8, 16);
  world.camera.lookAt(0, 2, -90);

  world.renderer = new THREE.WebGLRenderer({ antialias: true });
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  world.renderer.setSize(window.innerWidth, window.innerHeight);
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('gameContainer').appendChild(world.renderer.domElement);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(200, 8, 200),
    new THREE.MeshStandardMaterial({ color: 0x7cc37d, roughness: 1 })
  );
  ground.position.y = -4.2;
  ground.receiveShadow = true;
  world.scene.add(ground);

  createRoad();
  createEnvironment();
}

function createRoad() {
  for (let index = 0; index < roadSegmentCount; index += 1) {
    const segment = new THREE.Group();
    segment.position.z = -index * roadSegmentLength;

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.95, metalness: 0.1 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, roadSegmentLength), roadMat);
    road.position.y = -0.2;
    road.receiveShadow = true;
    segment.add(road);

    const curbMat = new THREE.MeshStandardMaterial({ color: 0x4e4e4e, roughness: 0.9 });
    const leftCurb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, roadSegmentLength), curbMat);
    const rightCurb = leftCurb.clone();
    leftCurb.position.set(-6.3, 0.05, 0);
    rightCurb.position.set(6.3, 0.05, 0);
    segment.add(leftCurb, rightCurb);

    const laneMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x111111 });
    const laneMarkerGeometry = new THREE.BoxGeometry(0.18, 0.06, 3.8);
    for (let line = -3; line <= 3; line += 2) {
      const marker = new THREE.Mesh(laneMarkerGeometry, laneMat);
      marker.position.set(line, 0.16, 0);
      segment.add(marker);
    }

    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x3e3e3e });
    const leftShoulder = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.32, roadSegmentLength), shoulderMat);
    const rightShoulder = leftShoulder.clone();
    leftShoulder.position.set(-7.7, 0.02, 0);
    rightShoulder.position.set(7.7, 0.02, 0);
    segment.add(leftShoulder, rightShoulder);

    world.scene.add(segment);
    world.roadSegments.push(segment);
  }
}

function createEnvironment() {
  for (let index = 0; index < roadSegmentCount; index += 1) {
    const segment = new THREE.Group();
    segment.position.z = -index * roadSegmentLength;

    const buildingColors = [0xffc857, 0x5ec1ff, 0xff7e6b, 0xa5d6a7, 0x8bb6ff, 0xffd166];

    for (let side = -1; side <= 1; side += 2) {
      const buildingCount = 3;
      for (let i = 0; i < buildingCount; i += 1) {
        const width = 2.5 + Math.random() * 1.5;
        const height = 4 + Math.random() * 12;
        const depth = 2.8 + Math.random() * 2.2;
        const color = buildingColors[Math.floor(Math.random() * buildingColors.length)];
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          new THREE.MeshStandardMaterial({ color, emissive: 0x1d1d1d, roughness: 0.9 })
        );
        building.position.set(side * (12.5 + width * 0.7), height / 2 - 2.5, -3 + i * 4.5 + Math.random() * 0.6);
        building.castShadow = true;
        building.receiveShadow = true;
        segment.add(building);
      }
    }

    const treeMat = new THREE.MeshStandardMaterial({ color: 0x3b8f52, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 1 });
    for (let j = 0; j < 4; j += 1) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, 1.5, 6), trunkMat);
      trunk.position.y = 0.7;
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 7), treeMat);
      foliage.position.y = 2.2;
      tree.add(trunk, foliage);
      tree.position.set(-10 + Math.random() * 20, 0, -7 + j * 4.3);
      segment.add(tree);
    }

    const lampMat = new THREE.MeshStandardMaterial({ color: 0xf6e2a1, emissive: 0x9a7b1d, emissiveIntensity: 0.7 });
    for (let lampIndex = 0; lampIndex < 2; lampIndex += 1) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.3, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), lampMat);
      pole.position.set((lampIndex === 0 ? -9.2 : 9.2), 1.6, -3.5 + lampIndex * 9.5);
      light.position.set((lampIndex === 0 ? -9.2 : 9.2), 3.6, -3.5 + lampIndex * 9.5);
      segment.add(pole, light);
    }

    world.scene.add(segment);
    world.envSegments.push(segment);
  }
}

function createPlayer() {
  const player = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1d1a1, roughness: 0.9 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x800020, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.85 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), skinMat);
  head.position.y = 2.75;
  head.castShadow = true;

  const hair = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.15), darkMat);
  hair.position.set(0, 3.25, 0.02);
  hair.castShadow = true;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.8, 0.9), shirtMat);
  torso.position.y = 1.55;
  torso.castShadow = true;

  leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.5, 0.38), shirtMat);
  leftArm.position.set(-1.05, 1.7, 0);
  leftArm.castShadow = true;

  rightArm = leftArm.clone();
  rightArm.position.x = 1.05;

  leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.7, 0.5), pantsMat);
  leftLeg.position.set(-0.42, 0.1, 0);
  leftLeg.castShadow = true;

  rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.42;

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.3, 1.0), shoeMat);
  leftShoe.position.set(-0.42, -0.8, 0.2);
  leftShoe.castShadow = true;

  const rightShoe = leftShoe.clone();
  rightShoe.position.x = 0.42;

  player.add(head, hair, torso, leftArm, rightArm, leftLeg, rightLeg, leftShoe, rightShoe);
  player.position.set(0, state.basePlayerY, 0);
  player.rotation.y = Math.PI;
  player.castShadow = true;

  world.scene.add(player);
  playerRoot = player;
}

function createObstacle() {
  const obstacle = new THREE.Group();
  const laneChoice = Math.floor(Math.random() * 3);
  const typeRoll = Math.random();
  let kind = 'cone';

  if (typeRoll > 0.66) {
    kind = 'barrier';
  } else if (typeRoll > 0.33) {
    kind = 'crate';
  }

  obstacle.position.set(lanePositions[laneChoice], 0, -90);

  if (kind === 'cone') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0xff7a00, roughness: 0.9 }));
    cone.position.y = 0.8;
    cone.castShadow = true;
    obstacle.add(cone);
  } else if (kind === 'barrier') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.8), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.85 }));
    base.position.y = 0.8;
    base.castShadow = true;
    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const stripe2 = stripe1.clone();
    stripe1.position.set(0, 0.18, 0.41);
    stripe2.position.set(0, -0.12, 0.41);
    base.add(stripe1, stripe2);
    obstacle.add(base);
  } else {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.1, 2.2), new THREE.MeshStandardMaterial({ color: 0x8c5a2b, roughness: 0.95 }));
    crate.position.y = 1.08;
    crate.castShadow = true;
    obstacle.add(crate);
  }

  world.scene.add(obstacle);
  return {
    mesh: obstacle,
    lane: laneChoice,
    type: kind,
    passed: false,
  };
}

function createCoinLine() {
  const laneChoice = Math.floor(Math.random() * 3);
  const count = 2 + Math.floor(Math.random() * 3);
  const coins = [];

  for (let index = 0; index < count; index += 1) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16),
      new THREE.MeshStandardMaterial({
        color: 0xf5c542,
        emissive: 0xffd166,
        emissiveIntensity: 0.7,
        metalness: 0.8,
        roughness: 0.25,
      })
    );
    coin.rotation.z = Math.PI / 2;
    coin.position.set(lanePositions[laneChoice], 1.3 + index * 0.55, -96 - index * 2.4);
    coin.castShadow = true;
    world.scene.add(coin);
    coins.push({ mesh: coin, lane: laneChoice, collected: false });
  }

  return coins;
}

function spawnObjects() {
  state.spawnTimer += 1 / 60;
  state.coinTimer += 1 / 60;

  if (state.spawnTimer >= Math.max(0.9, 1.55 - state.speed * 0.25)) {
    state.spawnTimer = 0;
    const obstacle = createObstacle();
    world.obstacles.push(obstacle);
  }

  if (state.coinTimer >= Math.max(1.2, 1.8 - state.speed * 0.22)) {
    state.coinTimer = 0;
    const coinLine = createCoinLine();
    world.coins.push(...coinLine);
  }
}

function handleInput() {
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'a'].includes(key)) {
      moveLane(-1);
    } else if (['arrowright', 'd'].includes(key)) {
      moveLane(1);
    } else if (['arrowup', 'w', ' '].includes(key) || event.code === 'Space') {
      jump();
    }
    initAudio();
  });

  const touchButtons = document.querySelectorAll('[data-action]');
  touchButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'left') {
        moveLane(-1);
      } else if (action === 'right') {
        moveLane(1);
      } else if (action === 'jump') {
        jump();
      }
      initAudio();
    });
  });

  window.addEventListener('resize', () => {
    if (!world.camera || !world.renderer) {
      return;
    }
    world.camera.aspect = window.innerWidth / window.innerHeight;
    world.camera.updateProjectionMatrix();
    world.renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function moveLane(direction) {
  if (!state.gameStarted || state.gameOver) {
    return;
  }

  state.targetLane = Math.min(2, Math.max(0, state.targetLane + direction));
}

function jump() {
  if (!state.gameStarted || state.gameOver) {
    return;
  }

  if (state.jumpHeight <= 0.05) {
    state.jumpVelocity = 8.5;
    playJumpSound();
  }
}

function updatePlayer(dt) {
  if (!playerRoot) {
    return;
  }

  const targetX = lanePositions[state.targetLane];
  state.laneX = THREE.MathUtils.lerp(state.laneX, targetX, 0.18 + dt * 2);
  playerRoot.position.x = state.laneX;

  state.jumpVelocity -= 18 * dt;
  state.jumpHeight += state.jumpVelocity * dt;

  if (state.jumpHeight <= 0) {
    state.jumpHeight = 0;
    state.jumpVelocity = 0;
  }

  playerRoot.position.y = state.basePlayerY + state.jumpHeight;

  const swing = state.elapsed * 11 * state.speed;
  const armSwing = Math.sin(swing) * 1.1;
  const legSwing = Math.sin(swing + Math.PI) * 1.1;

  leftArm.rotation.x = armSwing;
  rightArm.rotation.x = -armSwing;
  leftLeg.rotation.x = legSwing;
  rightLeg.rotation.x = -legSwing;

  playerRoot.rotation.z = THREE.MathUtils.lerp(playerRoot.rotation.z, (state.laneX - targetX) * 0.05, 0.16);
  playerRoot.rotation.x = THREE.MathUtils.lerp(playerRoot.rotation.x, -0.08 * Math.abs(state.laneX) / 3, 0.1);
}

function updateObstacles(dt) {
  const moveSpeed = 22 * state.speed * dt;

  for (let index = world.obstacles.length - 1; index >= 0; index -= 1) {
    const obstacle = world.obstacles[index];
    obstacle.mesh.position.z += moveSpeed;

    if (obstacle.mesh.position.z > 10) {
      world.scene.remove(obstacle.mesh);
      world.obstacles.splice(index, 1);
    }
  }

  for (let index = world.coins.length - 1; index >= 0; index -= 1) {
    const coin = world.coins[index];
    coin.mesh.position.z += moveSpeed;
    coin.mesh.rotation.y += 0.2 + state.speed * 0.1;

    if (coin.mesh.position.z > 10) {
      world.scene.remove(coin.mesh);
      world.coins.splice(index, 1);
    }
  }
}

function updateWorld(dt) {
  const moveSpeed = 18 * state.speed * dt;

  world.roadSegments.forEach((segment) => {
    segment.position.z += moveSpeed;
    if (segment.position.z > 18) {
      segment.position.z -= roadSegmentCount * roadSegmentLength;
    }
  });

  world.envSegments.forEach((segment) => {
    segment.position.z += moveSpeed;
    if (segment.position.z > 18) {
      segment.position.z -= roadSegmentCount * roadSegmentLength;
    }
  });

  world.camera.position.z = 16;
  world.camera.position.x = playerRoot ? playerRoot.position.x * 0.2 : 0;
  world.camera.lookAt(playerRoot ? playerRoot.position.x * 0.15 : 0, 2, -70);
}

function checkCollisions() {
  if (!playerRoot) {
    return;
  }

  const playerZ = 0;
  const playerX = playerRoot.position.x;
  const playerY = playerRoot.position.y;

  for (const obstacle of world.obstacles) {
    const dx = Math.abs(obstacle.mesh.position.x - playerX);
    const dz = Math.abs(obstacle.mesh.position.z - playerZ);

    if (dx < 1.1 && dz < 1.8) {
      if (obstacle.type === 'crate') {
        endGame();
        return;
      }

      const safeHeight = obstacle.type === 'cone' ? 1.4 : 1.9;
      if (playerY < safeHeight) {
        endGame();
        return;
      }
    }
  }

  for (let index = world.coins.length - 1; index >= 0; index -= 1) {
    const coin = world.coins[index];
    const dx = Math.abs(coin.mesh.position.x - playerX);
    const dy = Math.abs(coin.mesh.position.y - (playerY + 1.3));
    const dz = Math.abs(coin.mesh.position.z - playerZ);

    if (dx < 1.1 && dy < 1.3 && dz < 1.6) {
      world.scene.remove(coin.mesh);
      world.coins.splice(index, 1);
      state.coins += 1;
      state.score += 10;
      showFloatingText('+10', window.innerWidth * 0.5, window.innerHeight * 0.38);
      playCoinSound();
      updateHud();
    }
  }
}

function updateScore(dt) {
  state.score += dt * 12 * state.speed;
  state.elapsed += dt;
  state.speed = Math.min(state.maxSpeed, 1 + state.elapsed * 0.06);

  if (state.score > getHighScore()) {
    setHighScore(state.score);
  }

  updateHud();
}

function startGame() {
  if (!state.gameStarted || state.gameOver) {
    resetGame();
  }

  state.gameStarted = true;
  state.gameOver = false;
  ui.menuOverlay.classList.add('hidden');
  ui.howOverlay.classList.add('hidden');
  ui.gameOverOverlay.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  initAudio();
}

function endGame() {
  if (state.gameOver) {
    return;
  }

  state.gameOver = true;
  state.gameStarted = false;
  playGameOverSound();

  const highScore = getHighScore();
  if (state.score > highScore) {
    setHighScore(state.score);
  }

  ui.finalScore.textContent = formatScore(state.score);
  ui.finalCoins.textContent = formatCoins(state.coins);
  ui.finalHighScore.textContent = formatScore(getHighScore());
  ui.gameOverOverlay.classList.remove('hidden');
  ui.hud.classList.add('hidden');
}

function resetGame() {
  state.score = 0;
  state.coins = 0;
  state.speed = 1.0;
  state.elapsed = 0;
  state.targetLane = 1;
  state.laneX = 0;
  state.jumpVelocity = 0;
  state.jumpHeight = 0;
  state.spawnTimer = 0;
  state.coinTimer = 0;
  state.gameStarted = true;
  state.gameOver = false;

  for (const obstacle of world.obstacles) {
    world.scene.remove(obstacle.mesh);
  }
  world.obstacles = [];

  for (const coin of world.coins) {
    world.scene.remove(coin.mesh);
  }
  world.coins = [];

  if (playerRoot) {
    playerRoot.position.set(0, state.basePlayerY, 0);
    playerRoot.rotation.set(0, Math.PI, 0);
    playerRoot.rotation.z = 0;
    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
  }

  world.roadSegments.forEach((segment, index) => {
    segment.position.z = -index * roadSegmentLength;
  });

  world.envSegments.forEach((segment, index) => {
    segment.position.z = -index * roadSegmentLength;
  });

  updateHud();
}

function goToMainMenu() {
  state.gameStarted = false;
  state.gameOver = false;
  state.score = 0;
  state.coins = 0;
  state.speed = 1;
  state.elapsed = 0;
  state.targetLane = 1;
  state.laneX = 0;
  state.jumpVelocity = 0;
  state.jumpHeight = 0;
  state.spawnTimer = 0;
  state.coinTimer = 0;

  for (const obstacle of world.obstacles) {
    world.scene.remove(obstacle.mesh);
  }
  world.obstacles = [];

  for (const coin of world.coins) {
    world.scene.remove(coin.mesh);
  }
  world.coins = [];

  if (playerRoot) {
    playerRoot.position.set(0, state.basePlayerY, 0);
    playerRoot.rotation.set(0, Math.PI, 0);
    playerRoot.rotation.z = 0;
    if (leftArm) leftArm.rotation.x = 0;
    if (rightArm) rightArm.rotation.x = 0;
    if (leftLeg) leftLeg.rotation.x = 0;
    if (rightLeg) rightLeg.rotation.x = 0;
  }

  world.roadSegments.forEach((segment, index) => {
    segment.position.z = -index * roadSegmentLength;
  });

  world.envSegments.forEach((segment, index) => {
    segment.position.z = -index * roadSegmentLength;
  });

  ui.menuOverlay.classList.remove('hidden');
  ui.gameOverOverlay.classList.add('hidden');
  ui.howOverlay.classList.add('hidden');
  ui.hud.classList.add('hidden');
  updateHud();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(world.clock.getDelta(), 0.05);

  if (state.gameStarted && !state.gameOver) {
    updatePlayer(delta);
    updateObstacles(delta);
    updateWorld(delta);
    spawnObjects();
    checkCollisions();
    updateScore(delta);
  }

  world.renderer.render(world.scene, world.camera);
}

function bindUi() {
  ui.scoreValue = document.getElementById('scoreValue');
  ui.coinValue = document.getElementById('coinValue');
  ui.speedValue = document.getElementById('speedValue');
  ui.menuHighScore = document.getElementById('menuHighScore');
  ui.finalScore = document.getElementById('finalScore');
  ui.finalCoins = document.getElementById('finalCoins');
  ui.finalHighScore = document.getElementById('finalHighScore');
  ui.hud = document.getElementById('hud');
  ui.menuOverlay = document.getElementById('menuOverlay');
  ui.gameOverOverlay = document.getElementById('gameOverOverlay');
  ui.howOverlay = document.getElementById('howOverlay');
  ui.playButton = document.getElementById('playButton');
  ui.playAgainButton = document.getElementById('playAgainButton');
  ui.mainMenuButton = document.getElementById('mainMenuButton');
  ui.closeHowButton = document.getElementById('closeHowButton');
  ui.howButton = document.getElementById('howButton');

  ui.playButton.addEventListener('click', () => {
    startGame();
  });

  ui.playAgainButton.addEventListener('click', () => {
    startGame();
  });

  ui.mainMenuButton.addEventListener('click', () => {
    goToMainMenu();
  });

  ui.howButton.addEventListener('click', () => {
    ui.menuOverlay.classList.add('hidden');
    ui.howOverlay.classList.remove('hidden');
  });

  ui.closeHowButton.addEventListener('click', () => {
    ui.howOverlay.classList.add('hidden');
    ui.menuOverlay.classList.remove('hidden');
  });
}

function initScene() {
  bindUi();
  createWorld();
  createPlayer();
  handleInput();
  updateHud();
  animate();
}

window.addEventListener('DOMContentLoaded', initScene);
