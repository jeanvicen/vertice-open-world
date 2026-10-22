import type { Scene } from 'three';
import {
  BoxGeometry,
  BufferGeometry,
  type BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Group,
} from 'three';

/** Original, simple geometric landscape placeholder; replace each shape with licensed authored art. */
export function buildEnvironment(
  scene: Scene,
  root: Group,
  geometries: Set<BufferGeometry>,
  materials: Set<MeshStandardMaterial>,
): void {
  const daylight = new HemisphereLight('#ded5be', '#5b625d', 2.1);
  scene.add(daylight);
  const sun = new DirectionalLight('#ffe2b4', 3.1);
  sun.position.set(-28, 38, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.bias = -0.00025;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  const blockSpecs: ReadonlyArray<readonly [number, number, number, number, number, string]> = [
    [-19, 4.4, -16, 10, 9, '#776f60'],
    [-8.5, 2.9, -24, 11, 8, '#89806f'],
    [8, 4.1, -28, 13, 11, '#786f64'],
    [20, 3.1, -18, 10, 8, '#918675'],
    [-24, 2.1, -5, 8, 7, '#827865'],
    [22, 2.5, -3, 11, 8, '#827a6b'],
    [-15, 4, -38, 12, 8, '#898272'],
    [4, 3.2, -44, 15, 10, '#797365'],
    [24, 4.7, -40, 12, 10, '#827768'],
  ];
  for (const [x, height, z, width, length, color] of blockSpecs) {
    const geometry = new BoxGeometry(width, height, length);
    const material = new MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.025 });
    geometries.add(geometry);
    materials.add(material);
    const structure = new Mesh(geometry, material);
    structure.position.set(x, height / 2 - 0.12, z);
    structure.castShadow = true;
    structure.receiveShadow = true;
    root.add(structure);
  }
  const focal = new Vector3(-20, 0, -16);
  sun.target.position.copy(focal);
  scene.add(sun.target);
}
