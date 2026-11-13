/** @jest-environment node */
import { setProspectingLotVisibility } from './lotPresentation';

it('keeps buildings visible while hiding lot pips and interaction overlays', () => {
  const pips = { visible: true };
  const extractor = { visible: true };
  const factory = { visible: true };
  const overlay = { visible: true };
  const meshes = { 0: pips, 2: extractor, 5: factory };
  setProspectingLotVisibility(meshes, [overlay, null], true);
  expect(pips.visible).toBe(false);
  expect(extractor.visible).toBe(true);
  expect(factory.visible).toBe(true);
  expect(overlay.visible).toBe(false);
  setProspectingLotVisibility(meshes, [overlay], false);
  expect(pips.visible).toBe(true);
  expect(extractor.visible).toBe(true);
  expect(overlay.visible).toBe(true);
});
