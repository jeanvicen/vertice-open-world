import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createShipState, flightDistance, ShipFlight } from '../../src/scenes/space/ShipFlight';

describe('ShipFlight', () => {
  it('travels forward only, without jumps in speed', () => {
    let previous = flightDistance(0.01);
    let previousSpeed = previous / 0.01;
    for (let t = 0.02; t < 20; t += 0.01) {
      const distance = flightDistance(t);
      const speed = (distance - previous) / 0.01;
      expect(distance).toBeGreaterThanOrEqual(previous);
      expect(Math.abs(speed - previousSpeed)).toBeLessThan(1);
      previous = distance;
      previousSpeed = speed;
    }
  });

  it('is hidden before entry, visible while overtaking, and gone after the path', () => {
    const flight = new ShipFlight();
    const state = createShipState();
    flight.sample(-1, 0, state);
    expect(state.visible).toBe(false);
    flight.sample(3, 0, state);
    expect(state.visible).toBe(true);
    expect(state.hullFade).toBe(1);
    flight.sample(60, 0, state);
    expect(state.visible).toBe(false);
  });

  it('passes close to the camera, then recedes deep into the scene', () => {
    const flight = new ShipFlight();
    const state = createShipState();
    let closest = Number.POSITIVE_INFINITY;
    for (let t = 0; t < 6; t += 0.05) {
      flight.sample(t, 0, state);
      closest = Math.min(closest, state.position.distanceTo(new Vector3(0, 0, 10)));
    }
    expect(closest).toBeLessThan(20);
    flight.sample(12, 0, state);
    expect(state.position.z).toBeLessThan(-800);
  });

  it('samples identically for the same time', () => {
    const flight = new ShipFlight();
    const a = createShipState();
    const b = createShipState();
    flight.sample(5.5, 2, a);
    flight.sample(5.5, 2, b);
    expect(a.position.equals(b.position)).toBe(true);
    expect(a.quaternion.equals(b.quaternion)).toBe(true);
  });
});
