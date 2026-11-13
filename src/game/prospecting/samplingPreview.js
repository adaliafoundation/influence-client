import { Prospecting } from '@influenceth/sdk';

const { ACCIDENTS, BONUSES, WIDTHS } = Prospecting;

export function samplingPreview({ cell, source, site, depth, abundance }) {
  const hasOre = !!cell?.[3];
  const chance = followOreChance({ source, site, depth, abundance });
  return [
    {
      label: 'Follow',
      goal: 'Discover',
      value: `${Math.round(chance)}% ore chance`,
      risk: source?.[0] && source[3] ? `${ACCIDENTS.stuck}% stuck drill · ${ACCIDENTS.collapse}% blocked route` : `${ACCIDENTS.stuck}% stuck drill`,
      detail: 'Open a new section and extend your search.'
    },
    {
      label: 'Cross-cut',
      goal: 'More quantity',
      value: hasOre ? `Up to ${Math.max(...WIDTHS[cell[4]]) / 100}× ore` : 'Find ore first',
      risk: `${ACCIDENTS.stuck}% stuck drill · ${ACCIDENTS.caveIn}% cave-in (−${100 - ACCIDENTS.recoveryAfterCaveIn}% ore)`,
      detail: cell?.[7] ? 'Width already measured.' : 'Test thickness; extraction rate stays the same.'
    },
    {
      label: 'Characterize',
      goal: 'Faster extraction',
      value: hasOre ? `Up to ${90 + Math.max(...BONUSES[cell[4]])}% rate` : 'Find ore first',
      risk: `${ACCIDENTS.stuck}% stuck drill`,
      detail: cell?.[8] ? 'Hardness already measured.' : 'Test hardness; ore quantity stays the same.'
    }
  ];
}

export function followOreChance({ source, site, depth, abundance }) {
  if (!site) return 0;
  return Prospecting.getFollowOreChance({
    source: source || undefined,
    meta: {
      lot: site.index,
      x: Math.round(500000 + site.x * 100),
      z: Math.round(500000 + site.z * 100),
      abundance: Math.round(abundance * 1e6)
    },
    depth
  }) * 100;
}
