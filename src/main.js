import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const COLORS = {
  ink: 0x1b1b19,
  paper: 0xeee1c6,
  paperLight: 0xf7eedc,
  cobalt: 0x195fc7,
  coral: 0xed684e,
  mustard: 0xe5ad3c,
  feather: 0xf2ead8,
  metal: 0x26333b,
  orange: 0xe99935,
  leather: 0x5a3826,
  road: 0x8d8271,
};

const ENVIRONMENT_PRESETS = {
  morning: {
    skyTop: 0x83b9c4,
    skyBottom: 0xf1d5aa,
    fog: 0xc9d8c9,
    oceanA: 0x6b9da8,
    oceanB: 0x2f6d85,
    sun: 0xf4c65e,
    cloud: 0xf2e8d4,
    beach: 0xe5c48f,
    key: 0xffe2a0,
    hemiSky: 0xc6e0df,
    hemiGround: 0x8a6547,
    keyIntensity: 2.7,
    hemiIntensity: 1.45,
    fogNear: 15,
    fogFar: 62,
    exposure: 1.05,
    wind: 'WSW 03',
  },
  noon: {
    skyTop: 0x2366bd,
    skyBottom: 0x80bfd0,
    fog: 0x8fc4cb,
    oceanA: 0x277ba0,
    oceanB: 0x124d78,
    sun: 0xffe68a,
    cloud: 0xfff4dc,
    beach: 0xe9c990,
    key: 0xfff2c1,
    hemiSky: 0x8dc9ee,
    hemiGround: 0x956640,
    keyIntensity: 3.35,
    hemiIntensity: 1.25,
    fogNear: 24,
    fogFar: 78,
    exposure: 1.12,
    wind: 'W 04',
  },
  sunset: {
    skyTop: 0x76648c,
    skyBottom: 0xef9165,
    fog: 0xd79172,
    oceanA: 0x6a6075,
    oceanB: 0x31445c,
    sun: 0xffa751,
    cloud: 0xf0bea0,
    beach: 0xc98d68,
    key: 0xff9956,
    hemiSky: 0xc38c9a,
    hemiGround: 0x6a443c,
    keyIntensity: 2.65,
    hemiIntensity: 1.2,
    fogNear: 12,
    fogFar: 57,
    exposure: 1.08,
    wind: 'WNW 05',
  },
};

class PelicanExperience {
  constructor() {
    this.app = document.querySelector('#app');
    this.container = document.querySelector('#scene');
    this.loading = document.querySelector('#loading');
    this.fallback = document.querySelector('#fallback');
    this.rideToggle = document.querySelector('#ride-toggle');
    this.rideLabel = document.querySelector('#ride-label');
    this.soundToggle = document.querySelector('#sound-toggle');
    this.resetViewButton = document.querySelector('#reset-view');
    this.speedRange = document.querySelector('#speed-range');
    this.speedOutput = document.querySelector('#speed-output');
    this.speedValue = document.querySelector('#speed-value');
    this.windValue = document.querySelector('#wind-value');
    this.environmentButtons = [...document.querySelectorAll('[data-environment]')];
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.pedalAngle = 0;
    this.travel = 0;
    this.riding = true;
    this.rideBlend = 1;
    this.speed = Number(this.speedRange.value);
    this.environmentName = 'morning';
    this.targetEnvironment = ENVIRONMENT_PRESETS.morning;
    this.currentEnvironment = this.cloneEnvironment(ENVIRONMENT_PRESETS.morning);
    this.audio = null;
    this.soundOn = false;
    this.lastChainStep = 0;
    this.roadItems = [];
    this.clouds = [];
    this.gulls = [];
    this.blinkCountdown = 2.8;
    this.blinkRemaining = 0;
    this.disposed = false;
  }

  init() {
    try {
      this.createRenderer();
      this.createCameraAndControls();
      this.createMaterials();
      this.createSky();
      this.createLights();
      this.createOcean();
      this.createRoad();
      this.createScenery();
      this.createBike();
      this.createAtmosphere();
      this.bindUI();
      this.applyEnvironment(1);
      this.onResize();
      this.controls.saveState();
      this.clock.start();
      this.renderer.setAnimationLoop(() => this.animate());
      this.ready();
    } catch (error) {
      console.error('Unable to start the 3D postcard:', error);
      this.showFallback();
    }
  }

  cloneEnvironment(preset) {
    const clone = { ...preset };
    for (const key of ['skyTop', 'skyBottom', 'fog', 'oceanA', 'oceanB', 'sun', 'cloud', 'beach', 'key', 'hemiSky', 'hemiGround']) {
      clone[key] = new THREE.Color(preset[key]);
    }
    return clone;
  }

  createRenderer() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(COLORS.paper, 18, 70);

