import { constants as astroConstants } from '@influenceth/astro';

const constants = {
  AU: astroConstants.AU, // in meters
  MAX_SYSTEM_RADIUS: 10, // in AU
  MAX_ASTEROID_RADIUS: 376000, // in meters
  MIN_ASTEROID_RADIUS: 1000, // in meters
  MAX_AXIS: 4.0, // Maximum semi-major axis in AU
  MIN_AXIS: 0.8, // Minimum semi-major axis in AU
  MIN_INCLINATION: 0,
  MAX_INCLINATION: 40,
  MIN_ECCENTRICITY: 0,
  MAX_ECCENTRICITY: 0.4,
  STAR_INTENSITY: 0.75, // as it relates to THREE light

  // Asteroid settings
  // (resolution)
  CHUNK_RESOLUTION: 64, // NOTE: multiplied by 1, 2, 4 (per user's texture settings) -- should be power of 2
  MIN_CHUNK_SIZE: 2000,
  CHUNK_SPLIT_DISTANCE: 1.25,  // NOTE: this should probably always be >= 0.5 functionally
  OVERSAMPLE_CHUNK_TEXTURES: true,  // NOTE: this probably doesn't need to be a constant; we should always do this
  MODEL_EXPORT_RESOLUTION: 512,

  // (culling, zoom, camera, shadows)
  ENABLE_SHADOWS: false,
  MIN_FRUSTUM_AT_SURFACE: 4000, // closest zoom so that X meters visible w/i frustum height
  SHADOWLESS_NORMAL_SCALE: 1.2, // exaggerate normals when shadows are disabled

  MIN_FOV: 30,
  MAX_FOV: 105,

  // Lot instancing
  MAX_LOTS_RENDERED: 8000, // NOTE: could reasonably make this dependent on GPU tier / settings

  // (performance)
  ENABLE_TERRAIN_CHUNK_RESOURCE_POOL: true,
  TERRAIN_CHUNK_POOL_SIZE_MIN: 10,
  TERRAIN_CHUNK_POOL_SIZE_LOOKBACK: 100, // on AP, usually about 25 queued changes at once (so this should catch a few cycles)
  UPDATE_QUADTREE_EVERY: 0.33, // (multiplied by CHUNK_SPLIT_DISTANCE)

  TELEMETRY_SCALE: 1.15,
};

export default constants;
