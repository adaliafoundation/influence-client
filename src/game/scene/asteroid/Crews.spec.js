/* eslint-disable testing-library/no-node-access -- These assertions inspect Three.js scene objects, not DOM nodes. */
import React from 'react';
import { render } from '@testing-library/react';
import { Group, PerspectiveCamera, Texture, TextureLoader } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useQuery } from '@tanstack/react-query';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import Crews from './Crews';

jest.mock('@react-three/fiber', () => ({ useFrame: jest.fn(), useThree: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useQueryClient: jest.fn() }));
jest.mock('react-router-dom', () => ({ useHistory: jest.fn() }));
jest.mock('@influenceth/sdk', () => ({
  Address: { areEqual: (a, b) => a === b },
  Asteroid: { getLotTravelTimeReal: () => 100, getLotDistance: () => 1 },
  Crewmate: { ABILITY_IDS: {} }, Entity: {}, Lot: { toIndex: value => value }
}));
jest.mock('~/game/Postprocessor', () => ({ BLOOM_LAYER: 1 }), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => () => 100, { virtual: true });
jest.mock('~/hooks/useGetActivityConfig', () => () => () => ({ visitedLot: 2 }), { virtual: true });
jest.mock('~/lib/activities', () => ({ __esModule: true, default: {} }), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/spriteUtils', () => ({ getCrewmateSpriteImageUrl: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  getCrewAbilityBonuses: () => ({ totalBonus: 1 }),
  locationsArrToObj: () => ({ asteroidId: 1, lotIndex: 1 })
}), { virtual: true });
jest.mock('~/theme', () => ({ colors: { glowGreen: '#00ff00', success: '#00ff00' } }), { virtual: true });
jest.mock('~/hooks/useStore', () => selector => selector({ gameplay: { activeCrewsDisplay: 'all' } }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('./shaders/delivery.frag', () => '');
jest.mock('./shaders/delivery.vert', () => '');

test('removes moving crew meshes on logout even while activity and crew data remain cached', () => {
  const scene = new Group();
  const crew = { id: 7, Crew: { lastReadyAt: 0, readyAt: 200, delegatedTo: '0x1' }, Location: { locations: [] } };
  const activity = { data: { crew }, event: { name: 'CrewStationed', timestamp: 0 } };
  const textureSpy = jest.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => new Texture());
  useThree.mockReturnValue({ scene, gl: { domElement: document.createElement('canvas') } });
  useSession.mockReturnValue({ accountAddress: '0x1' });
  useCrewContext.mockReturnValue({ crew, crewMovementActivity: activity });
  useQuery.mockReturnValue({ data: [activity] });
  const props = { asteroidId: 1, radius: 1000, getLotPosition: lot => [1000, lot, 0] };
  const view = render(<Crews {...props} />);
  const main = scene.children[0];
  const oldHoppers = main.children.find(node => node.isInstancedMesh);
  expect(oldHoppers.count).toBe(1);

  useSession.mockReturnValue({ accountAddress: null });
  view.rerender(<Crews {...props} />);
  expect(main.children).not.toContain(oldHoppers);
  expect(main.children.find(node => node.isInstancedMesh).count).toBe(0);
  main.children.filter(node => node.isGroup).forEach(marker => {
    marker.children.forEach(sprite => expect(sprite.material.opacity).toBe(0));
  });
  main.children.filter(node => node.isLine).forEach(arc => {
    expect(Array.from(arc.geometry.attributes.position.array).every(value => value === 0)).toBe(true);
  });
  expect(useQuery.mock.calls.at(-1)[0].enabled).toBe(false);

  useSession.mockReturnValue({ accountAddress: '0x1' });
  view.rerender(<Crews {...props} />);
  expect(main.children.find(node => node.isInstancedMesh).count).toBe(1);
  view.unmount();
  expect(scene.children).toHaveLength(0);
  textureSpy.mockRestore();
});

test.each(['buildingId', 'shipId'])('keeps the stationed crew marker at its lot in a %s', (stationType) => {
  const scene = new Group();
  const textureSpy = jest.spyOn(TextureLoader.prototype, 'load').mockImplementation(() => new Texture());
  const crew = { id: 7, _location: { asteroidId: 1, lotIndex: 3, [stationType]: 10 } };
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 11000);
  useThree.mockReturnValue({ scene, controls: { object: camera }, gl: { domElement: document.createElement('canvas') } });
  useSession.mockReturnValue({ accountAddress: '0x1' });
  useCrewContext.mockReturnValue({ crew });
  useQuery.mockReturnValue({ data: [] });
  const props = { asteroidId: 1, radius: 1000, getLotPosition: lot => [1000, lot, 0] };
  const view = render(<Crews {...props} />);
  const main = scene.children[0];
  const marker = main.children.find(node => node.isGroup);
  useFrame.mock.calls.at(-1)[0]({});
  expect(marker.children[0].material.opacity).toBe(1);
  expect(marker.position.x).toBe(1000);
  expect(marker.position.y).toBeGreaterThan(3);
  expect(marker.scale.x).toBe(1);
  const initialHeight = marker.position.y;

  // Advance the camera without rerendering, as an animated zoom does.
  camera.position.z = 3500;
  useFrame.mock.calls.at(-1)[0]({});
  expect(marker.scale.x).toBe(0.5);
  expect(marker.position.y - 3).toBeCloseTo((initialHeight - 3) / 2);

  camera.position.z = 900;
  useFrame.mock.calls.at(-1)[0]({});
  expect(marker.scale.x).toBe(0.2625);

  camera.position.z = 101000;
  useFrame.mock.calls.at(-1)[0]({});
  expect(marker.scale.x).toBe(1.6);
  expect(main.children.find(node => node.isInstancedMesh).count).toBe(0);

  useCrewContext.mockReturnValue({ crew: { ...crew, _location: { asteroidId: 2, lotIndex: 3 } } });
  view.rerender(<Crews {...props} />);
  expect(marker.children[0].material.opacity).toBe(0);

  useCrewContext.mockReturnValue({ crew });
  useSession.mockReturnValue({ accountAddress: null });
  view.rerender(<Crews {...props} />);
  expect(marker.children[0].material.opacity).toBe(0);
  view.unmount();
  textureSpy.mockRestore();
});