    this.renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.container.appendChild(this.renderer.domElement);
  }

  createCameraAndControls() {
    this.camera = new THREE.PerspectiveCamera(37, 1, 0.1, 180);
    this.camera.position.set(7.8, 4.35, 8.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0.05, 2.02, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 5.2;
    this.controls.maxDistance = 13.5;
    this.controls.minPolarAngle = PI * 0.18;
    this.controls.maxPolarAngle = PI * 0.49;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.8;
    this.controls.update();
  }

  createMaterials() {
    const standard = (color, roughness = 0.78, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.materials = {
      road: standard(COLORS.road, 0.95),
      roadEdge: standard(0xc8a66c, 0.92),
      beach: standard(ENVIRONMENT_PRESETS.morning.beach, 0.96),
      stripe: standard(COLORS.mustard, 0.8),
      coral: standard(COLORS.coral, 0.56),
      coralDark: standard(0xb63e34, 0.6),
      cobalt: standard(COLORS.cobalt, 0.68),
      mustard: standard(COLORS.mustard, 0.64),
      feather: standard(COLORS.feather, 0.92),
      featherShade: standard(0xd8ceb9, 0.9),
      beak: standard(COLORS.orange, 0.54),
      pouch: standard(0xe4a23f, 0.62),
      eye: standard(0x11110f, 0.34),
      highlight: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      metal: standard(COLORS.metal, 0.3, 0.72),
      rubber: standard(0x252522, 0.94),
      leather: standard(COLORS.leather, 0.82),
      cloud: standard(ENVIRONMENT_PRESETS.morning.cloud, 0.98),
      sand: standard(0xe3c28d, 1),
      lighthouse: standard(0xf2e4c7, 0.8),
      red: standard(0xc74e3c, 0.7),
      foliage: standard(0x527b5c, 0.94),
      foliageLight: standard(0x769a6c, 0.92),
    };
    this.paperTexture = this.createPaperTexture();
    this.materials.road.map = this.paperTexture;
  }

  createPaperTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#aaa08e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 1800; i += 1) {
      const alpha = 0.025 + Math.random() * 0.075;
      context.fillStyle = `rgba(30,25,20,${alpha})`;
      const size = Math.random() > 0.92 ? 2 : 1;
      context.fillRect(Math.random() * 256, Math.random() * 256, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 2);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  createSky() {
    const geometry = new THREE.SphereGeometry(82, 40, 24);
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(ENVIRONMENT_PRESETS.morning.skyTop) },
      uBottomColor: { value: new THREE.Color(ENVIRONMENT_PRESETS.morning.skyBottom) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        varying vec3 vPosition;
        void main() {
          float heightMix = smoothstep(-0.16, 0.68, normalize(vPosition).y);
          float horizonGlow = pow(1.0 - abs(normalize(vPosition).y), 5.0) * 0.12;
          vec3 color = mix(uBottomColor, uTopColor, heightMix);
          color += horizonGlow;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(geometry, material);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.15, 36, 24),
      new THREE.MeshBasicMaterial({ color: ENVIRONMENT_PRESETS.morning.sun }),
    );
    this.sun.position.set(10, 9.5, -26);
    this.scene.add(this.sun);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(2.55, 3.1, 48),
      new THREE.MeshBasicMaterial({ color: ENVIRONMENT_PRESETS.morning.sun, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    halo.position.copy(this.sun.position);
    halo.lookAt(this.camera.position);
    this.sunHalo = halo;
    this.scene.add(halo);
  }

  createLights() {
    this.hemiLight = new THREE.HemisphereLight(
      ENVIRONMENT_PRESETS.morning.hemiSky,
      ENVIRONMENT_PRESETS.morning.hemiGround,
      ENVIRONMENT_PRESETS.morning.hemiIntensity,
    );
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(ENVIRONMENT_PRESETS.morning.key, ENVIRONMENT_PRESETS.morning.keyIntensity);
    this.keyLight.position.set(-6, 11, 8);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -9;
    this.keyLight.shadow.camera.right = 9;
    this.keyLight.shadow.camera.top = 9;
    this.keyLight.shadow.camera.bottom = -5;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 35;
    this.keyLight.shadow.bias = -0.0003;
    this.keyLight.shadow.normalBias = 0.025;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x92c7df, 1.25);
    this.rimLight.position.set(7, 6, -9);
    this.scene.add(this.rimLight);
  }

  createOcean() {
    const geometry = new THREE.PlaneGeometry(100, 34, 100, 34);
    geometry.rotateX(-PI / 2);
    this.oceanUniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(ENVIRONMENT_PRESETS.morning.oceanA) },
      uColorB: { value: new THREE.Color(ENVIRONMENT_PRESETS.morning.oceanB) },
      uSun: { value: new THREE.Color(ENVIRONMENT_PRESETS.morning.sun) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.oceanUniforms,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          vUv = uv;
          vec3 p = position;
          float waveA = sin(p.x * 0.48 + uTime * 0.82) * 0.055;
          float waveB = sin(p.z * 0.72 - uTime * 1.12 + p.x * 0.12) * 0.035;
          float waveC = cos((p.x + p.z) * 0.26 + uTime * 0.48) * 0.025;
          p.y += waveA + waveB + waveC;
          vWave = waveA + waveB + waveC;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uSun;
        varying vec2 vUv;
        varying float vWave;
        void main() {
          float depthMix = smoothstep(0.02, 0.95, vUv.y);
          float ribbon = sin(vUv.x * 175.0 + sin(vUv.y * 24.0 + uTime) * 2.2 + uTime * 0.7);
          float glint = smoothstep(0.965, 1.0, ribbon) * (0.16 + depthMix * 0.13);
          float shoreLine = smoothstep(0.04, 0.0, abs(vUv.y - 0.04));
          vec3 color = mix(uColorA, uColorB, depthMix);
          color += uSun * glint;
          color = mix(color, vec3(0.93, 0.88, 0.73), shoreLine * 0.38);
          color += vWave * 0.35;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.ocean = new THREE.Mesh(geometry, material);
    this.ocean.position.set(0, 0.12, -20);
    this.scene.add(this.ocean);

    const beachGeometry = new THREE.BoxGeometry(100, 0.22, 12);
    this.beach = new THREE.Mesh(beachGeometry, this.materials.beach);
    this.beach.position.set(0, 0.03, -7.1);
    this.beach.receiveShadow = true;
    this.scene.add(this.beach);

    const foamMaterial = new THREE.MeshBasicMaterial({ color: 0xf5ead3, transparent: true, opacity: 0.72, depthWrite: false });
    this.foamBands = [];
    for (let index = 0; index < 3; index += 1) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(100, 0.1 + index * 0.04), foamMaterial.clone());
      band.rotation.x = -PI / 2;
      band.position.set(0, 0.16 + index * 0.008, -2.6 - index * 0.58);
      band.material.opacity = 0.55 - index * 0.12;
      this.foamBands.push(band);
      this.scene.add(band);
    }
  }

  createRoad() {
    const roadShoulder = new THREE.Mesh(new THREE.BoxGeometry(100, 0.16, 5.7), this.materials.roadEdge);
    roadShoulder.position.set(0, 0.04, 0.55);
    roadShoulder.receiveShadow = true;
    this.scene.add(roadShoulder);

    const road = new THREE.Mesh(new THREE.BoxGeometry(100, 0.18, 4.45), this.materials.road);
    road.position.set(0, 0.11, 0.55);
    road.receiveShadow = true;
    this.scene.add(road);

    const edgeA = new THREE.Mesh(new THREE.BoxGeometry(100, 0.025, 0.11), this.materials.feather);
    edgeA.position.set(0, 0.215, -1.56);
    const edgeB = edgeA.clone();
    edgeB.position.z = 2.66;
    this.scene.add(edgeA, edgeB);

    for (let x = -45; x <= 45; x += 4.5) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.025, 0.095), this.materials.stripe);
      dash.position.set(x, 0.216, 0.58);
      dash.rotation.y = -0.012;
      dash.receiveShadow = true;
      this.scene.add(dash);
      this.roadItems.push({ object: dash, speed: 4.4, resetAt: 49 });
    }

    for (let x = -45; x <= 45; x += 9) {
      const post = this.createRoadsidePost();
      post.position.x = x;
      this.scene.add(post);
      this.roadItems.push({ object: post, speed: 4.4, resetAt: 49 });
    }

    const guardGroup = new THREE.Group();
    for (let x = -45; x <= 45; x += 3) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.72, 8), this.materials.metal);
      post.position.set(x, 0.53, 2.84);
      guardGroup.add(post);
    }
    const rail = this.cylinderBetween(vec(-45, 0.84, 2.84), vec(45, 0.84, 2.84), 0.035, this.materials.metal, 8);
    guardGroup.add(rail);
    this.scene.add(guardGroup);
  }

  createRoadsidePost() {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.3, 8), this.materials.metal);
    pole.position.y = 0.83;
    pole.castShadow = true;
    group.add(pole);
    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.06), this.materials.coral);
    reflector.position.set(0, 1.28, 0.04);
    group.add(reflector);
    group.position.z = 2.83;
    return group;
  }

  createScenery() {
    this.createLighthouse(-5.5, -9.8, 1.05);
    this.createUmbrella(-4.3, -3.25, 0.9);
    this.createSailboat(7.3, -11.5, 1);
    this.createClouds();
    this.createGulls();
    this.createShrubs();
  }

  createLighthouse(x, z, scale) {
    const group = new THREE.Group();
    group.position.set(x, 0.12, z);
    group.scale.setScalar(scale);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 1.05, 0.36, 24), this.materials.red);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);

    for (let index = 0; index < 5; index += 1) {
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58 - index * 0.045, 0.65 - index * 0.045, 0.62, 24),
        index % 2 === 0 ? this.materials.lighthouse : this.materials.red,
      );
      segment.position.y = 0.67 + index * 0.62;
      segment.castShadow = true;
      group.add(segment);
    }

    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 24), this.materials.metal);
    balcony.position.y = 3.78;
    group.add(balcony);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.62, 16),
      new THREE.MeshStandardMaterial({ color: 0xffda72, emissive: 0xe99128, emissiveIntensity: 1.3, roughness: 0.3 }),
    );
    lantern.position.y = 4.1;
    group.add(lantern);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.52, 16), this.materials.red);
    roof.position.y = 4.66;
    roof.castShadow = true;
    group.add(roof);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.materials.metal);
    finial.position.y = 4.99;
    group.add(finial);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe29a,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.2, 11, 24, 1, true), beamMaterial);
    beam.rotation.z = -PI / 2;
    beam.position.set(5.3, 4.08, 0);
    beam.rotation.x = -0.15;
    this.lighthouseBeamPivot = new THREE.Group();
    this.lighthouseBeamPivot.position.y = 0;
    this.lighthouseBeamPivot.add(beam);
    group.add(this.lighthouseBeamPivot);

    group.rotation.y = 0.1;
    this.scene.add(group);
  }

  createUmbrella(x, z, scale) {
    const group = new THREE.Group();
    group.position.set(x, 0.15, z);
    group.scale.setScalar(scale);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.8, 8), this.materials.metal);
    pole.position.y = 0.9;
    group.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.38, 12, 1, true), this.materials.coral);
    canopy.position.y = 1.78;
    canopy.castShadow = true;
    group.add(canopy);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.materials.feather);
    shade.position.y = 1.98;
    group.add(shade);
    this.scene.add(group);
  }

  createSailboat(x, z, scale) {
    const group = new THREE.Group();
    group.position.set(x, 0.18, z);
    group.scale.setScalar(scale);
    const hull = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 10), this.materials.cobalt);
    hull.scale.set(1.25, 0.28, 0.42);
    hull.rotation.z = -0.04;
    group.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.2, 8), this.materials.leather);
    mast.position.y = 1;
    group.add(mast);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(0, 0);
    sailShape.lineTo(0, 1.75);
    sailShape.lineTo(1.15, 0.2);
    sailShape.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), this.materials.feather);
    sail.position.set(0.02, 0.35, -0.03);
    sail.material = this.materials.feather.clone();
    sail.material.side = THREE.DoubleSide;
    group.add(sail);
    group.userData.baseY = group.position.y;
    this.sailboat = group;
    this.scene.add(group);
  }

  createClouds() {
    const cloudData = [
      [-12, 7.5, -16, 1.2], [4, 8.2, -22, 1.45], [15, 6.6, -18, 0.9],
      [-20, 9.2, -27, 1.6], [10, 9.6, -31, 1.1], [23, 7.2, -28, 1.3],
    ];
    for (const [x, y, z, scale] of cloudData) {
      const group = new THREE.Group();
      const puffCount = 5;
      for (let index = 0; index < puffCount; index += 1) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), this.materials.cloud);
        puff.scale.set(1.35 - index * 0.1, 0.62 + (index % 2) * 0.16, 0.7);
        puff.position.set((index - 2) * 0.68, Math.sin(index * 1.7) * 0.22, (index % 2) * 0.18);
        group.add(puff);
      }
      group.position.set(x, y, z);
      group.scale.setScalar(scale);
      group.userData.speed = 0.08 + Math.random() * 0.08;
      this.clouds.push(group);
      this.scene.add(group);
    }
  }

  createGulls() {
    const gullMaterial = new THREE.LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.65 });
    for (let index = 0; index < 5; index += 1) {
      const shape = new THREE.BufferGeometry().setFromPoints([vec(-0.35, 0, 0), vec(0, 0.16, 0), vec(0.35, 0, 0)]);
      const gull = new THREE.Line(shape, gullMaterial);
      gull.position.set(-7 + index * 4.2, 5.6 + (index % 2) * 0.65, -8.5 - (index % 3));
      gull.userData.phase = index * 1.2;
      this.gulls.push(gull);
      this.scene.add(gull);
    }
  }

  createShrubs() {
    const shrubData = [
      [-11, 0.24, -3.8, 1.2], [3.4, 0.24, -3.65, 0.8], [14, 0.24, -3.85, 1.45], [25, 0.24, -3.7, 1.1],
    ];
    for (const [x, y, z, scale] of shrubData) {
      const group = new THREE.Group();
      for (let index = 0; index < 4; index += 1) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.65, 12, 8), index % 2 ? this.materials.foliage : this.materials.foliageLight);
        leaf.position.set((index - 1.5) * 0.35, 0.35 + Math.sin(index) * 0.18, Math.cos(index) * 0.18);
        leaf.scale.set(1.1, 0.78, 0.9);
        group.add(leaf);
      }
      group.position.set(x, y, z);
      group.scale.setScalar(scale);
      this.scene.add(group);
      this.roadItems.push({ object: group, speed: 4.4, resetAt: 29 });
    }
  }

  createBike() {
    const group = new THREE.Group();
    group.position.z = 0.2;
    this.scene.add(group);

    const rearWheel = this.createWheel();
    rearWheel.group.position.set(-1.22, 1.0, 0);
    group.add(rearWheel.group);
    const frontWheel = this.createWheel();
    frontWheel.group.position.set(1.34, 1.0, 0);
    group.add(frontWheel.group);

    const rearAxle = vec(-1.22, 1.0, 0);
    const frontAxle = vec(1.34, 1.0, 0);
    const crankCenter = vec(-0.25, 0.9, 0);
    const seatJoint = vec(-0.48, 1.9, 0);
    const headTop = vec(0.76, 1.91, 0);
    const headBottom = vec(0.67, 1.34, 0);

    const frameTubes = [
      [rearAxle, crankCenter, 0.045, this.materials.coral],
      [rearAxle.clone().setZ(-0.13), crankCenter.clone().setZ(-0.1), 0.035, this.materials.coralDark],
      [rearAxle.clone().setZ(0.13), crankCenter.clone().setZ(0.1), 0.035, this.materials.coralDark],
      [rearAxle.clone().setZ(-0.13), seatJoint.clone().setZ(-0.11), 0.035, this.materials.coral],
      [rearAxle.clone().setZ(0.13), seatJoint.clone().setZ(0.11), 0.035, this.materials.coral],
      [crankCenter, seatJoint, 0.055, this.materials.coral],
      [seatJoint, headTop, 0.06, this.materials.coral],
      [headBottom, headTop, 0.065, this.materials.coral],
      [crankCenter, headBottom, 0.065, this.materials.coral],
      [headBottom.clone().setZ(-0.11), frontAxle.clone().setZ(-0.13), 0.038, this.materials.metal],
      [headBottom.clone().setZ(0.11), frontAxle.clone().setZ(0.13), 0.038, this.materials.metal],
    ];
    for (const [start, end, radius, material] of frameTubes) {
      const tube = this.cylinderBetween(start, end, radius, material, 12);
      tube.castShadow = true;
      tube.receiveShadow = true;
      group.add(tube);
    }

    const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.42, 8, 16), this.materials.leather);
    seat.position.set(-0.52, 2.04, 0);
    seat.rotation.z = PI / 2;
    seat.scale.z = 1.35;
    seat.castShadow = true;
    group.add(seat);

    const handlebars = new THREE.Group();
    handlebars.position.set(0.82, 2.05, 0);
    const stem = this.cylinderBetween(vec(0, -0.05, 0), vec(-0.12, 0.08, 0), 0.035, this.materials.metal, 10);
    handlebars.add(stem);
    const crossbar = this.cylinderBetween(vec(0, 0.07, -0.48), vec(0, 0.07, 0.48), 0.032, this.materials.metal, 10);
    handlebars.add(crossbar);
    for (const z of [-0.48, 0.48]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.24, 12), this.materials.leather);
      grip.position.set(0, 0.07, z * 0.9);
      grip.rotation.x = PI / 2;
      grip.castShadow = true;
      handlebars.add(grip);
    }
    group.add(handlebars);

    const crank = new THREE.Group();
    crank.position.copy(crankCenter);
    const chainRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 8, 28), this.materials.metal);
    chainRing.castShadow = true;
    crank.add(chainRing);
    const crankA = this.cylinderBetween(vec(0, 0, 0), vec(0.27, 0, 0.18), 0.025, this.materials.metal, 10);
    const crankB = this.cylinderBetween(vec(0, 0, 0), vec(-0.27, 0, -0.18), 0.025, this.materials.metal, 10);
    crank.add(crankA, crankB);
    const pedalA = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.065, 0.18), this.materials.mustard);
    pedalA.position.set(0.27, 0, 0.18);
    pedalA.castShadow = true;
    const pedalB = pedalA.clone();
    pedalB.position.set(-0.27, 0, -0.18);
    crank.add(pedalA, pedalB);
    group.add(crank);

    const chainCurve = new THREE.CatmullRomCurve3([
      vec(-0.03, 0.91, -0.09), vec(-0.72, 1.03, -0.09), vec(-1.35, 1.05, -0.09),
      vec(-1.46, 0.96, -0.09), vec(-1.26, 0.79, -0.09), vec(-0.72, 0.77, -0.09),
      vec(-0.47, 0.9, -0.09),
    ], true, 'catmullrom', 0.12);
    const chainLinks = [];
    for (let index = 0; index < 18; index += 1) {
      const link = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.035), this.materials.metal);
      const progress = index / 18;
      const point = chainCurve.getPointAt(progress);
      const tangent = chainCurve.getTangentAt(progress);
      link.position.copy(point);
      link.quaternion.setFromUnitVectors(vec(1, 0, 0), tangent.normalize());
      chainLinks.push(link);
      group.add(link);
    }

    const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), this.materials.coralDark);
    tailLight.position.set(-1.44, 1.77, 0);
    group.add(tailLight);

    this.bike = {
      group,
      rearWheel,
      frontWheel,
      crank,
      chainLinks,
      chainCurve,
      handlebars,
    };
    this.createPelican(group);
  }

  createWheel() {
    const group = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.095, 14, 52), this.materials.rubber);
    tire.castShadow = true;
    group.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.575, 0.027, 8, 48), this.materials.metal);
    group.add(rim);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * TAU;
      const start = vec(0, 0, 0);
      const end = vec(Math.cos(angle) * 0.56, Math.sin(angle) * 0.56, 0);
      const spoke = this.cylinderBetween(start, end, 0.008, this.materials.metal, 6);
      group.add(spoke);
    }
    const hub = this.cylinderBetween(vec(0, 0, -0.17), vec(0, 0, 0.17), 0.052, this.materials.metal, 10);
    group.add(hub);
    const hubAccent = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), this.materials.mustard);
    hubAccent.position.z = 0.18;
    group.add(hubAccent);
    return { group, tire };
  }

  createPelican(group) {
    const pelican = new THREE.Group();
    group.add(pelican);

    const jersey = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.materials.cobalt);
    jersey.scale.set(0.88, 0.68, 0.62);
    jersey.position.set(-0.06, 2.45, 0);
    jersey.rotation.z = -0.08;
    jersey.castShadow = true;
    pelican.add(jersey);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.materials.feather);
    belly.scale.set(0.57, 0.46, 0.62);
    belly.position.set(0.37, 2.36, 0);
    belly.castShadow = true;
    pelican.add(belly);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.37, 0.82, 20), this.materials.feather);
    neck.position.set(0.26, 3.05, 0);
    neck.rotation.z = -0.25;
    neck.castShadow = true;
    pelican.add(neck);

    const headPivot = new THREE.Group();
    headPivot.position.set(0.43, 3.5, 0);
    pelican.add(headPivot);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 20), this.materials.feather);
    head.scale.set(1.08, 0.96, 0.92);
    head.castShadow = true;
    headPivot.add(head);

    const upperBeak = new THREE.Mesh(new THREE.ConeGeometry(0.31, 1.32, 5, 1), this.materials.beak);
    upperBeak.rotation.z = -PI / 2;
    upperBeak.position.set(1.02, 0.03, 0);
    upperBeak.scale.set(1, 1, 0.72);
    upperBeak.castShadow = true;
    headPivot.add(upperBeak);

    const pouch = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), this.materials.pouch);
    pouch.scale.set(0.68, 0.21, 0.28);
    pouch.position.set(0.91, -0.18, 0);
    pouch.rotation.z = -0.03;
    pouch.castShadow = true;
    headPivot.add(pouch);

    const mouthLine = this.cylinderBetween(vec(0.52, -0.015, -0.02), vec(1.56, -0.015, -0.02), 0.009, this.materials.eye, 6);
    headPivot.add(mouthLine);

    const eyes = [];
    for (const z of [-0.365, 0.365]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), this.materials.eye);
      eye.position.set(0.22, 0.11, z);
      eye.castShadow = true;
      const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.materials.highlight);
      highlight.position.set(0.246, 0.14, z + Math.sign(z) * -0.035);
      eye.add(highlight);
      headPivot.add(eye);
      eyes.push(eye);
    }

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 28, 14, 0, TAU, 0, PI / 2),
      this.materials.coral,
    );
    cap.position.set(0.01, 0.24, 0);
    cap.scale.set(1.02, 0.66, 0.94);
    cap.castShadow = true;
    headPivot.add(cap);
    const capBand = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.035, 8, 28), this.materials.cobalt);
    capBand.position.set(0.01, 0.26, 0);
    capBand.rotation.x = PI / 2;
    capBand.scale.set(1, 0.65, 1);
    headPivot.add(capBand);
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.055, 0.66), this.materials.coralDark);
    capBrim.position.set(0.5, 0.28, 0);
    capBrim.rotation.z = -0.08;
    capBrim.castShadow = true;
    headPivot.add(capBrim);

    const tailGroup = new THREE.Group();
    for (let index = 0; index < 3; index += 1) {
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), this.materials.feather);
      feather.position.set(-0.87 - index * 0.06, 2.48 + (index - 1) * 0.08, (index - 1) * 0.16);
      feather.rotation.z = PI / 2 - 0.08;
      feather.rotation.y = (index - 1) * 0.16;
      feather.castShadow = true;
      tailGroup.add(feather);
    }
    pelican.add(tailGroup);

    const wings = [];
    for (const z of [-0.48, 0.48]) {
      const wing = new THREE.Group();
      const side = Math.sign(z);
      const shoulder = vec(-0.02, 2.76, z);
      const elbow = vec(0.35, 2.43, z * 1.15);
      const tip = vec(0.82, 2.08, z * 0.82);
      const upper = this.cylinderBetween(shoulder, elbow, 0.13, this.materials.feather, 12);
      const lower = this.cylinderBetween(elbow, tip, 0.1, this.materials.feather, 12);
      upper.castShadow = lower.castShadow = true;
      wing.add(upper, lower);
      for (let index = 0; index < 3; index += 1) {
        const feather = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), this.materials.feather);
        feather.scale.set(1.75, 0.34, 0.42);
        feather.position.copy(tip).add(vec(-0.12 - index * 0.15, -0.02 - index * 0.035, side * -0.05));
        feather.rotation.z = -0.2;
        feather.castShadow = true;
        wing.add(feather);
      }
      pelican.add(wing);
      wings.push(wing);
    }

    const scarfShape = new THREE.Shape();
    scarfShape.moveTo(0, 0.1);
    scarfShape.lineTo(-0.86, 0.29);
    scarfShape.lineTo(-0.63, -0.16);
    scarfShape.lineTo(-0.06, -0.11);
    scarfShape.closePath();
    const scarfMaterial = this.materials.mustard.clone();
    scarfMaterial.side = THREE.DoubleSide;
    const scarf = new THREE.Mesh(new THREE.ShapeGeometry(scarfShape), scarfMaterial);
    scarf.position.set(0.06, 2.91, 0.32);
    scarf.rotation.y = -0.13;
    scarf.castShadow = true;
    pelican.add(scarf);

    const legs = [];
    for (const z of [0.21, -0.19]) {
      const upper = this.createBone(0.095, this.materials.beak);
      const lower = this.createBone(0.073, this.materials.beak);
      const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), this.materials.feather);
      cuff.scale.set(1, 0.85, 0.9);
      const foot = new THREE.Group();
      for (let toeIndex = -1; toeIndex <= 1; toeIndex += 1) {
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.055, 0.085), this.materials.beak);
        toe.position.set(0.04, 0, toeIndex * 0.065);
        toe.castShadow = true;
        foot.add(toe);
      }
      const heel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.065, 0.19), this.materials.beak);
      foot.add(heel);
      pelican.add(upper, lower, cuff, foot);
      legs.push({ upper, lower, cuff, foot, z, phase: z > 0 ? 0 : PI });
    }

    this.bike.pelican = { pelican, headPivot, eyes, wings, scarf, tailGroup, legs, baseHeadY: headPivot.position.y };
  }

  createBone(radius, material) {
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.82, radius, 1, 12), material);
    bone.castShadow = true;
    return bone;
  }

  createAtmosphere() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    this.atmosphereData = [];
    for (let index = 0; index < count; index += 1) {
      const x = (Math.random() - 0.5) * 42;
      const y = 0.35 + Math.random() * 8;
      const z = -18 + Math.random() * 27;
      positions.set([x, y, z], index * 3);
      this.atmosphereData.push({ phase: Math.random() * TAU, speed: 0.2 + Math.random() * 0.4 });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xfff2d0,
      size: 0.065,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.atmosphere = new THREE.Points(geometry, material);
    this.scene.add(this.atmosphere);
  }

  bindUI() {
    this.rideToggle.addEventListener('click', () => this.setRiding(!this.riding));
    this.soundToggle.addEventListener('click', () => this.toggleSound());
    this.resetViewButton.addEventListener('click', () => this.resetView());
    this.speedRange.addEventListener('input', (event) => {
      this.speed = Number(event.currentTarget.value);
      this.speedOutput.value = `${this.speed} km/h`;
      this.speedOutput.textContent = `${this.speed} km/h`;
      this.speedValue.textContent = String(this.speed);
      this.playChainTick(0.65);
    });
    for (const button of this.environmentButtons) {
      button.addEventListener('click', () => {
        this.setEnvironment(button.dataset.environment);
        this.playChainTick(1.3);
      });
    }
    window.addEventListener('keydown', (event) => {
      const tag = document.activeElement?.tagName;
      if (event.code === 'Space' && tag !== 'INPUT' && tag !== 'BUTTON') {
        event.preventDefault();
        this.setRiding(!this.riding);
      }
      if (event.key.toLowerCase() === 'r' && tag !== 'INPUT') {
        this.resetView();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.audio) return;
      if (document.hidden) this.audio.context.suspend();
      else if (this.soundOn) this.audio.context.resume();
    });
  }

  setRiding(riding) {
    this.riding = riding;
    this.rideToggle.setAttribute('aria-pressed', String(riding));
    this.rideLabel.textContent = riding ? '暂歇片刻' : '继续骑行';
    this.app.classList.toggle('is-paused', !riding);
  }

  setEnvironment(name, immediate = false) {
    if (!ENVIRONMENT_PRESETS[name]) return;
    this.environmentName = name;
    this.targetEnvironment = ENVIRONMENT_PRESETS[name];
    this.windValue.textContent = this.targetEnvironment.wind;
    this.speedOutput.value = `${this.speed} km/h`;
    this.speedOutput.textContent = `${this.speed} km/h`;
    for (const button of this.environmentButtons) {
      const active = button.dataset.environment === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    if (immediate) this.currentEnvironment = this.cloneEnvironment(this.targetEnvironment);
  }

  async toggleSound() {
    try {
      if (!this.audio) this.createAudio();
      await this.audio.context.resume();
      this.soundOn = !this.soundOn;
      const now = this.audio.context.currentTime;
      this.audio.master.gain.cancelScheduledValues(now);
      this.audio.master.gain.setTargetAtTime(this.soundOn ? 0.46 : 0, now, 0.08);
      this.soundToggle.setAttribute('aria-pressed', String(this.soundOn));
      this.soundToggle.setAttribute('aria-label', this.soundOn ? '关闭环境声音' : '开启环境声音');
      this.playChainTick(1.15);
    } catch (error) {
      console.warn('Audio could not be started:', error);
      this.soundOn = false;
      this.soundToggle.setAttribute('aria-pressed', 'false');
    }
  }

  createAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio API is unavailable.');
    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    const windBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const windData = windBuffer.getChannelData(0);
    for (let index = 0; index < windData.length; index += 1) windData[index] = Math.random() * 2 - 1;
    const windSource = context.createBufferSource();
    windSource.buffer = windBuffer;
    windSource.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = 0.7;
    const windGain = context.createGain();
    windGain.gain.value = 0.13;
    windSource.connect(filter).connect(windGain).connect(master);
    windSource.start();

    this.audio = { context, master, windGain, filter };
  }

  playChainTick(velocity = 1) {
    if (!this.soundOn || !this.audio) return;
    const { context, master } = this.audio;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(170 + Math.random() * 35, now);
    oscillator.frequency.exponentialRampToValueAtTime(80, now + 0.045);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13 * velocity, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    oscillator.connect(gain).connect(master);
    oscillator.start(now);
    oscillator.stop(now + 0.06);
  }

  resetView() {
    this.controls.reset();
    this.playChainTick(0.8);
  }

  cylinderBetween(start, end, radius, material, radialSegments = 10) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(vec(0, 1, 0), direction.normalize());
    return mesh;
  }

  placeBone(mesh, start, end) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(vec(0, 1, 0), direction.normalize());
    mesh.scale.set(1, length, 1);
  }

  updateLeg(leg, pedalAngle) {
    const hip = vec(-0.12, 2.03, leg.z);
    const target = vec(-0.25 + Math.cos(pedalAngle) * 0.27, 0.9 + Math.sin(pedalAngle) * 0.27, leg.z);
    const upperLength = 0.68;
    const lowerLength = 0.68;
    const direction = new THREE.Vector3().subVectors(target, hip);
    const rawDistance = clamp(direction.length(), 0.05, upperLength + lowerLength - 0.01);
    direction.normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + rawDistance ** 2) / (2 * rawDistance);
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const bendDirection = vec(-direction.y, direction.x, 0).normalize();
    const knee = hip.clone().addScaledVector(direction, along).addScaledVector(bendDirection, height * 0.72);
    this.placeBone(leg.upper, hip, knee);
    this.placeBone(leg.lower, knee, target);
    leg.cuff.position.copy(hip);
    leg.foot.position.copy(target);
    leg.foot.rotation.z = pedalAngle;
  }

  updateEnvironment(delta) {
    const amount = this.reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2);
    const current = this.currentEnvironment;
    const target = this.targetEnvironment;
    for (const key of ['skyTop', 'skyBottom', 'fog', 'oceanA', 'oceanB', 'sun', 'cloud', 'beach', 'key', 'hemiSky', 'hemiGround']) {
      current[key].lerp(new THREE.Color(target[key]), amount);
    }
    for (const key of ['keyIntensity', 'hemiIntensity', 'fogNear', 'fogFar', 'exposure']) {
      current[key] = lerp(current[key], target[key], amount);
    }
    this.applyEnvironment(amount);
  }

  applyEnvironment() {
    const current = this.currentEnvironment;
    this.skyUniforms.uTopColor.value.copy(current.skyTop);
    this.skyUniforms.uBottomColor.value.copy(current.skyBottom);
    this.oceanUniforms.uColorA.value.copy(current.oceanA);
    this.oceanUniforms.uColorB.value.copy(current.oceanB);
    this.oceanUniforms.uSun.value.copy(current.sun);
    this.scene.fog.color.copy(current.fog);
    this.scene.fog.near = current.fogNear;
    this.scene.fog.far = current.fogFar;
    this.materials.cloud.color.copy(current.cloud);
    this.materials.beach.color.copy(current.beach);
    this.materials.stripe.color.copy(current.sun).lerp(new THREE.Color(COLORS.mustard), 0.55);
    this.sun.material.color.copy(current.sun);
    this.sunHalo.material.color.copy(current.sun);
    this.keyLight.color.copy(current.key);
    this.keyLight.intensity = current.keyIntensity;
    this.hemiLight.color.copy(current.hemiSky);
    this.hemiLight.groundColor.copy(current.hemiGround);
    this.hemiLight.intensity = current.hemiIntensity;
    this.renderer.toneMappingExposure = current.exposure;
  }

  updateRide(delta) {
    this.rideBlend = lerp(this.rideBlend, this.riding ? 1 : 0, 1 - Math.exp(-delta * 5));
    const speedFactor = this.speed / 24;
    const motion = delta * this.rideBlend * speedFactor;
    this.travel += motion * 2.35;
    this.pedalAngle -= motion * 2.15;

    this.bike.rearWheel.group.rotation.z = -this.travel / 0.775;
    this.bike.frontWheel.group.rotation.z = -this.travel / 0.775;
    this.bike.crank.rotation.z = this.pedalAngle;
    this.bike.group.position.y = Math.sin(this.elapsed * 6.2) * 0.018 * this.rideBlend;
    this.bike.group.rotation.z = Math.sin(this.elapsed * 3.1) * 0.008 * this.rideBlend;
    this.bike.handlebars.rotation.z = Math.sin(this.elapsed * 0.7) * 0.035 * this.rideBlend;

    const chainStep = Math.floor(Math.abs(this.pedalAngle) / (PI / 2));
    if (chainStep !== this.lastChainStep && this.rideBlend > 0.2) {
      this.lastChainStep = chainStep;
      this.playChainTick(0.7 + speedFactor * 0.28);
    }

    this.bike.pelican.legs.forEach((leg) => {
      this.updateLeg(leg, this.pedalAngle + leg.phase);
    });
    this.bike.pelican.headPivot.position.y = this.bike.pelican.baseHeadY + Math.sin(this.pedalAngle * 2) * 0.018 * this.rideBlend;
    this.bike.pelican.headPivot.rotation.z = -0.025 + Math.sin(this.pedalAngle) * 0.018;
    this.bike.pelican.wings.forEach((wing, index) => {
      wing.rotation.z = (index === 0 ? -1 : 1) * 0.03 + Math.sin(this.pedalAngle + index * PI) * 0.018;
    });
    this.bike.pelican.scarf.rotation.y = -0.13 + Math.sin(this.elapsed * 5.2) * (0.07 + speedFactor * 0.05) * this.rideBlend;
    this.bike.pelican.tailGroup.rotation.z = Math.sin(this.elapsed * 2.3) * 0.025 * this.rideBlend;

    const chainPoints = this.bike.chainLinks.map((link, index) => {
      const progress = (index / this.bike.chainLinks.length - this.travel * 0.19) % 1;
      const wrapped = progress < 0 ? progress + 1 : progress;
      const point = this.bike.chainCurve.getPointAt(wrapped);
      const tangent = this.bike.chainCurve.getTangentAt(wrapped).normalize();
      link.position.copy(point);
      link.quaternion.setFromUnitVectors(vec(1, 0, 0), tangent);
      return link;
    });
    void chainPoints;

    this.app.classList.toggle('is-fast', this.rideBlend > 0.2 && this.speed >= 30);
    if (this.audio) {
      const target = this.rideBlend * (0.075 + speedFactor * 0.055);
      this.audio.windGain.gain.setTargetAtTime(target, this.audio.context.currentTime, 0.1);
      this.audio.filter.frequency.setTargetAtTime(620 + speedFactor * 250, this.audio.context.currentTime, 0.15);
    }
  }

  updateWorld(delta) {
    const speedFactor = this.speed / 24;
    const movement = delta * this.rideBlend * speedFactor * 4.4;
    for (const item of this.roadItems) {
      item.object.position.x -= movement;
      if (item.object.position.x < -item.resetAt) item.object.position.x += item.resetAt * 2;
    }

    for (const cloud of this.clouds) {
      cloud.position.x += delta * cloud.userData.speed;
      cloud.position.y += Math.sin(this.elapsed * 0.2 + cloud.position.z) * delta * 0.018;
      if (cloud.position.x > 28) cloud.position.x = -28;
    }

    for (const gull of this.gulls) {
      gull.position.x += delta * (0.35 + this.rideBlend * 0.25);
      gull.position.y += Math.sin(this.elapsed * 3.4 + gull.userData.phase) * delta * 0.08;
      gull.rotation.z = Math.sin(this.elapsed * 2 + gull.userData.phase) * 0.08;
      if (gull.position.x > 20) gull.position.x = -20;
    }

    this.oceanUniforms.uTime.value = this.elapsed;
    this.foamBands.forEach((band, index) => {
      band.position.x = Math.sin(this.elapsed * 0.18 + index) * 0.7;
      band.material.opacity = (0.5 - index * 0.1) * (0.9 + Math.sin(this.elapsed * 0.8 + index) * 0.1);
    });
    if (this.sailboat) {
      this.sailboat.position.y = this.sailboat.userData.baseY + Math.sin(this.elapsed * 0.9) * 0.06;
      this.sailboat.rotation.z = Math.sin(this.elapsed * 0.72) * 0.025;
    }
    if (this.lighthouseBeamPivot) {
      this.lighthouseBeamPivot.rotation.y = Math.sin(this.elapsed * 0.28) * 0.62;
      this.lighthouseBeamPivot.children[0].material.opacity = 0.055 + Math.max(0, Math.sin(this.elapsed * 0.28)) * 0.045;
    }

    const positions = this.atmosphere.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const data = this.atmosphereData[index];
      let x = positions.getX(index);
      let y = positions.getY(index);
      x -= delta * (0.18 + data.speed * 0.25 + this.rideBlend * speedFactor * 0.24);
      y += Math.sin(this.elapsed * data.speed + data.phase) * delta * 0.03;
      if (x < -24) x = 24;
      positions.setX(index, x);
      positions.setY(index, y);
    }
    positions.needsUpdate = true;
  }

  updateBlink(delta) {
    if (this.blinkRemaining > 0) {
      this.blinkRemaining -= delta;
      const scaleY = this.blinkRemaining > 0.08 ? 0.12 : 1;
      this.bike.pelican.eyes.forEach((eye) => { eye.scale.y = scaleY; });
    } else {
      this.blinkCountdown -= delta;
      this.bike.pelican.eyes.forEach((eye) => { eye.scale.y = 1; });
      if (this.blinkCountdown <= 0) {
        this.blinkRemaining = 0.17;
        this.blinkCountdown = 2.4 + Math.random() * 3.4;
      }
    }
  }

  animate() {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    this.updateEnvironment(delta);
    this.updateRide(delta);
    this.updateWorld(delta);
    this.updateBlink(delta);
    this.sunHalo.lookAt(this.camera.position);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.fov = width < 700 ? 49 : 37;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 1.8));
  }

  ready() {
    const minimumLoadTime = new Promise((resolve) => window.setTimeout(resolve, this.reducedMotion ? 120 : 850));
    const compile = this.renderer.compileAsync
      ? this.renderer.compileAsync(this.scene, this.camera)
      : Promise.resolve();
    Promise.all([minimumLoadTime, compile])
      .catch((error) => console.warn('Scene compilation completed with a warning:', error))
      .finally(() => {
        this.loading.classList.add('is-done');
        this.app.classList.add('is-ready');
      });
  }

  showFallback() {
    this.loading.classList.add('is-done');
    this.fallback.hidden = false;
  }

  dispose() {
    this.disposed = true;
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.renderer?.dispose();
    this.paperTexture?.dispose();
  }
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

window.addEventListener('resize', () => {
  if (window.__pelicanExperience) window.__pelicanExperience.onResize();
});
window.addEventListener('pagehide', () => window.__pelicanExperience?.dispose(), { once: true });

if (supportsWebGL()) {
  const experience = new PelicanExperience();
  window.__pelicanExperience = experience;
  experience.init();
} else {
  document.querySelector('#loading').classList.add('is-done');
  document.querySelector('#fallback').hidden = false;
}
