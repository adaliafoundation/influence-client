const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { StarterMission } = require('@influenceth/sdk');
const { getMissionObjectives } = require('./missionPresentation');
const { gameplayGuides, getMissionGuide } = require('./missionGuidance');

test('every campaign requirement has reusable guidance, including each distinct sample', () => {
  Object.values(StarterMission.TYPES).forEach(mission => {
    getMissionObjectives(mission).forEach((_, index) => {
      expect(gameplayGuides[getMissionGuide(mission, index)].pages.length).toBeGreaterThan(0);
    });
  });
});

test('guidance pages have matching optional highlights', () => {
  Object.values(gameplayGuides).forEach(guide => {
    expect(guide.highlights).toHaveLength(guide.pages.length);
    guide.pages.forEach(page => expect(page.trim().length).toBeGreaterThan(0));
    guide.highlights.filter(Boolean).forEach(highlight => expect(highlight).toMatch(/^(hudCrewLocation|hudMenu|actionButton)/));
  });
});

test('every colonization objective has guidance and supplied pages contain no authoring prompts', () => {
  const { ColonizationMission } = require('@influenceth/sdk');
  const { getColonizationObjectives } = require('./colonizationMissions');
  Object.values(ColonizationMission.TYPES).forEach(mission => {
    getColonizationObjectives(mission, { selectedBuildings: [] }).forEach((_, index) => {
      const guide = gameplayGuides[getMissionGuide(mission, index)];
      expect(guide.pages.length).toBeGreaterThan(0);
      guide.pages.forEach(page => expect(page).not.toMatch(/\[Explain/));
    });
  });
  expect(gameplayGuides.enroll_colony.pages).toHaveLength(4);
});
