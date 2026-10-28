const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Crew, Crewmate, Inventory, Product } = require('@influenceth/sdk');
// Exercise the SDK directly, as the client does through getCrewAbilityBonuses.
const getInventoryBonuses = (crewmates = []) => ({
  mass: Crew.getAbilityBonus(Crewmate.ABILITY_IDS.INVENTORY_MASS_CAPACITY, crewmates).totalBonus,
  volume: Crew.getAbilityBonus(Crewmate.ABILITY_IDS.INVENTORY_VOLUME_CAPACITY, crewmates).totalBonus
});

const logisticsCrewmate = { Crewmate: { impactful: [32], title: 6, collection: 1 } };
const fixedOne = 4294967296n;
const fixedBasisPoint = 429496n;

test('unbonused inventory capacity stays unchanged', () => {
  expect(getInventoryBonuses()).toEqual({ mass: 1, volume: 1 });
});

test.each([1, 2, 3, 4, 5])('matches contract bonuses for %i Logistics specialists', (count) => {
  const bonuses = getInventoryBonuses(Array(count).fill(logisticsCrewmate));
  // 5% mass per trait; 1.25% volume per title tier, including the specialist half tier.
  expect(bonuses.mass).toBe(Number(fixedOne + BigInt(count) * 500n * fixedBasisPoint) / Number(fixedOne));
  expect(bonuses.volume).toBe(Number(fixedOne + BigInt(count) * 375n * fixedBasisPoint / 2n) / Number(fixedOne));
});

test('the old full-capacity amount exceeds the contract limit with Logistics', () => {
  const base = Inventory.TYPES[Inventory.IDS.WAREHOUSE_PRIMARY].massConstraint;
  const contractCapacity = Number(BigInt(base) * (fixedOne + 500n * fixedBasisPoint) / fixedOne);
  const product = Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT];
  expect(Math.floor(base * 1.05 / product.massPerUnit) * product.massPerUnit).toBeGreaterThan(contractCapacity);
  const config = Inventory.getType(Inventory.IDS.WAREHOUSE_PRIMARY, getInventoryBonuses([logisticsCrewmate]));
  expect(Math.floor(config.massConstraint / product.massPerUnit) * product.massPerUnit).toBeLessThanOrEqual(contractCapacity);
});

test('full transfers fit contract mass and volume limits, including occupied and reserved space', () => {
  for (let count = 1; count <= 5; count++) {
    const bonuses = getInventoryBonuses(Array(count).fill(logisticsCrewmate));
    const massBonus = fixedOne + BigInt(count) * 500n * fixedBasisPoint;
    const volumeBonus = fixedOne + BigInt(count) * 375n * fixedBasisPoint / 2n;
    Object.values(Inventory.TYPES).filter((type) => type.modifiable).forEach((type) => {
      const config = Inventory.getType(type.i, bonuses);
      const massLimit = Number(BigInt(type.massConstraint) * massBonus / fixedOne);
      const volumeLimit = Number(BigInt(type.volumeConstraint) * volumeBonus / fixedOne);
      expect(config.massConstraint).toBe(massLimit);
      expect(config.volumeConstraint).toBe(volumeLimit);
      expect(Inventory.getFilledCapacity(type.i, bonuses)).toEqual({
        filledMass: massLimit, filledVolume: volumeLimit
      });
      Object.values(Product.TYPES).forEach((product) => {
        for (const occupied of [0, 123456]) {
          const reserved = occupied * 2;
          const amount = Math.floor(Math.min(
            (config.massConstraint - occupied - reserved) / product.massPerUnit,
            (config.volumeConstraint - occupied - reserved) / product.volumePerUnit
          ));
          expect(amount * product.massPerUnit + occupied + reserved).toBeLessThanOrEqual(massLimit);
          expect(amount * product.volumePerUnit + occupied + reserved).toBeLessThanOrEqual(volumeLimit);
        }
      });
    });
  }
});

// Cover each title rank, specialist half tiers, and every possible crew size.
test.each([1, 2, 3, 4, 5])('matches exact contract capacities across title ranks with %i crewmates', (count) => {
  for (const title of [6, 19, 32, 45, 58]) {
    for (const collection of [1, 2, 3, 4]) {
      const crewmates = Array(count).fill({ Crewmate: { impactful: [32], title, collection } });
      const bonuses = getInventoryBonuses(crewmates);
      const doubledRank = 2 * (Math.floor((title - 1) / 13) + 1) + (collection === 1 ? 1 : 0);
      const massBonus = fixedOne + BigInt(count) * 500n * fixedBasisPoint;
      const volumeBonus = fixedOne + BigInt(count) * BigInt(doubledRank) * 125n * fixedBasisPoint / 2n;
      expect(bonuses.mass).toBe(Number(massBonus) / Number(fixedOne));
      expect(bonuses.volume).toBe(Number(volumeBonus) / Number(fixedOne));
      Object.values(Inventory.TYPES).forEach((type) => {
        const config = Inventory.getType(type.i, bonuses);
        expect(config.massConstraint).toBe(type.modifiable
          ? Number(BigInt(type.massConstraint) * massBonus / fixedOne) : type.massConstraint);
        expect(config.volumeConstraint).toBe(type.modifiable
          ? Number(BigInt(type.volumeConstraint) * volumeBonus / fixedOne) : type.volumeConstraint);
      });
    }
  }
});
