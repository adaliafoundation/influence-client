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
