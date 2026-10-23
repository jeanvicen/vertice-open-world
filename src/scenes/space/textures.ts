import {
  CanvasTexture,
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { PLANET_CENTER, PLANET_RADIUS, SUN_DIRECTION } from './layout';

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Soft radial falloff used by every small light source (engines, beacons, the star). */
export function createGlowTexture(size = 128): CanvasTexture {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable for procedural textures.');
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.08, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.24)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A small HDR panorama of this scene's lighting (star, planet bounce, black sky) so metal
 * surfaces reflect the world they are in. Three converts it to a PMREM on first use and
 * rebuilds that conversion after a WebGL context restore.
 */
export function createEnvironmentTexture(width = 256, height = 128): DataTexture {
  const data = new Uint16Array(width * height * 4);
  const direction = new Vector3();
  const planetDirection = PLANET_CENTER.clone().normalize();
  const planetAngularRadius = Math.asin(PLANET_RADIUS / PLANET_CENTER.length());
  for (let y = 0; y < height; y += 1) {
    const theta = ((y + 0.5) / height - 0.5) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const phi = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      direction.set(
        Math.cos(theta) * Math.cos(phi),
        Math.sin(theta),
        Math.cos(theta) * Math.sin(phi),
      );
      const sunDot = Math.max(0, direction.dot(SUN_DIRECTION));
      const sun = 18 * sunDot ** 900 + 1.1 * sunDot ** 24 + 0.1 * sunDot ** 3;
      const planetAngle = Math.acos(Math.min(1, Math.max(-1, direction.dot(planetDirection))));
      const onPlanet = planetAngle < planetAngularRadius ? 1 : 0;
      const limb = onPlanet * Math.max(0, 1 - (planetAngularRadius - planetAngle) / 0.08);
      const sunSide = Math.max(
        0,
        direction.clone().sub(planetDirection).normalize().dot(SUN_DIRECTION),
      );
      const r = 0.003 + sun * 1.0 + onPlanet * 0.018 + limb * sunSide * 0.5;
      const g = 0.004 + sun * 0.9 + onPlanet * 0.024 + limb * sunSide * 0.62;
      const b = 0.007 + sun * 0.78 + onPlanet * 0.04 + limb * sunSide * 0.9;
      const index = (y * width + x) * 4;
      data[index] = DataUtils.toHalfFloat(r);
      data[index + 1] = DataUtils.toHalfFloat(g);
      data[index + 2] = DataUtils.toHalfFloat(b);
      data[index + 3] = DataUtils.toHalfFloat(1);
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
  texture.mapping = EquirectangularReflectionMapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
