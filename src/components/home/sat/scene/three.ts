/* Tot ce folosește scena din three.js, luat direct din modulele sursă: așa bundlerul păstrează doar
   clasele de care e nevoie (pachetul „three” e un singur modul mare, din care rămân și părți nefolosite).
   Toate fișierele scenei importă de aici, niciodată din „three”, ca să nu ajungă două copii în pachet. */
export { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js';
export { Scene } from 'three/src/scenes/Scene.js';
export { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
export { Object3D } from 'three/src/core/Object3D.js';
export { BufferGeometry } from 'three/src/core/BufferGeometry.js';
export { Float32BufferAttribute } from 'three/src/core/BufferAttribute.js';
export { InstancedBufferAttribute } from 'three/src/core/InstancedBufferAttribute.js';
export { Group } from 'three/src/objects/Group.js';
export { Mesh } from 'three/src/objects/Mesh.js';
export { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
export { Points } from 'three/src/objects/Points.js';
export { Sprite } from 'three/src/objects/Sprite.js';
export { BoxGeometry } from 'three/src/geometries/BoxGeometry.js';
export { CircleGeometry } from 'three/src/geometries/CircleGeometry.js';
export { ConeGeometry } from 'three/src/geometries/ConeGeometry.js';
export { CylinderGeometry } from 'three/src/geometries/CylinderGeometry.js';
export { IcosahedronGeometry } from 'three/src/geometries/IcosahedronGeometry.js';
export { PlaneGeometry } from 'three/src/geometries/PlaneGeometry.js';
export { RingGeometry } from 'three/src/geometries/RingGeometry.js';
export { Material } from 'three/src/materials/Material.js';
export { MeshBasicMaterial } from 'three/src/materials/MeshBasicMaterial.js';
export { MeshLambertMaterial } from 'three/src/materials/MeshLambertMaterial.js';
export { PointsMaterial } from 'three/src/materials/PointsMaterial.js';
export { SpriteMaterial } from 'three/src/materials/SpriteMaterial.js';
export { DirectionalLight } from 'three/src/lights/DirectionalLight.js';
export { HemisphereLight } from 'three/src/lights/HemisphereLight.js';
export { PointLight } from 'three/src/lights/PointLight.js';
export { SpotLight } from 'three/src/lights/SpotLight.js';
export { CanvasTexture } from 'three/src/textures/CanvasTexture.js';
export { Color, type ColorRepresentation } from 'three/src/math/Color.js';
export { Euler } from 'three/src/math/Euler.js';
export { Matrix4 } from 'three/src/math/Matrix4.js';
export { Quaternion } from 'three/src/math/Quaternion.js';
export { Vector3 } from 'three/src/math/Vector3.js';
export {
  AddEquation,
  CustomBlending,
  DynamicDrawUsage,
  OneFactor,
  PCFShadowMap,
  SRGBColorSpace,
  SrcAlphaFactor,
  ZeroFactor,
} from 'three/src/constants.js';
