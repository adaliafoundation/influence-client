export const GRAPHICS_QUALITY_MODES = {
  AUTO: 'auto',
  PERFORMANCE: 'performance',
  BALANCED: 'balanced',
  QUALITY: 'quality',
};

export const GRAPHICS_QUALITY_CONFIGS = {
  [GRAPHICS_QUALITY_MODES.PERFORMANCE]: {
    bloomResolutionScale: 0.25,
    enablePostprocessing: true,
    frameRateCap: 60,
    pixelRatio: 1,
    textureQuality: 1,
  },
  [GRAPHICS_QUALITY_MODES.BALANCED]: {
    bloomResolutionScale: 0.5,
    enablePostprocessing: true,
    frameRateCap: 60,
    pixelRatio: 1,
    textureQuality: 2,
  },
  [GRAPHICS_QUALITY_MODES.QUALITY]: {
    bloomResolutionScale: 0.75,
    enablePostprocessing: true,
    frameRateCap: 60,
    pixelRatio: 1,
    textureQuality: 3,
  },
};

const GPU_TIER_QUALITY_MODES = [
  GRAPHICS_QUALITY_MODES.PERFORMANCE,
  GRAPHICS_QUALITY_MODES.BALANCED,
  GRAPHICS_QUALITY_MODES.BALANCED,
  GRAPHICS_QUALITY_MODES.QUALITY,
];

export const getGraphicsQualityMode = (gpuInfo = {}) => (
  GPU_TIER_QUALITY_MODES[gpuInfo.tier] || GRAPHICS_QUALITY_MODES.BALANCED
);

export const resolveGraphicsQuality = ({
  gpuInfo,
  qualityMode = GRAPHICS_QUALITY_MODES.AUTO,
} = {}) => {
  const requestedQualityMode = qualityMode === GRAPHICS_QUALITY_MODES.AUTO
    ? getGraphicsQualityMode(gpuInfo)
    : qualityMode;
  const resolvedQualityMode = GRAPHICS_QUALITY_CONFIGS[requestedQualityMode]
    ? requestedQualityMode
    : GRAPHICS_QUALITY_MODES.BALANCED;
  const config = GRAPHICS_QUALITY_CONFIGS[resolvedQualityMode];

  return {
    qualityMode,
    resolvedQualityMode,
    ...config,
  };
};

export const getGraphicsDefaults = (gpuInfo) => {
  const resolvedQuality = resolveGraphicsQuality({ gpuInfo });

  return {
    bloomResolutionScale: resolvedQuality.bloomResolutionScale,
    enablePostprocessing: resolvedQuality.enablePostprocessing,
    frameRateCap: resolvedQuality.frameRateCap,
    textureQuality: resolvedQuality.textureQuality,
  };
};
