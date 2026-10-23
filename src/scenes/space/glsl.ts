/** Hash-based 3D value noise and fractal sum shared by the procedural sky and bodies. */
export const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

const mat3 NOISE_ROTATION = mat3(
  -0.9722, -0.2343, 0.0005,
  0.0818, -0.3413, -0.9364,
  0.2196, -0.9103, 0.3509
);

float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amplitude * valueNoise(p);
    total += amplitude;
    p = NOISE_ROTATION * p * 2.07 + vec3(3.1, 1.7, 5.3);
    amplitude *= 0.5;
  }
  return sum / max(total, 0.0001);
}
`;
