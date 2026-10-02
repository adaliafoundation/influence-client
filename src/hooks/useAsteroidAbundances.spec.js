import { renderHook } from '@testing-library/react';
import { Asteroid } from '@influenceth/sdk';
import useAsteroidAbundances from './useAsteroidAbundances';

jest.mock('@influenceth/sdk', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('@influenceth/sdk');
});

jest.mock('~/lib/utils', () => ({ keyify: (value) => value.replace(/ /g, '') }), { virtual: true });

const asteroid = {
  Celestial: { celestialType: 1, bonuses: 0, scanStatus: Asteroid.SCAN_STATUSES.SURFACE_SCANNED }
};

afterEach(() => jest.restoreAllMocks());

test.each(Object.keys(Asteroid.SPECTRAL_TYPES).map(Number))(
  'previews celestial type %i without calculating or revealing abundances', (celestialType) => {
    const getAbundances = jest.spyOn(Asteroid.Entity, 'getAbundances');
    const { result } = renderHook(() => useAsteroidAbundances({
      Celestial: { ...asteroid.Celestial, celestialType }
    }, { includeUnscanned: true }));
    const resources = result.current.flatMap((group) => group.resources);
    expect(resources.map(({ i }) => Number(i)).sort((a, b) => a - b))
      .toEqual([...Asteroid.SPECTRAL_TYPES[celestialType].resources].sort((a, b) => a - b));
    expect(resources.every(({ abundance }) => abundance === null)).toBe(true);
    expect(result.current.every(({ abundance }) => abundance === null)).toBe(true);
    expect(getAbundances).not.toHaveBeenCalled();
  }
);

test('keeps previews opt-in and reveals distributions when the scan completes', () => {
  const getAbundances = jest.spyOn(Asteroid.Entity, 'getAbundances').mockReturnValue({ 1: 0.25, 6: 0.75 });
  const { result, rerender } = renderHook(({ value }) => useAsteroidAbundances(value), {
    initialProps: { value: asteroid }
  });
  expect(result.current).toEqual([]);
  expect(getAbundances).not.toHaveBeenCalled();
  rerender({ value: { Celestial: { ...asteroid.Celestial, scanStatus: Asteroid.SCAN_STATUSES.RESOURCE_SCANNED } } });
  expect(result.current.flatMap((group) => group.resources).map(({ abundance }) => abundance).sort())
    .toEqual([0.25, 0.75]);
});
