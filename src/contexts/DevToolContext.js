import React, { useCallback, useEffect, useMemo, useState } from 'react';

import useStore from '~/hooks/useStore';

const DevToolContext = React.createContext();

export function DevToolProvider({ children }) {
  const showDevTools = useStore(s => s.graphics.showDevTools);

  const [assetType, setAssetType] = useState();
  const [modelUrl, setModelUrl] = useState();

  // overrides (if null/undefined, modelviewer will use default for asset type)
  const [background, setBackground] = useState();
  const [backgroundOverrideName, setBackgroundOverrideName] = useState();
  const [backgroundStrength, setBackgroundStrength] = useState();
  const [bloomRadius, setBloomRadius] = useState();
  const [bloomResolutionScale, setBloomResolutionScale] = useState();
  const [bloomSmoothing, setBloomSmoothing] = useState();
  const [bloomStrength, setBloomStrength] = useState();
  const [darklightColor, setDarklightColor] = useState();
  const [darklightStrength, setDarklightStrength] = useState();
  const [enablePostprocessing, setEnablePostprocessing] = useState();
  const [enableRotation, setEnableRotation] = useState();
  const [enableRevolution, setEnableRevolution] = useState();
  const [enableZoomLimits, setEnableZoomLimits] = useState();
  const [envmap, setEnvmap] = useState();
  const [envmapOverrideName, setEnvmapOverrideName] = useState();
  const [envmapStrength, setEnvmapStrength] = useState();
  const [keylightIntensity, setKeylightIntensity] = useState();
  const [lightmapStrength, setLightmapIntensity] = useState();
  const [rimlightIntensity, setRimlightIntensity] = useState();
  const [spotlightReduction, setSpotlightReduction] = useState();
  const [toneMapping, setToneMapping] = useState();
  const [toneMappingExposure, setToneMappingExposure] = useState();
  const [trackCamera, setTrackCamera] = useState();
  const [starColor, setStarColor] = useState();
  const [starStrength, setStarStrength] = useState();

  // reset most overrides on change of asset type
  useEffect(() => {
    setBackground();
    setBackgroundOverrideName();
    setBackgroundStrength();
    setBloomRadius();
    setBloomResolutionScale();
    setBloomSmoothing();
    setBloomStrength();
    setDarklightColor();
    setDarklightStrength();
    setEnablePostprocessing();
    setEnableRotation();
    setEnableRevolution();
    setEnableZoomLimits();
    setEnvmap();
    setEnvmapOverrideName();
    setEnvmapStrength();
    setKeylightIntensity();
    setLightmapIntensity();
    setRimlightIntensity();
    setSpotlightReduction();
    setStarColor();
    setStarStrength();
    setToneMapping();
    setToneMappingExposure();
    setTrackCamera();
  }, [assetType]);

  const contextValue = useMemo(() => ({
    assetType,
    overrides: showDevTools ? {
      modelUrl,
      background,
      backgroundOverrideName,
      backgroundStrength,
      bloomRadius,
      bloomResolutionScale,
      bloomSmoothing,
      bloomStrength,
      darklightColor,
      darklightStrength,
      enablePostprocessing,
      enableRotation,
      enableRevolution,
      enableZoomLimits,
      envmap,
      envmapOverrideName,
      envmapStrength,
      keylightIntensity,
      lightmapStrength,
      rimlightIntensity,
      spotlightReduction,
      starColor,
      starStrength,
      toneMapping,
      toneMappingExposure,
      trackCamera
    } : {},
    setAssetType,
    setModelUrl,
    setBackground,
    setBackgroundOverrideName,
    setBackgroundStrength,
    setBloomRadius,
    setBloomResolutionScale,
    setBloomSmoothing,
    setBloomStrength,
    setDarklightColor,
    setDarklightStrength,
    setEnablePostprocessing,
    setEnableRotation,
    setEnableRevolution,
    setEnableZoomLimits,
    setEnvmap,
    setEnvmapOverrideName,
    setEnvmapStrength,
    setKeylightIntensity,
    setLightmapIntensity,
    setRimlightIntensity,
    setSpotlightReduction,
    setStarColor,
    setStarStrength,
    setToneMapping,
    setToneMappingExposure,
    setTrackCamera
  }), [
    assetType,
    modelUrl,
    background,
    backgroundOverrideName,
    backgroundStrength,
    bloomRadius,
    bloomResolutionScale,
    bloomSmoothing,
    bloomStrength,
    darklightColor,
    darklightStrength,
    enablePostprocessing,
    enableRotation,
    enableRevolution,
    enableZoomLimits,
    envmap,
    envmapOverrideName,
    envmapStrength,
    keylightIntensity,
    lightmapStrength,
    rimlightIntensity,
    showDevTools,
    spotlightReduction,
    starColor,
    starStrength,
    toneMapping,
    toneMappingExposure,
    trackCamera
  ]);

  return (
    <DevToolContext.Provider value={contextValue}>
      {children}
    </DevToolContext.Provider>
  );
}

export default DevToolContext;
