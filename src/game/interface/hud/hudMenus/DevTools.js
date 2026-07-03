import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { NoToneMapping } from 'three';
import { Ship } from '@influenceth/sdk';

import { appConfig } from '~/appConfig';
import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import IconButton from '~/components/IconButton';
import { CheckedIcon, CloseIcon, UncheckedIcon } from '~/components/Icons';
import NumberInput from '~/components/NumberInput';
import DevToolContext from '~/contexts/DevToolContext';
import theme from '~/theme';
import { HudMenuCollapsibleSection, Scrollable } from './components/components';
import { getShipModel } from '~/lib/assetUtils';
import { nativeBool } from '~/lib/utils';
import TextInput from '~/components/TextInput';
import visualConfigs, { toneMaps } from '~/lib/visuals';

const InnerSection = styled.div`
  & > * {
    margin-bottom: 8px;
  }

  hr {
    border-color: #3f3f40;
    margin: 12px 0;
  }
`;

const OverrideLabel = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  & > label {
    font-size: 12px;
    opacity: 0.7;
  }
`;

const Miniform = styled.div`
  display: block !important;
  margin-top: 15px;
  padding-left: 5px;
  width: 175px;
  & > label {
    display: block;
    font-size: 10px;
  }
  & > input {
    width: 100%;
  }
`;

const CheckboxRow = styled.div`
  align-items: center;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  height: 25px;
  margin-bottom: 0;
  padding-left: 3px;
  &:hover {
    background: #222;
  }
  & > svg {
    color: ${p => p.theme.colors.main};
  }
  & > label {
    font-size: 14px;
    margin-left: 8px;
    opacity: 0.7;
  }
