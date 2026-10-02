import { createEligibilityDependencies } from './eligibilityDependencies';

test('tracks selected entities, tenancy, controllers, locations and dynamically loaded policy crews', () => {
  const tracker = createEligibilityDependencies([{ label: 4, id: 10, UseLot: { tenant: { label: 1, id: 2 } } },
    { label: 6, id: 9, Control: { controller: { label: 1, id: 3 } }, Location: { locations: [{ label: 3, id: 1 }] } }]);
  tracker.add({ label: 1, id: 4 });
  for (const [label, id] of [[4, 10], [1, 2], [1, 3], [6, 9], [3, 1], [1, 4]]) expect(tracker.affects({ label, id })).toBe(true);
  expect(tracker.affects({ label: 1, id: 999 })).toBe(false);
  expect(tracker.affects({ label: 5, id: 10 })).toBe(false);
});

test('a new occupant on the selected lot invalidates planning even when not previously loaded', () => {
  const tracker = createEligibilityDependencies([], { lotId: 10 });
  expect(tracker.affects({ label: 5, id: 99, newGroupEval: { updatedValues: { lotId: 10 } } })).toBe(true);
  expect(tracker.affects({ label: 5, id: 99, newGroupEval: { updatedValues: { lotId: 11 } } })).toBe(false);
});
