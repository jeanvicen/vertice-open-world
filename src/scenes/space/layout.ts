import { Vector3 } from 'three';

/**
 * World layout for the opening, in scene units (roughly ten metres each). The camera settles
 * at the origin looking down -Z; everything celestial is placed relative to that final framing.
 */
export const PLANET_CENTER = new Vector3(1250, -900, -3300);
export const PLANET_RADIUS = 1500;
export const ATMOSPHERE_RADIUS = PLANET_RADIUS * 1.04;

export const MOON_CENTER = new Vector3(2650, 1450, -4900);
export const MOON_RADIUS = 70;

/** Stars and sky sit beyond the planet so they can never draw in front of it. */
export const STAR_RADIUS_MIN = 5200;
export const STAR_RADIUS_MAX = 7600;
export const SKY_RADIUS = 9000;
export const CAMERA_FAR = 12000;

/** The star rises from just behind the planet's upper-left limb. */
const LIMB_DIRECTION = new Vector3(-0.66, 0.75, 0).normalize();
const LIMB_POINT = PLANET_CENTER.clone().addScaledVector(LIMB_DIRECTION, PLANET_RADIUS * 0.985);
export const SUN_DIRECTION = LIMB_POINT.clone().normalize();
export const SUN_DISTANCE = 8200;
export const SUN_POSITION = SUN_DIRECTION.clone().multiplyScalar(SUN_DISTANCE);
/**
 * Direction from the planet towards the star; shared by every lit surface. Turned slightly
 * towards the camera (an authored cheat of a few degrees) so the crescent is wide enough to
 * show the cloud bands instead of reading as a thin line.
 */
export const PLANET_LIGHT_DIRECTION = SUN_POSITION.clone()
  .sub(PLANET_CENTER)
  .normalize()
  .add(new Vector3(0, 0, 0.3))
  .normalize();

export const SUN_COLOR = new Vector3(1.0, 0.9, 0.78);
export const ATMOSPHERE_COLOR = new Vector3(0.36, 0.55, 0.92);
