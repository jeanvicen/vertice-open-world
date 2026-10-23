import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  ShaderMaterial,
  Shape,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ResourceTracker } from '../../../rendering/ResourceTracker';
import { createRandom } from '../random';
import {
  CHINED_OUTLINE,
  type HullSection,
  loftGeometry,
  mirrorX,
  polygonOutline,
  prepareForMerge,
  sampleLoftSurface,
  UV_UNITS_U,
  UV_UNITS_V,
} from './hullGeometry';
import { createPanelTextures } from './panelTexture';
import type { ShipModel } from './ShipModel';

/** Main hull, rear to nose: a broad engineering section, a waist and a long faceted prow. */
const HULL: readonly HullSection[] = [
  { z: -17.6, width: 2.7, height: 1.5, y: 0 },
  { z: -16.9, width: 3.05, height: 1.8, y: 0 },
  { z: -12, width: 3.25, height: 1.95, y: 0.05 },
  { z: -6, width: 2.95, height: 1.8, y: 0.1 },
  { z: -1, width: 2.4, height: 1.52, y: 0.12 },
  { z: 3.5, width: 2.3, height: 1.72, y: 0.2 },
  { z: 8, width: 1.92, height: 1.42, y: 0.16 },
  { z: 12.5, width: 1.18, height: 0.96, y: 0.04 },
  { z: 16, width: 0.5, height: 0.48, y: -0.08 },
  { z: 17.9, width: 0.08, height: 0.08, y: -0.12 },
];

const COMMAND_DECK: readonly HullSection[] = [
  { z: 1.6, width: 0.8, height: 0.3, y: 1.62 },
  { z: 2.4, width: 1.0, height: 0.52, y: 1.62 },
  { z: 7.2, width: 0.92, height: 0.56, y: 1.5 },
  { z: 9.6, width: 0.5, height: 0.18, y: 1.32 },
];

const DORSAL_SPINE: readonly HullSection[] = [
  { z: -16.4, width: 0.42, height: 0.32, y: 1.86 },
  { z: -10, width: 0.5, height: 0.42, y: 1.9 },
  { z: -2, width: 0.44, height: 0.34, y: 1.62 },
  { z: 1.4, width: 0.22, height: 0.12, y: 1.58 },
];

const CHIN_POD: readonly HullSection[] = [
  { z: 7.5, width: 0.2, height: 0.16, y: -1.02 },
  { z: 8.6, width: 0.44, height: 0.34, y: -1.04 },
  { z: 12.2, width: 0.36, height: 0.3, y: -0.82 },
  { z: 13.4, width: 0.1, height: 0.08, y: -0.64 },
];

const NACELLE_X = 5.3;
const NACELLE_Y = -0.62;
const nacelle = (side: 1 | -1): HullSection[] =>
  [
    { z: -17.3, width: 0.92, height: 0.92 },
    { z: -16.6, width: 1.14, height: 1.14 },
    { z: -11.5, width: 1.2, height: 1.2 },
    { z: -8.4, width: 1.0, height: 1.0 },
    { z: -7.2, width: 0.62, height: 0.62 },
  ].map((section) => ({ ...section, x: NACELLE_X * side, y: NACELLE_Y }));

/** Anhedral of the swept radiator blades, in radians. */
const WING_DROOP = 0.19;
const WING_ROOT = new Vector3(2.3, -0.18, 0);
const WING_TIP_X = 10.6;

interface Engine {
  readonly position: Vector3;
  readonly radius: number;
}

const ENGINES: readonly Engine[] = [
  { position: new Vector3(0, 0.05, -17.6), radius: 1.16 },
  { position: new Vector3(-1.7, -0.6, -17.6), radius: 0.5 },
  { position: new Vector3(1.7, -0.6, -17.6), radius: 0.5 },
  { position: new Vector3(NACELLE_X, NACELLE_Y, -17.3), radius: 0.78 },
  { position: new Vector3(-NACELLE_X, NACELLE_Y, -17.3), radius: 0.78 },
];

