import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export function mountKanshan(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.15, 7.2);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8c7c68, 3.1));
  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(-3, 5, 5);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff5b5b, 2.2);
  rim.position.set(4, 2, -4);
  scene.add(rim);

  const group = new THREE.Group();
  scene.add(group);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 64),
    new THREE.MeshBasicMaterial({ color: 0x201e1a, transparent: true, opacity: 0.12, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.34;
  shadow.scale.y = 0.32;
  scene.add(shadow);

  const fallback = document.createElement("img");
  fallback.src = `${import.meta.env.BASE_URL}assets/liukanshan-scarf-turnaround.png`;
  fallback.alt = "刘看山围巾造型";
  fallback.className = "model-fallback";
  container.appendChild(fallback);

  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}assets/liukanshan.glb`,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material.roughness = 0.82;
          child.material.metalness = 0;
        }
      });
      model.rotation.y = -0.15;
      group.add(model);

      const scarf = createScarf();
      scarf.position.set(0, -0.05, 0.17);
      group.add(scarf);
      fallback.classList.add("is-hidden");
      container.dataset.ready = "true";
    },
    undefined,
    () => container.dataset.failed = "true"
  );

  let phase = "idle";
  let start = performance.now();

  function resize() {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function animate(now) {
    const t = (now - start) / 1000;
    const active = phase.startsWith("drawing");
    const listening = phase === "speaking" || phase === "commenting";
    group.position.y = Math.sin(t * (active ? 7 : 2.1)) * (active ? 0.065 : 0.022);
    group.rotation.y = active ? Math.sin(t * 5.2) * 0.24 : Math.sin(t * 0.8) * 0.045;
    group.rotation.z = listening ? -0.035 : Math.sin(t * 1.3) * 0.012;
    const scale = phase === "complete" ? 1 + Math.sin(t * 7) * 0.025 : 1;
    group.scale.setScalar(scale);
    shadow.material.opacity = active ? 0.08 : 0.12;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  return {
    setPhase(next) {
      if (next !== phase) start = performance.now();
      phase = next;
      container.dataset.phase = next;
    }
  };
}

function createScarf() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xef5356, roughness: 0.75 });
  const band = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 8, 18), material);
  band.rotation.z = Math.PI / 2;
  band.scale.set(1, 1, 0.42);
  band.castShadow = true;
  group.add(band);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82, 0.12), material);
  tail.position.set(0.34, -0.48, -0.08);
  tail.rotation.z = -0.08;
  tail.castShadow = true;
  group.add(tail);
  return group;
}
