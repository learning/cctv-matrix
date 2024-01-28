import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { GUI } from 'dat.gui';

class Main {
  constructor() {
    this.loader = new GLTFLoader();
    this.init();
  }

  async init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.light = new THREE.DirectionalLight(0x9FA8FF, 10);

    this.light.position.set(-2.5, 6.25, 3.6);
    this.light.castShadow = true;
    this.light.shadow.mapSize.width = 2048;
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.radius = 4;
    this.scene.add(this.light);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.width = 2048;
    this.renderer.shadowMap.height = 2048;
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderScene = new RenderPass(this.scene, this.camera);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderScene);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.1, 0.5, 0.85);

    this.composer.addPass(this.bloomPass);
    this.composer.setPixelRatio(window.devicePixelRatio);

    document.body.appendChild(this.renderer.domElement);

    await Promise.all([
      this.loadEnvironment(),
      this.loadWall(),
      this.loadCameras(),
      this.loadCursor()
    ]);

    this.camera.position.z = 125;
    this.camera.setFocalLength(200);

    const animate = () => {
      requestAnimationFrame(animate);
      this.composer.render();
    };

    animate();

    this.bindEvents();
    if (process.env.NODE_ENV === 'development') {
      this.addGUI();
    }
  }

  async loadEnvironment () {
    return new Promise(resolve => {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      pmremGenerator.compileEquirectangularShader();
      new EXRLoader().load('assets/moonless_golf_1k.exr', texture => {
        const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
        this.scene.environment = exrCubeRenderTarget.texture;
        texture.dispose();
        resolve();
      });
    });
  }

  async loadWall () {
    const { scene } = await this.loader.loadAsync('assets/wall.glb');
    scene.scale.set(0.4, 0.4, 0.4);
    scene.traverse(child => {
      if (child.isMesh) {
        child.receiveShadow = true;
      }
    });
    scene.position.z = -0.78;
    this.wall = scene;
    this.scene.add(scene);
  }

  async loadCameras () {
    const [{ scene: camera}, { scene: base }] = await Promise.all([
      this.loader.loadAsync('assets/camera.glb'),
      this.loader.loadAsync('assets/base.glb')
    ]);
    camera.scale.set(0.2, 0.2, 0.2);
    base.scale.set(0.2, 0.2, 0.2);
    [camera, base].forEach(obj => {
      obj.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
        }
      });
    });
    this.cameras = new Array(7).fill().map((_, i) => new Array(7).fill().map((_, j) => {
      const b = base.clone();
      const c = camera.clone();
      c.position.set(i - 3, j - 3, 0);
      b.position.set(i - 3, j - 3, 0);
      this.scene.add(b);
      this.scene.add(c);
      return c;
    }));
  }

  async loadCursor () {
    const { scene: cursor } = await this.loader.loadAsync('assets/cursor.glb');
    cursor.scale.set(0.3, 0.3, 0.3);
    cursor.position.set(0, 0, 10);
    this.cursor = cursor;
    this.scene.add(cursor);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
    this.raycaster = new THREE.Raycaster();
    // add a big plane to catch mouse events
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0, transparent: true})
    );
    this.plane.position.z = 10;
    this.scene.add(this.plane);
    window.document.body.style.cursor = 'none';
    window.addEventListener('mousemove', e => {
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.plane);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        this.cursor.position.x = point.x;
        this.cursor.position.y = point.y;
        point.y *= 1.5;
        this.cameras.forEach(row => row.forEach(camera => {
          camera.lookAt(point);
        }));
      }
    
    });
  }

  addGUI() {
    this.gui = new GUI();
    const cameraFolder = this.gui.addFolder('Camera');
    // camera's fov
    cameraFolder.add(this.camera.position, 'z', 1, 200, 1);
    cameraFolder.open();
    const lightFolder = this.gui.addFolder('Light');
    lightFolder.add(this.light.position, 'x', -10, 10, 0.1);
    lightFolder.add(this.light.position, 'y', -10, 10, 0.1);
    lightFolder.add(this.light.position, 'z', 0, 10, 0.1);
    lightFolder.add(this.light, 'intensity', 0, 10, 0.1);
    lightFolder.open();
    const wallFolder = this.gui.addFolder('Wall');
    wallFolder.add(this.wall.position, 'z', -1, 0, 0.01);
    wallFolder.open();
    const bloomFolder = this.gui.addFolder('Bloom');
    bloomFolder.add(this.bloomPass, 'threshold', 0, 1, 0.01);
    bloomFolder.add(this.bloomPass, 'strength', 0, 10, 0.01);
    bloomFolder.add(this.bloomPass, 'radius', 0, 10, 0.01);
    bloomFolder.open();
  }
}

new Main();