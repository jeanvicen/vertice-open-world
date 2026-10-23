import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector3,
} from 'three';
import type { RenderProfile } from '../../rendering/quality';
import type { ResourceTracker } from '../../rendering/ResourceTracker';
import { NOISE_GLSL } from './glsl';
import {
  ATMOSPHERE_COLOR,
  ATMOSPHERE_RADIUS,
  MOON_CENTER,
  MOON_RADIUS,
  PLANET_CENTER,
  PLANET_LIGHT_DIRECTION,
  PLANET_RADIUS,
  SKY_RADIUS,
  STAR_RADIUS_MAX,
  STAR_RADIUS_MIN,
  SUN_COLOR,
  SUN_DIRECTION,
  SUN_POSITION,
} from './layout';
import { createRandom } from './random';

const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
`;

/** The plane of the galaxy, seen as a faint diagonal band across the sky. */
const GALACTIC_NORMAL = new Vector3(0.42, 0.78, 0.46).normalize();
const MAX_STARS = 9000;
const MAX_DUST = 340;
/** Dust wraps inside this box around the camera so it never runs out. */
const DUST_VOLUME = new Vector3(110, 56, 220);

export interface CosmosReveal {
  readonly sky: number;
  /** 0 to about 1.4: stars appear in a staggered order, brightest first. */
  readonly stars: number;
  readonly bodies: number;
  readonly dust: number;
}

/** Background layers of the opening: sky, stars, dust, planet, moon and the star itself. */
export class Cosmos {
  public readonly root = new Group();
  private readonly skyMaterial: ShaderMaterial;
  private readonly sky: Mesh;
  private readonly starMaterial: ShaderMaterial;
  private readonly stars: Points;
  private readonly dustMaterial: ShaderMaterial;
  private readonly dust: Points;
  private readonly planet: Mesh;
  private readonly planetMaterial: ShaderMaterial;
  private readonly atmosphereMaterial: ShaderMaterial;
  private readonly moonMaterial: ShaderMaterial;
  private readonly sunGlow: Sprite;
  private readonly sunCore: Sprite;

  public constructor(resources: ResourceTracker, glowTexture: Texture, profile: RenderProfile) {
    const lightDirection = PLANET_LIGHT_DIRECTION.clone();
    const sunColor = new Color(SUN_COLOR.x, SUN_COLOR.y, SUN_COLOR.z);
    const atmosphereColor = new Color(ATMOSPHERE_COLOR.x, ATMOSPHERE_COLOR.y, ATMOSPHERE_COLOR.z);

    this.skyMaterial = resources.track(
      new ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uOctaves: { value: profile.skyOctaves },
          uSunDir: { value: SUN_DIRECTION.clone() },
          uSunColor: { value: sunColor },
          uBandNormal: { value: GALACTIC_NORMAL },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        dithering: true,
      }),
    );
    this.sky = new Mesh(resources.track(new SphereGeometry(SKY_RADIUS, 160, 80)), this.skyMaterial);
    this.sky.renderOrder = -20;
    this.sky.frustumCulled = false;
    this.root.add(this.sky);

    this.starMaterial = resources.track(
      new ShaderMaterial({
        uniforms: { uReveal: { value: 0 }, uPixelRatio: { value: 1 } },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.stars = new Points(resources.track(createStarGeometry()), this.starMaterial);
    this.stars.renderOrder = -10;
    this.stars.frustumCulled = false;
    this.root.add(this.stars);

    this.planetMaterial = resources.track(
      new ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uOctaves: { value: profile.surfaceOctaves },
          uTime: { value: 0 },
          uLightDir: { value: lightDirection },
          uSunColor: { value: sunColor },
          uAtmoColor: { value: atmosphereColor },
        },
        vertexShader: BODY_VERTEX,
        fragmentShader: PLANET_FRAGMENT,
        dithering: true,
      }),
    );
    this.planet = new Mesh(
      resources.track(new SphereGeometry(PLANET_RADIUS, 160, 112)),
      this.planetMaterial,
    );
    this.planet.position.copy(PLANET_CENTER);
    // Tilted axis: the cloud bands cross the crescent diagonally instead of flat.
    this.planet.rotation.set(0.18, 0, -0.42);
    this.root.add(this.planet);

    this.atmosphereMaterial = resources.track(
      new ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uCenter: { value: PLANET_CENTER.clone() },
          uRadius: { value: PLANET_RADIUS },
          uAtmoRadius: { value: ATMOSPHERE_RADIUS },
          uLightDir: { value: lightDirection },
          uSunColor: { value: sunColor },
          uAtmoColor: { value: atmosphereColor },
        },
        vertexShader: BODY_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        side: BackSide,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    const atmosphere = new Mesh(
      resources.track(new SphereGeometry(ATMOSPHERE_RADIUS, 128, 96)),
      this.atmosphereMaterial,
    );
    atmosphere.position.copy(PLANET_CENTER);
    this.root.add(atmosphere);

    this.moonMaterial = resources.track(
      new ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uOctaves: { value: profile.surfaceOctaves },
          uLightDir: { value: SUN_POSITION.clone().sub(MOON_CENTER).normalize() },
          uSunColor: { value: sunColor },
        },
        vertexShader: BODY_VERTEX,
        fragmentShader: MOON_FRAGMENT,
        dithering: true,
      }),
    );
    const moon = new Mesh(
      resources.track(new SphereGeometry(MOON_RADIUS, 64, 40)),
      this.moonMaterial,
    );
    moon.position.copy(MOON_CENTER);
    this.root.add(moon);

    const glowMaterial = resources.track(
      new SpriteMaterial({
        map: glowTexture,
        color: new Color(1.0, 0.86, 0.68),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    this.sunGlow = new Sprite(glowMaterial);
    this.sunGlow.scale.setScalar(2900);
    this.sunGlow.position.copy(SUN_POSITION);
    this.root.add(this.sunGlow);
    const coreMaterial = resources.track(
      new SpriteMaterial({
        map: glowTexture,
        color: new Color(4.0, 3.6, 3.1),
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      }),
    );
    this.sunCore = new Sprite(coreMaterial);
    this.sunCore.scale.setScalar(260);
    this.sunCore.position.copy(SUN_POSITION);
    this.root.add(this.sunCore);

    this.dustMaterial = resources.track(
      new ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uPixelRatio: { value: 1 },
          uTime: { value: 0 },
          uCameraPosition: { value: new Vector3() },
          uVolume: { value: DUST_VOLUME },
          uSunDir: { value: SUN_DIRECTION.clone() },
        },
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.dust = new Points(resources.track(createDustGeometry()), this.dustMaterial);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);

    this.applyProfile(profile);
  }

  public applyProfile(profile: RenderProfile): void {
    this.stars.geometry.setDrawRange(0, Math.min(MAX_STARS, profile.starCount));
    this.dust.geometry.setDrawRange(0, Math.min(MAX_DUST, profile.dustCount));
    this.skyMaterial.uniforms.uOctaves!.value = profile.skyOctaves;
    this.planetMaterial.uniforms.uOctaves!.value = profile.surfaceOctaves;
    this.moonMaterial.uniforms.uOctaves!.value = Math.min(4, profile.surfaceOctaves);
  }

  /** Point sprites are sized in device pixels, so they follow the renderer's pixel ratio. */
  public setPixelRatio(pixelRatio: number): void {
    this.starMaterial.uniforms.uPixelRatio!.value = pixelRatio;
    this.dustMaterial.uniforms.uPixelRatio!.value = pixelRatio;
  }

  public update(timeSeconds: number, cameraPosition: Vector3, reveal: CosmosReveal): void {
    this.sky.position.copy(cameraPosition);
    this.skyMaterial.uniforms.uReveal!.value = reveal.sky;
    this.starMaterial.uniforms.uReveal!.value = reveal.stars;
    this.planetMaterial.uniforms.uReveal!.value = reveal.bodies;
    this.planetMaterial.uniforms.uTime!.value = timeSeconds;
    this.atmosphereMaterial.uniforms.uReveal!.value = reveal.bodies;
    this.moonMaterial.uniforms.uReveal!.value = reveal.bodies;
    this.sunGlow.material.opacity = 0.32 * reveal.bodies;
    this.sunCore.material.opacity = reveal.bodies;
    // Very slow axial rotation: alive, never distracting.
    this.planet.rotation.y = timeSeconds * 0.0035;
    this.dustMaterial.uniforms.uReveal!.value = reveal.dust;
    this.dustMaterial.uniforms.uTime!.value = timeSeconds;
    (this.dustMaterial.uniforms.uCameraPosition!.value as Vector3).copy(cameraPosition);
  }
}

/** Stars are sorted brightest first, so a lower tier's draw range keeps the strongest ones. */
function createStarGeometry(): BufferGeometry {
  const random = createRandom(0x5eed01);
  const stars: Array<{ position: Vector3; color: Vector3; size: number; brightness: number }> = [];
  const direction = new Vector3();
  while (stars.length < MAX_STARS) {
    direction.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
    const lengthSq = direction.lengthSq();
    if (lengthSq > 1 || lengthSq < 0.0001) continue;
    direction.normalize();
    const band = Math.exp(-(direction.dot(GALACTIC_NORMAL) ** 2) * 10);
    // Denser along the galactic band and in loose clusters elsewhere.
    if (random() > 0.32 + 0.68 * band) continue;
    const magnitude = random() ** 7;
    const brightness = 0.05 + 1.9 * magnitude + 0.12 * random() * band;
    const temperature = random();
    const color =
      temperature < 0.14
        ? new Vector3(0.72, 0.81, 1.0)
        : temperature < 0.74
          ? new Vector3(0.93, 0.95, 1.0)
          : temperature < 0.93
            ? new Vector3(1.0, 0.9, 0.76)
            : new Vector3(1.0, 0.76, 0.58);
    const radius = STAR_RADIUS_MIN + (STAR_RADIUS_MAX - STAR_RADIUS_MIN) * random();
    stars.push({
      position: direction.clone().multiplyScalar(radius),
      color: color.multiplyScalar(brightness),
      size: 1.25 + 4.2 * magnitude + random() * 0.5,
      brightness,
    });
  }
  stars.sort((a, b) => b.brightness - a.brightness);
  const positions = new Float32Array(MAX_STARS * 3);
  const colors = new Float32Array(MAX_STARS * 3);
  const sizes = new Float32Array(MAX_STARS);
  const delays = new Float32Array(MAX_STARS);
  stars.forEach((star, index) => {
    star.position.toArray(positions, index * 3);
    star.color.toArray(colors, index * 3);
    sizes[index] = star.size;
    // Brightest stars resolve first as the eye adapts to the dark.
    delays[index] = Math.min(1, (index / MAX_STARS) * 0.8 + random() * 0.25);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aDelay', new BufferAttribute(delays, 1));
  return geometry;
}

function createDustGeometry(): BufferGeometry {
  const random = createRandom(0xd057);
  const positions = new Float32Array(MAX_DUST * 3);
  const sizes = new Float32Array(MAX_DUST);
  for (let index = 0; index < MAX_DUST; index += 1) {
    positions[index * 3] = (random() - 0.5) * DUST_VOLUME.x;
    positions[index * 3 + 1] = (random() - 0.5) * DUST_VOLUME.y;
    positions[index * 3 + 2] = (random() - 0.5) * DUST_VOLUME.z;
    sizes[index] = 0.6 + random() ** 3 * 2.2;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  return geometry;
}

const SKY_VERTEX = /* glsl */ `
uniform int uOctaves;
uniform vec3 uSunDir;
uniform vec3 uBandNormal;
varying vec3 vColor;
varying vec3 vDirection;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(position);
  vDirection = d;
  float b = dot(d, uBandNormal);
  float band = exp(-b * b * 9.0);
  float n1 = fbm(d * 2.3 + vec3(4.0, 1.0, 7.0), uOctaves);
  float n2 = fbm(d * 5.1 + vec3(-2.0, 3.0, 1.0), uOctaves);
  float clouds = smoothstep(0.36, 0.84, n1 * 0.72 + n2 * 0.38);
  float lanes = smoothstep(0.5, 0.74, fbm(d * 8.0 + vec3(9.0), max(uOctaves - 1, 1)));
  float sunward = pow(max(dot(d, uSunDir), 0.0), 2.5);
  vec3 cold = vec3(0.006, 0.011, 0.024);
  vec3 dusk = vec3(0.014, 0.009, 0.006);
  vec3 color = cold * (0.08 + band * 1.5) * clouds + dusk * clouds * sunward * band;
  color *= 1.0 - lanes * 0.75 * band;
  color += vec3(0.0006, 0.0009, 0.0016) * (0.3 + band);
  vColor = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vColor;
