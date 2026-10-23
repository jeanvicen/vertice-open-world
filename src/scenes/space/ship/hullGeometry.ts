import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** One cross-section of a lofted hull: a closed outline at a given position along +Z. */
export interface HullSection {
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly y: number;
  readonly x?: number;
}

export type Outline = (section: HullSection) => ReadonlyArray<readonly [number, number]>;

/** Chined, faceted hull outline, listed clockwise when seen from the nose. */
export const CHINED_OUTLINE: Outline = ({ width: w, height: h }) => [
  [0, h],
  [0.56 * w, 0.72 * h],
  [w, 0.06 * h],
  [0.64 * w, -0.52 * h],
  [0, -0.7 * h],
  [-0.64 * w, -0.52 * h],
  [-w, 0.06 * h],
  [-0.56 * w, 0.72 * h],
];

export function polygonOutline(sides: number, rotation = Math.PI / sides): Outline {
  return ({ width, height }) =>
    Array.from({ length: sides }, (_, index) => {
      const angle = rotation + (index / sides) * Math.PI * 2;
      return [Math.sin(angle) * width, Math.cos(angle) * height] as const;
    });
}

/** Texture space shared by all hull parts: 36 × 18 units per texture repeat. */
export const UV_UNITS_U = 36;
export const UV_UNITS_V = 18;

function ringPoints(section: HullSection, outline: Outline): Vector3[] {
  return outline(section).map(
    ([x, y]) => new Vector3(x + (section.x ?? 0), y + section.y, section.z),
  );
}

/**
 * Builds a flat-shaded, non-indexed loft through ordered sections (rear to nose), capped at
 * both ends. Faceted normals keep panel breaks crisp under a low sun.
 */
export function loftGeometry(sections: readonly HullSection[], outline: Outline): BufferGeometry {
  if (sections.length < 2) throw new Error('A loft needs at least two sections.');
  const rings = sections.map((section) => ringPoints(section, outline));
  const count = rings[0]?.length ?? 0;
  const positions: number[] = [];
  const uvs: number[] = [];
  const pushVertex = (point: Vector3, v: number): void => {
    positions.push(point.x, point.y, point.z);
    uvs.push(point.z / UV_UNITS_U, v / UV_UNITS_V);
  };
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const a = rings[ringIndex]!;
    const b = rings[ringIndex + 1]!;
    let perimeter = 0;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const edge = a[index]!.distanceTo(a[next]!);
      const v0 = perimeter;
      const v1 = perimeter + edge;
      perimeter = v1;
      pushVertex(a[index]!, v0);
      pushVertex(b[index]!, v0);
      pushVertex(a[next]!, v1);
      pushVertex(a[next]!, v1);
      pushVertex(b[index]!, v0);
      pushVertex(b[next]!, v1);
    }
  }
  const cap = (ring: Vector3[], facingRear: boolean): void => {
    const center = ring.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(count);
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      const [p1, p2] = facingRear ? [ring[index]!, ring[next]!] : [ring[next]!, ring[index]!];
      pushVertex(center, 0);
      pushVertex(p1, 1);
      pushVertex(p2, 2);
    }
  };
  cap(rings[0]!, true);
  cap(rings[rings.length - 1]!, false);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Point and outward normal on a loft surface, used to seat surface details. */
export function sampleLoftSurface(
  sections: readonly HullSection[],
  outline: Outline,
  z: number,
  face: number,
  along: number,
  position: Vector3,
  normal: Vector3,
): void {
  let upper = sections.findIndex((section) => section.z >= z);
  if (upper <= 0) upper = Math.max(1, upper === -1 ? sections.length - 1 : 1);
  const a = sections[upper - 1]!;
  const b = sections[upper]!;
  const t = Math.min(1, Math.max(0, (z - a.z) / Math.max(0.0001, b.z - a.z)));
  const section: HullSection = {
    z,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
    y: a.y + (b.y - a.y) * t,
    x: (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * t,
  };
  const ring = outline(section);
  const p0 = ring[face % ring.length]!;
  const p1 = ring[(face + 1) % ring.length]!;
  position.set(
    p0[0] + (p1[0] - p0[0]) * along + (section.x ?? 0),
    p0[1] + (p1[1] - p0[1]) * along + section.y,
    z,
  );
  // Clockwise outline seen from the nose: the outward normal is the edge turned left.
  normal.set(-(p1[1] - p0[1]), p1[0] - p0[0], 0).normalize();
}

/** Mirrors a non-indexed geometry across X while keeping faces outward. */
export function mirrorX(source: BufferGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.scale(-1, 1, 1);
  for (const name of ['position', 'uv', 'normal'] as const) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const size = attribute.itemSize;
    const array = attribute.array as Float32Array;
    for (let triangle = 0; triangle < attribute.count; triangle += 3) {
      for (let component = 0; component < size; component += 1) {
        const first = (triangle + 1) * size + component;
        const second = (triangle + 2) * size + component;
        const value = array[first]!;
        array[first] = array[second]!;
        array[second] = value;
      }
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Normalises any primitive to the attribute set merged ship parts share. */
export function prepareForMerge(
  source: BufferGeometry,
  uvScaleU = 1,
  uvScaleV = 1,
): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
  }
  const uv = geometry.getAttribute('uv');
  if (uv && (uvScaleU !== 1 || uvScaleV !== 1)) {
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, uv.getX(index) * uvScaleU, uv.getY(index) * uvScaleV);
    }
  }
  geometry.clearGroups();
  geometry.computeVertexNormals();
  return geometry;
}
