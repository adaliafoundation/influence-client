import { act, renderHook } from '@testing-library/react';
import { Vector3 } from 'three';
import { gsap } from 'gsap';
import useStore from '~/hooks/useStore';
import useHighAltitudeCamera from './useHighAltitudeCamera';

jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('gsap', () => ({ gsap: { timeline: jest.fn() } }));

let state;
let timeline;
const setup = (overrides = {}) => ({
  controls: { object: { position: new Vector3(0, 0, 100) } },
  radius: 100, zoomStatus: 'in', automatingCamera: { current: false },
  cameraAutomationVersion: 0, setCameraAutomationVersion: jest.fn(), setCameraAltitude: jest.fn(),
  ...overrides
});

beforeEach(() => {
  state = { cameraNeedsHighAltitude: true, dispatchGoToHighAltitude: jest.fn() };
  useStore.mockImplementation(selector => selector(state));
  timeline = { to: jest.fn().mockReturnThis(), kill: jest.fn() };
  gsap.timeline.mockReset().mockReturnValue(timeline);
});

test.each([
  ['radius', undefined, 100],
  ['controls', null, { object: { position: new Vector3(0, 0, 100) } }],
  ['zoomStatus', 'zooming-in', 'in']
])('waits for %s and then executes an already-pending request', (key, before, after) => {
  const props = setup({ [key]: before });
  const view = renderHook(useHighAltitudeCamera, { initialProps: props });
  expect(gsap.timeline).not.toHaveBeenCalled();
  view.rerender({ ...props, [key]: after });
  expect(gsap.timeline).toHaveBeenCalledTimes(1);
  expect(timeline.to.mock.calls[0][1]).toEqual({ x: 0, y: 0, z: 150 });
  act(() => gsap.timeline.mock.calls[0][0].onComplete());
  expect(props.setCameraAltitude).toHaveBeenCalledWith(50);
  expect(state.dispatchGoToHighAltitude).toHaveBeenCalledWith(false);
  expect(props.automatingCamera.current).toBe(false);
});

test('retries after another camera animation completes and releases its lock on unmount', () => {
  const props = setup({ automatingCamera: { current: true } });
  const view = renderHook(useHighAltitudeCamera, { initialProps: props });
  expect(gsap.timeline).not.toHaveBeenCalled();
  props.automatingCamera.current = false;
  view.rerender({ ...props, cameraAutomationVersion: 1 });
  expect(gsap.timeline).toHaveBeenCalledTimes(1);
  expect(props.automatingCamera.current).toBe(true);
  view.unmount();
  expect(timeline.kill).toHaveBeenCalledTimes(1);
  expect(props.automatingCamera.current).toBe(false);
});
