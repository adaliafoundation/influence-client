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

test('draft guidance contains no specific asset selections or transaction handlers', () => {
  Object.values(gameplayGuides).forEach(guide => {
    guide.pages.forEach(page => expect(page).toMatch(/^\[DRAFT\].*\[DRAFT\]$/));
    guide.highlights.forEach(highlight => expect(highlight).toMatch(/^(hudMenu|actionButton)/));
  });
});
