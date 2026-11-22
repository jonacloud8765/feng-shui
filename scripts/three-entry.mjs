// The parts of three.js the Record Room uses, bundled into one ES module so the
// room needs no build step at runtime. Rebuild after changing this file:
//   npx esbuild@0.25.10 scripts/three-entry.mjs --bundle --format=esm --minify --outfile=src/renderer/records/three.js
// (with three@0.180.0 installed next to it)
export * from 'three';
export { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
export { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
export { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