const ENGINE_COLOR = new Color(0.62, 0.78, 1.0);
const BEACON_AMBER = new Color(1.0, 0.62, 0.3);

/**
 * Original procedural vessel: a long faceted hull with a raised command deck, swept radiator
 * blades with drooped tips, twin nacelles, a raked dorsal fin and a five-nozzle drive section.
 * Hull parts sharing a material are merged; surface details are instanced.
 */
export class ProceduralShip implements ShipModel {
  public readonly root = new Group();
  public readonly length = 36;
  private readonly resources = new ResourceTracker();
  private readonly fadeMaterials: Array<MeshStandardMaterial | MeshBasicMaterial> = [];
  private readonly shadowMeshes: Mesh[] = [];
  private readonly detailMeshes: InstancedMesh[] = [];
  private readonly engineGlows: Sprite[] = [];
  private readonly coreMaterial: MeshBasicMaterial;
  private readonly plumeMaterial: ShaderMaterial;
  private readonly strobe: Sprite;
  private readonly wingBeacons: Sprite[] = [];
  private engineIntensity = 1;
  private engineFade = 1;
  private hullFade = 1;

  public constructor(environment: Texture, glowTexture: Texture) {
    const panels = createPanelTextures();
    this.resources.track(panels.color);
    this.resources.track(panels.roughness);

    const hullMaterial = this.standard({
      color: new Color('#c2c5ca'),
      map: panels.color,
      roughnessMap: panels.roughness,
      metalness: 0.62,
      roughness: 0.95,
      envMap: environment,
      envMapIntensity: 1.1,
    });
    const darkMaterial = this.standard({
      color: new Color('#4a5059'),
      map: panels.color,
      roughnessMap: panels.roughness,
      metalness: 0.5,
      roughness: 1.0,
      envMap: environment,
      envMapIntensity: 0.9,
    });
    const ceramicMaterial = this.standard({
      color: new Color('#cfc6b6'),
      map: panels.color,
      metalness: 0.08,
      roughness: 0.52,
      envMap: environment,
      envMapIntensity: 0.6,
    });
    const nozzleMaterial = this.standard({
      color: new Color('#2a2d32'),
      metalness: 0.85,
      roughness: 0.32,
      envMap: environment,
      side: DoubleSide,
    });
    const plateLight = this.standard({
      color: new Color('#9da1a8'),
      metalness: 0.6,
      roughness: 0.42,
      envMap: environment,
    });
    const plateDark = this.standard({
      color: new Color('#262a30'),
      metalness: 0.45,
      roughness: 0.6,
      envMap: environment,
    });
    const windowMaterial = this.track(
      new MeshBasicMaterial({
        color: BEACON_AMBER.clone().multiplyScalar(0.85),
        transparent: false,
      }),
    );
    this.fadeMaterials.push(windowMaterial);

    this.addMerged(hullMaterial, [
      loftGeometry(HULL, CHINED_OUTLINE),
      loftGeometry(DORSAL_SPINE, CHINED_OUTLINE),
      loftGeometry(nacelle(1), polygonOutline(8)),
      loftGeometry(nacelle(-1), polygonOutline(8)),
    ]);
    const rightWing = createWing();
    this.addMerged(darkMaterial, [
      rightWing,
      mirrorX(rightWing),
      loftGeometry(CHIN_POD, CHINED_OUTLINE),
      createFin(
        [
          [-11.6, 0],
          [-15.6, -1.9],
          [-16.9, -1.9],
          [-16.7, 0],
        ],
        0.18,
        -0.95,
      ),
      ...wingTipPods(),
    ]);
    this.addMerged(ceramicMaterial, [
      loftGeometry(COMMAND_DECK, CHINED_OUTLINE),
      createFin(
        [
          [-10.8, 0],
          [-15.2, 3.7],
          [-17.1, 3.7],
          [-16.9, 0],
        ],
        0.2,
        1.95,
      ),
    ]);
    this.addMerged(nozzleMaterial, ENGINES.map(nozzleGeometry));

    // Radial falloff: a hot centre fading to the bell wall, not a flat disc.
    this.coreMaterial = this.track(
      new MeshBasicMaterial({ color: ENGINE_COLOR.clone(), map: glowTexture }),
    );
    const cores = this.track(
      mergeGeometries(
        ENGINES.map((engine) => {
          const disc = new CircleGeometry(engine.radius * 0.84, 28).rotateY(Math.PI);
          disc.translate(engine.position.x, engine.position.y, engine.position.z - 0.32);
          return prepareForMerge(disc);
        }),
      ),
    );
    this.root.add(new Mesh(cores, this.coreMaterial));

    this.plumeMaterial = this.track(
      new ShaderMaterial({
        uniforms: { uIntensity: { value: 1 }, uColor: { value: ENGINE_COLOR.clone() } },
        vertexShader: PLUME_VERTEX,
        fragmentShader: PLUME_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    const plumes = this.track(
      mergeGeometries(
        ENGINES.map((engine) => {
          const length = engine.radius * 7.5;
          const plume = new CylinderGeometry(
            engine.radius * 0.12,
            engine.radius * 0.78,
            length,
            20,
            1,
            true,
          );
          plume.rotateX(-Math.PI / 2);
          plume.translate(
            engine.position.x,
            engine.position.y,
            engine.position.z - 1.25 - length / 2,
          );
          return plume;
        }),
      ),
    );
    const plumeMesh = new Mesh(plumes, this.plumeMaterial);
    plumeMesh.renderOrder = 2;
    this.root.add(plumeMesh);

    for (const engine of ENGINES) {
      const glow = new Sprite(
        this.track(
          new SpriteMaterial({
            map: glowTexture,
            color: ENGINE_COLOR.clone().multiplyScalar(0.9),
            blending: AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        ),
      );
      glow.position.copy(engine.position).add(new Vector3(0, 0, -1.5));
      glow.scale.setScalar(engine.radius * 4.2);
      glow.renderOrder = 3;
      this.engineGlows.push(glow);
      this.root.add(glow);
    }

    for (const side of [1, -1] as const) {
      const beacon = this.beacon(glowTexture, BEACON_AMBER.clone().multiplyScalar(2.2), 1.1);
      const tip = new Vector3(WING_TIP_X + 0.15, 0, -14.4);
      tip.applyMatrix4(wingMatrix());
      beacon.position.set(tip.x * side, tip.y, tip.z);
      this.wingBeacons.push(beacon);
    }
    this.strobe = this.beacon(glowTexture, new Color(2.6, 2.7, 3.0), 1.6);
    this.strobe.position.set(0, 1.95 + 3.8, -16.6);

    this.buildDetails(plateLight, plateDark, windowMaterial);
  }

  public setEngineIntensity(value: number): void {
    this.engineIntensity = Math.max(0, value);
    this.applyEngines();
  }

  public setFade(hull: number, engines: number): void {
    const nextHull = Math.min(1, Math.max(0, hull));
    this.engineFade = Math.min(1, Math.max(0, engines));
    if (nextHull !== this.hullFade) {
      this.hullFade = nextHull;
      for (const material of this.fadeMaterials) {
        const transparent = nextHull < 1;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
        material.opacity = nextHull;
      }
    }
    this.root.visible = nextHull > 0.001 || this.engineFade > 0.001;
    this.applyEngines();
  }

  public setDetailDensity(density: number): void {
    for (const mesh of this.detailMeshes) {
      const total = mesh.instanceMatrix.count;
      // Details are stored as mirrored pairs; keep the count even so symmetry holds.
      mesh.count = Math.min(total, Math.round((total * Math.min(1, Math.max(0, density))) / 2) * 2);
    }
  }

  public setShadows(enabled: boolean): void {
    for (const mesh of this.shadowMeshes) {
      mesh.castShadow = enabled;
      mesh.receiveShadow = enabled;
    }
    for (const material of this.fadeMaterials) material.needsUpdate = true;
  }

  public update(timeSeconds: number): void {
    // Double-flash anti-collision strobe and steady amber position lights.
    const cycle = timeSeconds % 2.6;
    const flash = cycle < 0.07 || (cycle > 0.24 && cycle < 0.3) ? 1 : 0;
    this.strobe.material.opacity = flash * this.engineFade;
    for (const beacon of this.wingBeacons) beacon.material.opacity = 0.85 * this.engineFade;
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    this.resources.dispose();
  }

  private applyEngines(): void {
    const level = this.engineIntensity * this.engineFade;
    this.coreMaterial.color.copy(ENGINE_COLOR).multiplyScalar(0.4 + level * 0.8);
    this.plumeMaterial.uniforms.uIntensity!.value = level;
    for (const glow of this.engineGlows) glow.material.opacity = Math.min(1, 0.15 + level * 0.25);
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    return this.resources.track(resource);
  }

  private standard(
    parameters: ConstructorParameters<typeof MeshStandardMaterial>[0],
  ): MeshStandardMaterial {
    const material = this.track(new MeshStandardMaterial(parameters));
    this.fadeMaterials.push(material);
    return material;
  }

  private addMerged(material: Material, parts: BufferGeometry[]): void {
    const geometry = this.track(mergeGeometries(parts.map((part) => prepareForMerge(part))));
    for (const part of parts) part.dispose();
    const mesh = new Mesh(geometry, material);
    this.shadowMeshes.push(mesh);
    this.root.add(mesh);
  }

  private beacon(texture: Texture, color: Color, scale: number): Sprite {
    const sprite = new Sprite(
      this.track(
        new SpriteMaterial({
          map: texture,
          color,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      ),
    );
    sprite.scale.setScalar(scale);
    sprite.renderOrder = 3;
    this.root.add(sprite);
    return sprite;
  }

  /** Raised and recessed plates on the hull and blades, plus rows of lit viewports. */
  private buildDetails(
    light: MeshStandardMaterial,
    dark: MeshStandardMaterial,
    windows: MeshBasicMaterial,
  ): void {
    const random = createRandom(0x51d3);
    const lightMatrices: Matrix4[] = [];
    const darkMatrices: Matrix4[] = [];
    const windowMatrices: Matrix4[] = [];
    const position = new Vector3();
    const normal = new Vector3();
    const up = new Vector3(0, 1, 0);
    const quaternion = new Quaternion();
    const scale = new Vector3();
    const pushPair = (list: Matrix4[], size: Vector3, lift: number): void => {
      for (const side of [1, -1]) {
        const mirroredPosition = position.clone().setX(position.x * side);
        const mirroredNormal = normal.clone().setX(normal.x * side);
        quaternion.setFromUnitVectors(up, mirroredNormal);
        mirroredPosition.addScaledVector(mirroredNormal, lift);
        list.push(new Matrix4().compose(mirroredPosition, quaternion, scale.copy(size)));
      }
    };

    // Hull plating: right-hand faces 0–3; each detail is mirrored onto the left.
    for (let index = 0; index < 120; index += 1) {
      const face = random() < 0.55 ? 0 : random() < 0.7 ? 1 : 2;
      const z = -15.8 + random() * (face === 2 ? 22 : 26);
      sampleLoftSurface(HULL, CHINED_OUTLINE, z, face, 0.12 + random() * 0.76, position, normal);
      const size = new Vector3(
        0.22 + random() * 0.62,
        0.04 + random() * 0.07,
        0.6 + random() * 2.8,
      );
      const raised = random() < 0.55;
      pushPair(raised ? lightMatrices : darkMatrices, size, raised ? size.y * 0.5 : 0.008);
    }
    // Radiator ribs along each blade's upper surface.
    const wing = wingMatrix();
    const wingNormal = new Vector3(0, 1, 0).transformDirection(wing);
    for (let rib = 0; rib < 9; rib += 1) {
      const x = 1.6 + rib * 0.95;
      const chordStart = -3.4 - x * 1.08;
      position.set(x, 0.16, chordStart - 2.6).applyMatrix4(wing);
      normal.copy(wingNormal);
      pushPair(darkMatrices, new Vector3(0.16, 0.035, 3.6 - rib * 0.18), 0.02);
    }
    // Viewports: two short rows along the command section.
    for (let row = 0; row < 2; row += 1) {
      for (let index = 0; index < 11; index += 1) {
        const z = 0.6 + index * 0.62 + row * 0.31;
        sampleLoftSurface(HULL, CHINED_OUTLINE, z, 1, row === 0 ? 0.32 : 0.52, position, normal);
        pushPair(windowMatrices, new Vector3(0.07, 0.02, 0.2), 0.012);
      }
    }

    const box = this.track(new BoxGeometry(1, 1, 1));
    const sets: Array<[Matrix4[], Material, boolean]> = [
      [lightMatrices, light, true],
      [darkMatrices, dark, true],
      [windowMatrices, windows, false],
    ];
    for (const [matrices, material, optional] of sets) {
      const mesh = new InstancedMesh(box, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.track({ dispose: () => mesh.dispose() });
      if (optional) {
        this.detailMeshes.push(mesh);
        this.shadowMeshes.push(mesh);
      }
    }
  }
}

function wingMatrix(): Matrix4 {
  return new Matrix4()
    .makeTranslation(WING_ROOT.x, WING_ROOT.y, WING_ROOT.z)
    .multiply(new Matrix4().makeRotationZ(-WING_DROOP));
}

/** Right blade: a swept planform extruded thin, drooped at the root. */
function createWing(): BufferGeometry {
  const outline: Array<[number, number]> = [
    [0, -2.6],
    [4.6, -8.9],
    [WING_TIP_X, -14.2],
    [WING_TIP_X + 0.35, -15.1],
    [WING_TIP_X, -17.9],
    [3.4, -16.4],
    [0, -14.8],
  ];
  const shape = new Shape(outline.map(([x, z]) => new Vector2(x, z)));
  shape.autoClose = true;
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.06,
    bevelSegments: 1,
  });
  // Shape Y becomes +Z (chord) and the extrusion depth points down (thickness).
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.13, 0);
  geometry.applyMatrix4(wingMatrix());
  return prepareForMerge(geometry, 1 / UV_UNITS_U, 1 / UV_UNITS_V);
}

/** Vertical fin from a (z, y) profile, centred on the keel line at the given height. */
function createFin(
  profile: ReadonlyArray<readonly [number, number]>,
  thickness: number,
  y: number,
): BufferGeometry {
  const shape = new Shape(profile.map(([z, height]) => new Vector2(z, height)));
  shape.autoClose = true;
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.04,
    bevelSegments: 1,
  });
  // Shape X becomes +Z; the extrusion runs across the ship.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(thickness / 2, y, 0);
  return prepareForMerge(geometry, 1 / UV_UNITS_U, 1 / UV_UNITS_V);
}

function wingTipPods(): BufferGeometry[] {
  const tip = new Vector3(WING_TIP_X, 0.05, 0).applyMatrix4(wingMatrix());
  const sections: HullSection[] = [
    { z: -18.3, width: 0.16, height: 0.16, y: tip.y, x: tip.x },
    { z: -17.6, width: 0.3, height: 0.3, y: tip.y, x: tip.x },
    { z: -14.8, width: 0.28, height: 0.28, y: tip.y, x: tip.x },
    { z: -13.6, width: 0.08, height: 0.08, y: tip.y, x: tip.x },
  ];
  const pod = loftGeometry(sections, polygonOutline(6));
  return [pod, mirrorX(pod)];
}

function nozzleGeometry(engine: Engine): BufferGeometry {
  const bell = new CylinderGeometry(engine.radius * 0.82, engine.radius, 1.3, 28, 1, true);
  bell.rotateX(Math.PI / 2);
  bell.translate(engine.position.x, engine.position.y, engine.position.z - 0.6);
  return bell;
}

const PLUME_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const PLUME_FRAGMENT = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.6);
  float facing = abs(dot(normalize(vWorldNormal), normalize(cameraPosition - vWorldPosition)));
  float intensity = along * pow(facing, 1.6) * 0.32 * uIntensity;
  gl_FragColor = vec4(uColor * intensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