`;

const reader = new FileReader();

const DevTools = () => {
  const { assetType, overrides, ...setters } = useContext(DevToolContext);

  const [defaultSettings, settings] = useMemo(() => {
    if (!assetType) return [{}, {}];

    const defaults = assetType === 'scene' ? visualConfigs.scene : visualConfigs.modelViewer[assetType];
    const overridden = { ...defaults };
    Object.keys(overrides).forEach((k) => {
      if (overrides[k] !== null && overrides[k] !== undefined) {
        overridden[k] = overrides[k];
      }
    });
    return [defaults, overridden];
  }, [assetType, overrides]);
  
  const fileInput = useRef();
  const uploadType = useRef();

  const [category, setCategory] = useState();
  const [categories, setCategories] = useState();
  const [categoryModels, setCategoryModels] = useState();
  const [isLoading, setIsLoading] = useState();
  const [modelSelection, setModelSelection] = useState();
  const [modelOverride, setModelOverride] = useState();

  const assets = useMemo(() => {
    if (assetType === 'ship') return Object.keys(Ship.TYPES).map((i) => ({ ...Ship.TYPES[i], modelUrl: getShipModel(i) }));
  }, [assetType]);
  
  useEffect(() => {
    setCategories();
    setCategory();
    if (assets) {
      const categorySet = new Set(assets.filter((a) => !!a).map((a) => a.category || ''));
      const categoryArr = Array.from(categorySet).sort();
      setCategories(categoryArr.map((c) => ({ label: c || '(Uncategorized)', value: c })));

      const currentModel = assets.find((a) => a?.modelUrl === settings.modelUrl);
      setCategory(categoryArr.find((c) => c.value === currentModel?.category) || categoryArr[0]);
    }
  }, [assetType]);

  useEffect(() => {
    if (!!assets) {
      const bAssets = assets
        .filter((a) => (a.category || '') === category)
        .sort((a, b) => a.name < b.name ? -1 : 1);
      setCategoryModels(bAssets);

      const currentModel = bAssets.find((a) => a?.modelUrl === settings.modelUrl);
      setModelSelection(currentModel || bAssets[0]);
    }
  }, [assetType, category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setters.setModelUrl(modelOverride?.url || modelSelection?.modelUrl);
  }, [modelOverride, modelSelection]);

  const selectModel = useCallback((m) => {
    setModelSelection(m);
  }, []);

  const handleUploadClick = useCallback((which) => () => {
    uploadType.current = which;
    fileInput.current.click();
  }, []);

  const handleFile = useCallback((e) => {
    const file = e.target.files[0];
    if (uploadType.current === 'model' && file.name.match(/\.(gltf|glb)$/i)) {
      setIsLoading(true);
      reader.readAsDataURL(file);
      reader.onload = () => {
        setModelOverride({
          name: file.name,
          url: reader.result
        });
        setIsLoading(false);
      };
    } else if (file.name.match(/\.(hdr|jpe?g)$/i)) {
      setIsLoading(true);
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (uploadType.current === 'bg') {
          setters.setBackgroundOverrideName(file.name);
          setters.setBackground(reader.result);
        } else if (uploadType.current === 'env') {
          setters.setEnvmapOverrideName(file.name);
          setters.setEnvmap(reader.result);
        }
        setIsLoading(false);
      };
    } else {
      window.alert('Bad file type.');
    }
  }, []);

  const removeOverride = useCallback((which) => () => {
    if (which === 'model') {
      setModelOverride();
    } else if (which === 'bg') {
      setters.setBackground();
      setters.setBackgroundOverrideName();
    } else if (which === 'env') {
      setters.setEnvmap();
      setters.setEnvmapOverrideName();
    }
  }, []);

  const toggleSetting = useCallback((setter) => {
    setter((s) => !s);
  }, []);

  const onChangeToneMapping = useCallback((selection) => {
    setters.setToneMapping(selection?.value);
    // if (selection?.value === NoToneMapping) {
    //   setters.setToneMappingExposure();
    // }
  }, []);

  // (make sure form values all get reset on asset change)
  const [resetting, setResetting] = useState();
  useEffect(() => {
    setResetting(true);
    setTimeout(() => {
      setResetting(false);
    }, 100);
  }, [assetType]);

  if (!appConfig.get('App.enableDevTools') || resetting) return null;
  return (
    <Scrollable>
      <HudMenuCollapsibleSection titleText="App">
        <InnerSection>
          <Button onClick={setters.onShowVersionUpdateDebug}>
            Show Update Modal
          </Button>
        </InnerSection>
      </HudMenuCollapsibleSection>

      <HudMenuCollapsibleSection titleText="Viewer">
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button
            size="small"
            onClick={() => setters.setAssetType('ship')}
            background={assetType === 'ship' ? theme.colors.main : undefined }
            style={{ minWidth: 90, color: assetType === 'ship' ? 'black' : undefined }}>
            Ships
          </Button>
          
          {assetType !== 'scene' && (
            <Button size="icon" onClick={() => setters.setAssetType('scene')}><CloseIcon /></Button>
          )}
        </div>
        
        <InnerSection style={{ marginTop: 10 }}>
          {assetType !== 'scene' && (
            <>
              {categories?.length > 1 && (
                <Dropdown
                  disabled={isLoading || modelOverride}
                  options={categories}
                  onChange={(c) => setCategory(c?.value)}
                  size="small"
                  style={{ textTransform: 'none', width: '300px' }} />
              )}
              <Dropdown
                disabled={isLoading || modelOverride}
                initialSelection={categoryModels?.find((m) => m.modelUrl === settings.modelUrl)?.id}
                labelKey="name"
                valueKey="i"
                options={categoryModels}
                onChange={(a) => selectModel(a)}
                size="small"
                style={{ textTransform: 'none', width: '300px' }} />

              <Button
                disabled={nativeBool(isLoading)}
                onClick={handleUploadClick('model')}>
                Upload Model
              </Button>

              {modelOverride && (
                <OverrideLabel>
                  <IconButton onClick={removeOverride('model')}><CloseIcon /></IconButton>
                  <label>{modelOverride.name}</label>
                </OverrideLabel>
              )}
            </>
          )}
        </InnerSection>
      </HudMenuCollapsibleSection>

      <HudMenuCollapsibleSection titleText="Lighting">
        <InnerSection>
          {assetType === 'scene' && (
              <>
                <Miniform>
                  <label>Star Intensity (scales by distance)</label>
                  <NumberInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.starStrength}
                    min="0"
                    step="0.01"
                    onChange={(v) => setters.setStarStrength(parseFloat(v) || 0)} />
                </Miniform>

                <Miniform>
                  <label>Star Color (6-digit hex)</label>
                  <TextInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.starColor}
                    onChange={(v) => setters.setStarColor((v || '').replace(/[^a-f0-9]/gi, ''))} />
                </Miniform>

                <Miniform>
                  <label>Dark Light Intensity</label>
                  <NumberInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.darklightStrength}
                    min="0"
                    step="0.01"
                    onChange={(v) => setters.setDarklightStrength(parseFloat(v) || 0)} />
                </Miniform>

                <Miniform>
                  <label>Dark Light Color (6-digit hex)</label>
                  <TextInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.darklightColor}
                    onChange={(v) => setters.setDarklightColor((v || '').replace(/[^a-f0-9]/gi, ''))} />
                </Miniform>
              </>
          )}
          {assetType !== 'scene' && (
            <>
              <Miniform>
                <label>Rimlight Intensity</label>
                <NumberInput
                  disabled={nativeBool(isLoading)}
                  initialValue={settings.rimlightIntensity}
                  min="0"
                  step="0.01"
                  onChange={(v) => setters.setRimlightIntensity(parseFloat(v) || 0)} />
              </Miniform>

              <Miniform>
                <label>Keylight Intensity</label>
                <NumberInput
                  disabled={nativeBool(isLoading)}
                  initialValue={settings.keylightIntensity}
                  min="0"
                  step="0.01"
                  onChange={(v) => setters.setKeylightIntensity(parseFloat(v) || 0)} />
              </Miniform>

              <Miniform>
                <label>Lightmap Strength</label>
                <NumberInput
                  disabled={nativeBool(isLoading)}
                  initialValue={settings.lightmapStrength}
                  min="0"
                  step="0.01"
                  onChange={(v) => setters.setLightmapIntensity(parseFloat(v) || 0)} />
              </Miniform>

              <Miniform>
                <label>In-Scene Spotlight Reduction</label>
                <NumberInput
                  disabled={nativeBool(isLoading)}
                  initialValue={settings.spotlightReduction}
                  min="0"
                  step="1"
                  onChange={(v) => setters.setSpotlightReduction(parseFloat(v) || 1)} />
              </Miniform>
            </>
          )}
        </InnerSection>
      </HudMenuCollapsibleSection>

      <HudMenuCollapsibleSection titleText="Postprocessing">
        <InnerSection>
          <CheckboxRow onClick={() => toggleSetting(setters.setEnablePostprocessing)}>
            {settings.enablePostprocessing ? <CheckedIcon /> : <UncheckedIcon />}
            <label>Bloom</label>
          </CheckboxRow>

          {settings.enablePostprocessing && (
            <>
              <div style={{ marginTop: 8 }}>
                <Miniform>
                  <label>Bloom Strength</label>
                  <NumberInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.bloomStrength}
                    min="0"
                    step="0.01"
                    onChange={(v) => setters.setBloomStrength(parseFloat(v))} />
                </Miniform>

                <Miniform>
                  <label>Bloom Radius</label>
                  <NumberInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.bloomRadius}
                    min="0"
                    step="0.01"
                    onChange={(v) => setters.setBloomRadius(parseFloat(v))} />
                </Miniform>

                <Miniform>
                  <label>Bloom Resolution Scale</label>
                  <NumberInput
                    disabled={nativeBool(isLoading)}
                    initialValue={settings.bloomResolutionScale}
                    min="0.25"
                    max="1"
                    step="0.05"
                    onChange={(v) => setters.setBloomResolutionScale(parseFloat(v) || 1)} />
                </Miniform>

                {/* NOTE: for @react-three/postprocessing bloom
                  <Miniform>
                    <label>Bloom Smoothing (0 - 1)</label>
                    <NumberInput
                      disabled={nativeBool(isLoading)}
                      initialValue={settings.bloomSmoothing}
                      max="1"
                      min="0"
                      step="0.001"
                      onChange={(v) => setters.setBloomSmoothing(parseFloat(v))} />
                  </Miniform>

                  <Miniform>
                    <label>Bloom Radius (1,2,3,4,5)</label>
                    <NumberInput
                      disabled={nativeBool(isLoading)}
                      initialValue={settings.bloomRadius}
                      max="5"
                      min="1"
                      step="1"
                      onChange={(v) => setters.setBloomRadius(parseFloat(v))} />
                  </Miniform>
                */}
              </div>

              <div style={{ marginTop: 8 }}>
                <Dropdown
                  disabled={nativeBool(isLoading)}
                  initialSelection={toneMaps.find((t) => t.value === settings.toneMapping)?.value}
                  options={toneMaps}
                  onChange={onChangeToneMapping}
                  size="small"
                  style={{ textTransform: 'none', width: '250px' }} />

                {settings.toneMapping !== NoToneMapping && (
                  <Miniform>
                    <label>Tone Mapping Exposure</label>
                    <NumberInput
                      disabled={nativeBool(isLoading)}
                      initialValue={settings.toneMappingExposure}
                      min="0"
                      step="0.01"
                      onChange={(v) => setters.setToneMappingExposure(parseFloat(v) || 1)} />
                  </Miniform>
                )}
              </div>
            </>
          )}
        </InnerSection>
      </HudMenuCollapsibleSection>

      <HudMenuCollapsibleSection titleText="Environment">
        <InnerSection>
          <Button
            disabled={nativeBool(isLoading)}
            onClick={handleUploadClick('bg')}>
            Override Background
          </Button>
          {overrides.background && (
            <OverrideLabel style={{ marginBottom: 20 }}>
              <IconButton onClick={removeOverride('bg')}><CloseIcon /></IconButton>
              <label>{overrides.backgroundOverrideName}</label>
            </OverrideLabel>
          )}

          <Miniform>
            <label>Background Strength</label>
            <NumberInput
              disabled={nativeBool(isLoading)}
              initialValue={settings.backgroundStrength}
              min="0.0"
              step="0.01"
              onChange={(v) => setters.setBackgroundStrength(parseFloat(v))} />
          </Miniform>

          {assetType !== 'scene' && (
            <>
              <div style={{ margin: 20 }} />

              <Button
                disabled={nativeBool(isLoading)}
                onClick={handleUploadClick('env')}>
                Override EnvMap
              </Button>
              {overrides.envmap && (
                <OverrideLabel>
                  <IconButton onClick={removeOverride('env')}><CloseIcon /></IconButton>
                  <label>{overrides.envmapOverrideName}</label>
                </OverrideLabel>
              )}

              <Miniform>
                <label>EnvMap Strength</label>
                <NumberInput
                  disabled={nativeBool(isLoading)}
                  initialValue={settings.envmapStrength}
                  min="0.0"
                  step="0.01"
                  onChange={(v) => setters.setEnvmapStrength(parseFloat(v))} />
              </Miniform>
            </>
          )}
        </InnerSection>
      </HudMenuCollapsibleSection>

      {assetType !== 'scene' && (
        <HudMenuCollapsibleSection titleText="Camera" collapsed>
          <CheckboxRow onClick={() => toggleSetting(setters.setEnableRotation)}>
            {settings.enableRotation ? <CheckedIcon /> : <UncheckedIcon />}
            <label>Auto Rotation</label>
          </CheckboxRow>

          <CheckboxRow onClick={() => toggleSetting(setters.setEnableRevolution)}>
            {settings.enableRevolution ? <CheckedIcon /> : <UncheckedIcon />}
            <label>Auto Revolution</label>
          </CheckboxRow>

          <CheckboxRow onClick={() => toggleSetting(setters.setEnableZoomLimits)}>
            {settings.enableZoomLimits ? <CheckedIcon /> : <UncheckedIcon />}
            <label>Camera Zoom Limits</label>
          </CheckboxRow>

          <CheckboxRow onClick={() => toggleSetting(setters.setTrackCamera)}>
            {settings.trackCamera ? <CheckedIcon /> : <UncheckedIcon />}
            <label>Track Camera</label>
          </CheckboxRow>
        </HudMenuCollapsibleSection>
      )}

      <input
        ref={fileInput}
        onChange={handleFile}
        onClick={(e) => e.target.value = null}
        style={{ display: 'none' }}
        type="file" />
    </Scrollable>
  );
};

export default DevTools;
