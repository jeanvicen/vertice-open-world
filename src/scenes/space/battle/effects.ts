import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Vector3,
} from 'three';
import type { ResourceTracker } from '../../../rendering/ResourceTracker';
import { NOISE_GLSL } from '../glsl';

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

function dynamic(array: Float32Array, size: number): InstancedBufferAttribute {
  const attribute = new InstancedBufferAttribute(array, size);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

/**
 * Small world-sized light points (engine glows, sparks, muzzle flashes) in one draw call.
 * Each frame is rebuilt from scratch with `begin()` / `push()` / `end()`.
 */
export class GlowPoints {
  public readonly object: Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly material: ShaderMaterial;
  private count = 0;

  public constructor(
    resources: ResourceTracker,
    private readonly capacity: number,
  ) {
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    const geometry = resources.track(new BufferGeometry());
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('aColor', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
    this.material = resources.track(
      new ShaderMaterial({
        uniforms: { uViewportScale: { value: 500 } },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          attribute float aSize;
          uniform float uViewportScale;
          varying vec3 vColor;
          void main() {
            vec4 view = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(aSize * uViewportScale / max(-view.z, 0.1), 0.0, 96.0);
            vColor = aColor;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float intensity = exp(-r * r * 5.0) + 0.7 * exp(-r * r * 38.0);
            gl_FragColor = vec4(vColor * intensity * smoothstep(1.0, 0.75, r), 1.0);
            ${OUTPUT}
          }
        `,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.object = new Points(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  public setViewportScale(scale: number): void {
    this.material.uniforms.uViewportScale!.value = scale;
  }

  public begin(): void {
    this.count = 0;
  }

  public push(position: Vector3, r: number, g: number, b: number, size: number): void {
    if (this.count >= this.capacity || size <= 0) return;
    const i = this.count;
    position.toArray(this.positions, i * 3);
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.sizes[i] = size;
    this.count += 1;
  }

  public end(): void {
    const geometry = this.object.geometry;
    geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'aColor', 'aSize']) {
      const attribute = geometry.getAttribute(name) as BufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

/** Energy bolts as camera-facing ribbons from tail to head, HDR so bloom can pick them up. */
export class LaserBatch {
  public readonly object: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly tails: Float32Array;
  private readonly heads: Float32Array;
  private readonly colors: Float32Array;
  private readonly widths: Float32Array;
  private count = 0;

  public constructor(
    resources: ResourceTracker,
    private readonly capacity: number,
  ) {
    this.tails = new Float32Array(capacity * 3);
    this.heads = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.widths = new Float32Array(capacity);
    const geometry = (this.geometry = resources.track(new InstancedBufferGeometry()));
    // x: 0 at the tail, 1 at the head; y: -1..1 across the ribbon.
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aTail', dynamic(this.tails, 3));
    geometry.setAttribute('aHead', dynamic(this.heads, 3));
    geometry.setAttribute('aColor', dynamic(this.colors, 3));
    geometry.setAttribute('aWidth', dynamic(this.widths, 1));
    const material = resources.track(
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec3 aTail;
          attribute vec3 aHead;
          attribute vec3 aColor;
          attribute float aWidth;
          varying vec2 vRibbon;
          varying vec3 vColor;
          void main() {
            vec3 axis = aHead - aTail;
            vec3 point = aTail + axis * position.x;
            vec3 toCamera = normalize(cameraPosition - point);
            vec3 side = normalize(cross(axis, toCamera) + vec3(1e-5));
            point += side * position.y * aWidth;
            vRibbon = position.xy;
            vColor = aColor;
            gl_Position = projectionMatrix * viewMatrix * vec4(point, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vRibbon;
          varying vec3 vColor;
          void main() {
            float across = exp(-vRibbon.y * vRibbon.y * 5.0);
            float core = exp(-vRibbon.y * vRibbon.y * 40.0);
            float along = mix(0.15, 1.0, vRibbon.x) * smoothstep(1.0, 0.92, vRibbon.x * 0.9 + 0.1);
            vec3 color = (vColor * across + vec3(core) * 2.0) * along;
            gl_FragColor = vec4(color, 1.0);
            ${OUTPUT}
          }
        `,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.object = new Mesh(geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }

  public begin(): void {
    this.count = 0;
  }

  public push(tail: Vector3, head: Vector3, r: number, g: number, b: number, width: number): void {
    if (this.count >= this.capacity) return;
    const i = this.count;
    tail.toArray(this.tails, i * 3);
    head.toArray(this.heads, i * 3);
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.widths[i] = width;
    this.count += 1;
  }

  public end(): void {
    this.geometry.instanceCount = this.count;
    for (const name of ['aTail', 'aHead', 'aColor', 'aWidth']) {
      const attribute = this.geometry.getAttribute(name) as InstancedBufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

export type BillboardStyle = 'fire' | 'glow';

/**
 * Camera-facing quads drawn by a procedural shader. The "fire" style is a turbulent fireball
 * that cools into smoke (normal blending); "glow" draws flashes and shockwave rings (additive).
 */
export class BillboardBatch {
  public readonly object: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly centers: Float32Array;
  private readonly params: Float32Array;
  private readonly colors: Float32Array;
  private readonly material: ShaderMaterial;
  private count = 0;

  public constructor(
    resources: ResourceTracker,
    private readonly capacity: number,
    style: BillboardStyle,
  ) {
    this.centers = new Float32Array(capacity * 3);
    // x: size, y: age 0–1, z: seed, w: shape (0 flash, 1 ring) for glow
    this.params = new Float32Array(capacity * 4);
    this.colors = new Float32Array(capacity * 3);
    const geometry = (this.geometry = resources.track(new InstancedBufferGeometry()));
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute('aCenter', dynamic(this.centers, 3));
    geometry.setAttribute('aParams', dynamic(this.params, 4));
    geometry.setAttribute('aColor', dynamic(this.colors, 3));
    this.material = resources.track(
      new ShaderMaterial({
        uniforms: { uOctaves: { value: 4 } },
        vertexShader: /* glsl */ `
          attribute vec3 aCenter;
          attribute vec4 aParams;
          attribute vec3 aColor;
          varying vec2 vUv;
          varying vec4 vParams;
          varying vec3 vColor;
          void main() {
            vec4 view = viewMatrix * vec4(aCenter, 1.0);
            view.xy += position.xy * aParams.x;
            vUv = position.xy;
            vParams = aParams;
            vColor = aColor;
            gl_Position = projectionMatrix * view;
          }
        `,
        fragmentShader: style === 'fire' ? FIRE_FRAGMENT : GLOW_FRAGMENT,
        blending: style === 'fire' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.object = new Mesh(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = style === 'fire' ? 6 : 7;
  }

  public setOctaves(octaves: number): void {
    this.material.uniforms.uOctaves!.value = octaves;
  }

  public begin(): void {
    this.count = 0;
  }

  public push(
    center: Vector3,
    size: number,
    age: number,
    seed: number,
    shape: number,
    r = 1,
    g = 1,
    b = 1,
  ): void {
    if (this.count >= this.capacity) return;
    const i = this.count;
    center.toArray(this.centers, i * 3);
    this.params[i * 4] = size;
    this.params[i * 4 + 1] = age;
    this.params[i * 4 + 2] = seed;
    this.params[i * 4 + 3] = shape;
    this.colors[i * 3] = r;
    this.colors[i * 3 + 1] = g;
    this.colors[i * 3 + 2] = b;
    this.count += 1;
  }

  public end(): void {
    this.geometry.instanceCount = this.count;
    for (const name of ['aCenter', 'aParams', 'aColor']) {
      const attribute = this.geometry.getAttribute(name) as InstancedBufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }
}

const FIRE_FRAGMENT = /* glsl */ `
uniform int uOctaves;
varying vec2 vUv;
varying vec4 vParams;
varying vec3 vColor;
${NOISE_GLSL}
void main() {
  float age = vParams.y;
  float seed = vParams.z;
  float r = length(vUv);
  // Billowing edge: noise in polar-ish space that slowly rolls outwards with age.
  vec3 p = vec3(vUv * 2.1, seed * 17.0 + age * 1.6);
  float n = fbm(p, uOctaves);
  float boundary = 0.52 + 0.4 * n;
  float body = smoothstep(boundary, boundary - 0.28, r);
  if (body <= 0.001) discard;
  // Heat falls with age and towards the edge; the core stays hottest longest.
  float heat = clamp((1.0 - age * 1.25) * (1.15 - r / boundary) + (n - 0.5) * 0.5, 0.0, 1.0);
  vec3 smoke = vec3(0.028, 0.026, 0.026) * (0.6 + n);
  vec3 ember = vec3(0.9, 0.16, 0.03);
  vec3 flame = vec3(2.6, 0.95, 0.22);
  vec3 core = vec3(6.0, 4.6, 2.8);
  vec3 color = smoke;
  color = mix(color, ember, smoothstep(0.05, 0.3, heat));
  color = mix(color, flame, smoothstep(0.3, 0.62, heat));
  color = mix(color, core, smoothstep(0.62, 0.95, heat));
  float alpha = body * (1.0 - smoothstep(0.55, 1.0, age)) * mix(0.75, 1.0, heat);
  gl_FragColor = vec4(color, alpha);
  ${OUTPUT}
}
`;

const GLOW_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vParams;
varying vec3 vColor;
void main() {
  float r = length(vUv);
  float age = vParams.y;
  float intensity;
  if (vParams.w > 0.5) {
    // Shockwave: a thin bright band that thins out as it expands.
    float width = mix(0.025, 0.07, age);
    intensity = exp(-pow((r - 0.86) / width, 2.0)) * (1.0 - age) * (1.0 - age);
  } else {
    intensity = (exp(-r * r * 9.0) * 2.4 + exp(-r * r * 2.2) * 0.5) * (1.0 - age);
  }
  intensity *= smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(vColor * intensity, 1.0);
  ${OUTPUT}
}
`;
