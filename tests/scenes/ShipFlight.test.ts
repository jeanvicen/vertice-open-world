import { describe, expect, it } from 'vitest';
import {
  BATTLE_CENTER,
  createShipState,
  flightDistance,
  ShipFlight,
  WARP_EXIT,
  WARP_SECONDS,
} from '../../src/scenes/space/ShipFlight';

const DEPARTURE_DELAY = 8;

describe('ShipFlight', () => {
  it('travels forward only, without jumps in speed', () => {
    let previous = flightDistance(0.01, DEPARTURE_DELAY);
    let previousSpeed = previous / 0.01;
    for (let t = 0.02; t < 20; t += 0.01) {
      const distance = flightDistance(t, DEPARTURE_DELAY);
      const speed = (distance - previous) / 0.01;
      expect(distance).toBeGreaterThanOrEqual(previous);
      expect(Math.abs(speed - previousSpeed)).toBeLessThan(1);
      previous = distance;
      previousSpeed = speed;
    }
  });

  it('is hidden before the warp, streaks in, then flies through the battle', () => {
    const flight = new ShipFlight(DEPARTURE_DELAY);
    const state = createShipState();
    flight.sample(-1, 0, state);
    expect(state.visible).toBe(false);
    flight.sample(WARP_SECONDS / 2, 0, state);
    expect(state.visible).toBe(true);
    expect(state.warping).toBe(true);
    flight.sample(WARP_SECONDS, 0, state);
    expect(state.position.distanceTo(WARP_EXIT)).toBeLessThan(0.5);
    flight.sample(WARP_SECONDS + 3, 0, state);
    expect(state.warping).toBe(false);
    expect(state.position.distanceTo(BATTLE_CENTER)).toBeLessThan(120);
  });

  it('departs into the distance and disappears', () => {
    const flight = new ShipFlight(DEPARTURE_DELAY);
    const state = createShipState();
    flight.sample(WARP_SECONDS + DEPARTURE_DELAY + 6, 0, state);
    expect(state.position.length()).toBeGreaterThan(800);
    flight.sample(120, 0, state);
    expect(state.visible).toBe(false);
  });

  it('samples identically for the same time', () => {
    const flight = new ShipFlight(DEPARTURE_DELAY);
    const a = createShipState();
    const b = createShipState();
    flight.sample(5.5, 2, a);
    flight.sample(5.5, 2, b);
    expect(a.position.equals(b.position)).toBe(true);
    expect(a.quaternion.equals(b.quaternion)).toBe(true);
  });
});