varying vec3 vDirection;
#include <common>
#include <dithering_pars_fragment>
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDirection);
  vec3 color = vColor * (0.88 + valueNoise(d * 160.0) * 0.24);
  float s = max(dot(d, uSunDir), 0.0);
  color += uSunColor * (pow(s, 70.0) * 0.05 + pow(s, 9.0) * 0.004);
  gl_FragColor = vec4(color * uReveal, 1.0);
  ${OUTPUT_GLSL}
}
`;

const STAR_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aDelay;
uniform float uReveal;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float appear = clamp((uReveal - aDelay) / 0.4, 0.0, 1.0);
  gl_PointSize = max(aSize * uPixelRatio, 1.0);
  vColor = aColor * appear * appear;
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float intensity = exp(-r * r * 6.5) * smoothstep(1.0, 0.65, r);
  gl_FragColor = vec4(vColor * intensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const DUST_VERTEX = /* glsl */ `
attribute float aSize;
uniform float uReveal;
uniform float uPixelRatio;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform vec3 uVolume;
uniform vec3 uSunDir;
varying float vIntensity;
void main() {
  vec3 drift = vec3(0.22, 0.05, 0.9) * uTime;
  vec3 local = mod(position + drift - uCameraPosition + uVolume * 0.5, uVolume) - uVolume * 0.5;
  vec3 world = uCameraPosition + local;
  vec4 view = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * view;
  float distance = max(-view.z, 0.1);
  gl_PointSize = clamp(aSize * uPixelRatio * 42.0 / distance, 0.0, 7.0 * uPixelRatio);
  // Fade at the volume edges so wrapping particles never pop.
  float edge = 1.0 - smoothstep(0.32, 0.5, max(abs(local.x) / uVolume.x, max(abs(local.y) / uVolume.y, abs(local.z) / uVolume.z)));
  float near = smoothstep(1.5, 6.0, distance);
  float forward = pow(max(dot(normalize(world - uCameraPosition), uSunDir), 0.0), 3.0);
  vIntensity = uReveal * edge * near * (0.05 + forward * 0.32);
}
`;

const DUST_FRAGMENT = /* glsl */ `
varying float vIntensity;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vec3(0.78, 0.82, 0.9) * vIntensity * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const BODY_VERTEX = /* glsl */ `
varying vec3 vObjectPosition;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vObjectPosition = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const PLANET_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform int uOctaves;
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uAtmoColor;
varying vec3 vObjectPosition;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
#include <common>
#include <dithering_pars_fragment>
${NOISE_GLSL}
void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndl = dot(N, uLightDir);
  float fresnel = 1.0 - max(dot(N, V), 0.0);
  float day = smoothstep(-0.2, 0.3, ndl);
  vec3 albedo = vec3(0.05, 0.06, 0.08);
  // The night side is effectively black: skip the expensive cloud bands there.
  if (day > 0.002) {
    vec3 p = normalize(vObjectPosition);
    float warp = fbm(p * 3.2 + vec3(uTime * 0.002, 0.0, 0.0), uOctaves);
    float latitude = p.y + (warp - 0.5) * 0.17;
    float broad = 0.5 + 0.5 * sin(latitude * 11.0 + warp * 2.4);
    float fine = 0.5 + 0.5 * sin(latitude * 47.0 + warp * 6.0);
    float storms = fbm(vec3(p.x * 5.0, p.y * 28.0, p.z * 5.0), uOctaves);
    vec3 deep = vec3(0.07, 0.09, 0.125);
    vec3 pale = vec3(0.42, 0.45, 0.48);
    vec3 sand = vec3(0.47, 0.39, 0.29);
    albedo = mix(deep, pale, broad * 0.6 + storms * 0.4);
    albedo = mix(albedo, sand, smoothstep(0.55, 0.95, fine) * 0.24 * broad);
    albedo *= mix(1.0, 0.55, smoothstep(0.55, 0.92, abs(p.y)));
  }
  float diffuse = max(ndl, 0.0);
  float wrap = smoothstep(-0.14, 0.25, ndl) * 0.1;
  vec3 color = albedo * uSunColor * (diffuse * 2.5 + wrap);
  float forward = pow(max(dot(-V, uLightDir), 0.0), 5.0);
  color += uAtmoColor * pow(fresnel, 3.0) * day * 0.9;
  color += uSunColor * uAtmoColor * pow(fresnel, 5.0) * forward * day * 2.6;
  color += vec3(0.0022, 0.003, 0.0046) * (1.0 - day);
  gl_FragColor = vec4(color * uReveal, 1.0);
  ${OUTPUT_GLSL}
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uAtmoRadius;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uAtmoColor;
varying vec3 vWorldPosition;
void main() {
  vec3 D = normalize(vWorldPosition - cameraPosition);
  vec3 closest = cameraPosition + D * dot(uCenter - cameraPosition, D);
  float height = clamp((length(closest - uCenter) - uRadius) / (uAtmoRadius - uRadius), 0.0, 1.0);
  float density = exp(-height * 4.2) * (1.0 - height);
  vec3 up = normalize(closest - uCenter);
  float lit = smoothstep(-0.3, 0.35, dot(up, uLightDir));
  float forward = pow(max(dot(D, uLightDir), 0.0), 8.0);
  vec3 color = uAtmoColor * density * lit * 0.5 + uSunColor * density * forward * lit * 2.8;
  gl_FragColor = vec4(color * uReveal, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const MOON_FRAGMENT = /* glsl */ `
uniform float uReveal;
uniform int uOctaves;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
varying vec3 vObjectPosition;
varying vec3 vWorldNormal;
#include <common>
#include <dithering_pars_fragment>
${NOISE_GLSL}
void main() {
  vec3 p = normalize(vObjectPosition);
  float maria = fbm(p * 2.6, uOctaves);
  float grit = fbm(p * 14.0, uOctaves);
  vec3 albedo = mix(vec3(0.1, 0.1, 0.105), vec3(0.3, 0.29, 0.28), smoothstep(0.35, 0.7, maria));
  albedo *= 0.8 + grit * 0.4;
  float ndl = max(dot(normalize(vWorldNormal), uLightDir), 0.0);
  vec3 color = albedo * uSunColor * ndl * 2.2 + vec3(0.0015, 0.0018, 0.0025);
  gl_FragColor = vec4(color * uReveal, 1.0);
  ${OUTPUT_GLSL}
}
`;
