import { type BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CHINED_OUTLINE,
  loftGeometry,
  mirrorX,
  polygonOutline,
  prepareForMerge,
  UV_UNITS_U,
  UV_UNITS_V,
} from '../ship/hullGeometry';

export interface EngineMount {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

export interface FighterModel {
  readonly geometry: BufferGeometry;
  readonly engines: readonly EngineMount[];
}

function blade(
  outline: ReadonlyArray<readonly [number, number]>,
  thickness: number,
  root: readonly [number, number],
  droop: number,
): BufferGeometry {
  const shape = new Shape(outline.map(([x, z]) => new Vector2(x, z)));
  const geometry = new ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.03,
    bevelSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness / 2, 0);
  geometry.rotateZ(-droop);
  geometry.translate(root[0], root[1], 0);
  return prepareForMerge(geometry, 1 / UV_UNITS_U, 1 / UV_UNITS_V);
}

function nacelle(x: number, y: number, z: number, radius: number, length: number): BufferGeometry {
  const body = new CylinderGeometry(radius * 0.8, radius, length, 10, 1, false);
  body.rotateX(Math.PI / 2);
  body.translate(x, y, z + length / 2);
  return body;
}

/**
 * Raider: a short, predatory interceptor with forward-swept, drooped blades and twin drives.
 * Built small (≈9 units) so the protagonist's ship reads as a much heavier vessel.
 */
export function createRaiderModel(): FighterModel {
  const body = loftGeometry(
    [
      { z: -4.2, width: 0.62, height: 0.4, y: 0 },
      { z: -3.4, width: 0.98, height: 0.6, y: 0 },
      { z: 0.6, width: 0.82, height: 0.55, y: 0.05 },
      { z: 3.2, width: 0.36, height: 0.3, y: 0 },
      { z: 4.9, width: 0.05, height: 0.05, y: -0.05 },
    ],
    CHINED_OUTLINE,
  );
  const wing = blade(
    [
      [0, -3.6],
      [4.4, 0.6],
      [4.8, 0.3],
      [4.5, -1.1],
      [0, -2.2],
    ],
    0.12,
    [0.5, -0.05],
    0.32,
  );
  const engines: EngineMount[] = [
    { x: 0.95, y: -0.12, z: -4.6, radius: 0.3 },
    { x: -0.95, y: -0.12, z: -4.6, radius: 0.3 },
  ];
  const parts = [
    body,
    wing,
    mirrorX(wing),
    ...engines.map((engine) => nacelle(engine.x, engine.y, engine.z, engine.radius, 2.6)),
  ].map((part) => prepareForMerge(part));
  return { geometry: mergeGeometries(parts), engines };
}

/** Defender: a pale, straight-winged patrol fighter with a single large drive and a tail fin. */
export function createDefenderModel(): FighterModel {
  const body = loftGeometry(
    [
      { z: -3.9, width: 0.58, height: 0.58, y: 0 },
      { z: -3.0, width: 0.74, height: 0.7, y: 0 },
      { z: 1.4, width: 0.62, height: 0.6, y: 0.04 },
      { z: 3.6, width: 0.2, height: 0.22, y: 0 },
    ],
    polygonOutline(6),
  );
  const wing = blade(
    [
      [0, -1.2],
      [3.9, -2.0],
      [3.9, -2.9],
      [0, -3.3],
    ],
    0.1,
    [0.45, -0.1],
    0.05,
  );
  const fin = blade(
    [
      [0, -1.8],
      [1.6, -3.1],
      [1.6, -3.7],
      [0, -3.6],
    ],
    0.08,
    [0, 0.35],
    -Math.PI / 2,
  );
  const engines: EngineMount[] = [{ x: 0, y: 0, z: -4.4, radius: 0.44 }];
  const parts = [body, wing, mirrorX(wing), fin, nacelle(0, 0, -4.4, 0.44, 0.7)].map((part) =>
    prepareForMerge(part),
  );
  return { geometry: mergeGeometries(parts), engines };
}
