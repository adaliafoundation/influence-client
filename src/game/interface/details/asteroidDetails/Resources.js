import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Tooltip } from 'react-tooltip';
import { Asteroid } from '@influenceth/sdk';
import { BsChevronRight as NextIcon } from 'react-icons/bs';

import BonusBar from '~/components/BonusBar';
import BonusInfoPane from '~/components/BonusInfoPane';
import ButtonPill from '~/components/ButtonPill';
import Button from '~/components/ButtonAlt';
import { CaretIcon, ResourceGroupIcons, WarningOutlineIcon } from '~/components/Icons';
import useScanManager from '~/hooks/actionManagers/useScanManager';
import useStore from '~/hooks/useStore';
import AsteroidGraphic from './components/AsteroidGraphic';
import theme, { hexToRGB } from '~/theme';
import LiveTimer from '~/components/LiveTimer';
import AsteroidBonuses from './AsteroidBonuses';
import { getProductSpriteStyle, SPRITE_ATLAS_GROUPS, useSpriteAtlases } from '~/lib/spriteUtils';
import { nativeBool, reactBool } from '~/lib/utils';
import useCrewContext from '~/hooks/useCrewContext';

// TODO (enhancement): if these stay the same, then should just export from Information or extract to shared component vvv
const paneStackBreakpoint = 720;

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  height: 100%;
  padding-right: 4px;
  & > div {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  @media (max-width: ${paneStackBreakpoint}px) {
    display: block;
    height: auto;
    & > div {
      height: auto;
    }
  }
`;
const LeftPane = styled.div`
  flex: 0 1 640px;
  overflow: hidden;
  padding-top: 30px;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    flex: 1;
  }
`;
const RightPane = styled.div`
  flex: 1 1 640px;
  margin-left: 30px;
  padding-top: 40px;
  & > div:first-child {
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    flex: 1;
  }

  @media (max-width: ${p => paneStackBreakpoint}px) {
    margin-left: 0;
    & > div:first-child {
      flex: 0;
    }
  }
`;

const SectionHeader = styled.div`
  border-bottom: 1px solid ${p => p.theme.colors.borderBottom};
  color: white;
  font-size: 125%;
  padding-bottom: 4px;
`;

const SectionBody = styled.div`
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow: hidden;
  position: relative;
  @media (max-width: ${paneStackBreakpoint}px) {
    overflow: visible;
  }
`;
// TODO: ^^^

const SpectralLegend = styled.div`
  position: absolute;
  & > div {
    color: white;
    margin-bottom: 6px;
    & > span:first-child {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 2em;
      display: inline-block;
      font-weight: bold;
      height: 1.25em;
      margin-right: 8px;
      text-align: center;
      text-transform: uppercase;
      width: 1.25em;
    }
    & > span:last-child {
      font-size: 90%;
      opacity: 0.7;
    }
  }
`;

const GraphicSection = styled.div`
  flex: 1;
  min-height: 150px;
  @media (max-width: ${paneStackBreakpoint}px) {
    min-height: unset;
  }
`;
const GraphicWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
`;

const ResourceGroupIcon = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors.resources[p.category])}, 0.2);
  border-radius: 6px;
  color: ${p => p.theme.colors.resources[p.category]};
  display: flex;
  justify-content: center;
  height: 50px;
  width: 50px;

  & > svg {
    fill: currentColor;
    height: 40px;
    width: 40px;
  }
`;
const ResourceGroupLabel = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  font-weight: bold;
  justify-content: center;
  padding: 0 8px;
  text-transform: uppercase;
  & > label {
    font-size: 115%;
    line-height: 1em;
  }
`;
const BarChart = styled.div`
  display: flex;
  ${p => p.twoLine
    ? `
      align-items: flex-start;
      flex-direction: column;
      & > div {
        padding: 6px 0;
      }
    `
    : `
      align-items: center;
      flex-direction: row;
    `}
  & > label {
    font-size: 90%;
    margin-right: 6px;
    width: 48px;
  }
  & > div {
    flex: 1;
    width: 100%;
    &:before {
      background-color: currentColor;
      border-radius: 3px;
      content: '';
      display: block;
      height: 6px;
      width: ${p => (p.value / p.maxValue) * 90}%;
    }
  }
`;
const ResourceGroupItems = styled.div`
  color: white;
  overflow: visible;
  position: relative;
  text-align: right;
  width: 210px;
  & > div {
    margin-top: 3px;
    white-space: nowrap;
    & > div {
      background-position: center center;
      background-size: contain;
      border: 1px solid ${p => p.theme.colors.borderBottom};
      height: 24px;
      display: inline-block;
      width: 24px;
      &:not(:last-child) {
        margin-right: 2px;
      }
    }
  }
`;
const NextLabel = styled.div`
  color: white;
  font-size: 22px;
  text-align: right;
  transition: color 250ms ease;
  width: 40px;
`;
const ResourceGroup = styled.div`
  align-items: center;
  background-color: transparent;
  display: flex;
  flex-direction: row;
  padding: 10px 5px;
  transition: background-color 250ms ease;
  & ${ResourceGroupLabel} {
    color: ${p => p.color};
  }
  &:hover {
    background-color: rgba(${p => hexToRGB(p.color)}, 0.2);
    & ${NextLabel} {
      color: ${p => p.color};
    }
  }
`;

const Bonuses = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  & > div {
    width: 48%;
  }
`;

const BonusItem = styled.div`
  align-items: center;
  display: flex;
  padding: 6px 0;
  color: ${p => p.theme.colors.resources[p.category] || 'white'};
  & > label {
    font-size: 90%;
    font-weight: bold;
    margin-left: 10px;
  }
`;

const SelectedCategoryTitle = styled.div`
  border-bottom: 1px solid ${p => p.theme.colors.resources[p.category]};
  color: ${p => p.theme.colors.resources[p.category]};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 40px;
  font-weight: bold;
  padding-bottom: 10px;
  position: relative;
  text-transform: uppercase;
  & > *:first-child {
    margin-right: 12px;
  }
  & > *:last-child {
    color: white;
  }
  &:before {
    content: '';
    border-bottom: 1px solid ${p => p.theme.colors.resources[p.category]};
    bottom: -1px;
    left: -35px;
    position: absolute;
    transform: rotate(-45deg);
    transform-origin: right;
    width: 35px;
  }
`;

const ResourceSectionBody = styled(SectionBody)`
  overflow-y: auto;
  padding-left: 65px;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    overflow-y: visible;
    padding-left: 0;
  }
`;
const ResourceIcon = styled.div`
  background-color: black;
  background-position: center center;
  background-size: contain;
  border: 1px solid ${p => p.theme.colors.borderBottomAlt};
  height: 85px;
  width: 85px;
  transition: border-color 250ms ease;
`;
const ResourceRow = styled.div`
  align-items: center;
  background-color: transparent;
  color: ${p => p.theme.colors.resources[p.category]};
  display: flex;
  flex-direction: row;
  margin-left: -8px;
  padding: 8px;
  transition: background-color 250ms ease;
  &:hover {
    background-color: rgba(${p => hexToRGB(p.theme.colors.resources[p.category])}, 0.2);
    & ${ResourceIcon} {
      border-color: rgba(${p => hexToRGB(p.theme.colors.resources[p.category])}, 0.6);
    }
  }
`;
const ResourceInfo = styled.div`
  flex: 1;
  padding: 0 8px;
  & > label {
    color: white;
    font-size: 120%;
  }
  & > div {
    margin-top: 8px;
  }
`;
const ResourceAction = styled.div`
  padding-right: 6px;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const UnscannedWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
`;
const UnscannedContainer = styled.div`
  max-width: 570px;
  width: 100%;
`;
const UnscannedHeader = styled.div`
  background: ${p => p.isManager ? p.theme.colors.main : '#3d3d3d'};
  color: ${p => p.isManager ? 'black' : 'white'};
  font-size: 20px;
  line-height: 1.8em;
  position: relative;
  text-align: center;
  text-transform: uppercase;
  & > svg {
    font-size: 24px;
    left: 6px;
    position: absolute;
    top: 6px;
  }
`;
const UnscannedBody = styled.div`
  border: solid ${p => p.theme.colors.borderBottom};
  border-width: 1px 0;
  color: #ccc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-top: 10px;
  min-height: 150px;
  padding: 25px 20px;
  text-align: center;
  & h3 {
    margin: 0 0 12px;
  }
  & p {
    margin: 0;
  }
  & b {
    color: ${p => p.theme.colors.main};
  }
  & button {
    margin: 20px auto 0;
  }
`;

const spectralLabels = {
  c: 'Carbonaceous',
  i: 'Icy',
  s: 'Silicaceous',
  m: 'Metallic'
};

const ResourceDetails = ({ abundances, asteroid, isManager }) => {
  useSpriteAtlases(SPRITE_ATLAS_GROUPS.resources);

  const history = useHistory();
  const { category: initialCategory } = useParams();
  const selectOrigin = useStore(s => s.dispatchOriginSelected);
  const dispatchResourceMapSelect = useStore(s => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore(s => s.dispatchResourceMapToggle);
  const updateZoomStatus = useStore(s => s.dispatchZoomStatusChanged);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const { crew } = useCrewContext();
  const { startAsteroidScan, finalizeAsteroidScan, scanStatus, scanType } = useScanManager(asteroid);

  const [selected, setSelected] = useState();
  const [hover, setHover] = useState();

  const handleClick = useCallback((categoryIndex) => () => {
    const toBeSelected = categoryIndex >= 0 ? abundances[categoryIndex] : null;
    setSelected(toBeSelected);
    setHover(null);

    history.replace(`/asteroids/${asteroid.id}/resources${toBeSelected ? `/${toBeSelected.categoryKey}` : ``}`);
  }, [abundances, asteroid.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHover = useCallback((category, isHovering) => () => {
    setHover(isHovering ? category : null);
  }, []);

  const goToResourceMap = useCallback((resource) => (e) => {
    e.stopPropagation();
    selectOrigin(asteroid.id);
    if (zoomStatus !== 'in') updateZoomStatus('zooming-in');
    dispatchResourceMapSelect(resource.i);
    dispatchResourceMapToggle(true);
    history.push('/');
    return false;
  }, [asteroid?.id, zoomStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const [infoPaneAnchor, setInfoPaneAnchor] = useState();
  const setInfoPaneRef = (which) => (e) => {
    setInfoPaneAnchor(which ? e.target : null);
  };

  useEffect(() => {
    if (abundances?.length > 0 && initialCategory) {
      const a = abundances.find((a) => a.categoryKey === initialCategory);
      if (a) {
        setSelected(a);

      }
    }
  }, [abundances?.length, initialCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const unpackedBonuses = useMemo(() => Asteroid.Entity.getBonuses(asteroid) || [], [asteroid]);
  const nonzeroBonuses = useMemo(() => unpackedBonuses.filter((b) => b.level > 0), [unpackedBonuses]);

  return (
    <Wrapper>
      <LeftPane>
        <SpectralLegend>
          {Asteroid.getSpectralType(asteroid.Celestial.spectralType).toLowerCase().split('').map((l) => (
            <div key={l}>
              <span>{l}</span>
              <span>{spectralLabels[l]}</span>
            </div>
          ))}
        </SpectralLegend>
        <GraphicSection>
          <GraphicWrapper>
            <AsteroidGraphic
              abundances={abundances}
              asteroid={asteroid}
              defaultLastRow={Asteroid.Entity.getRarity(asteroid)}
              focus={selected?.category}
              hover={hover}
              noColor={asteroid.Celestial.scanStatus < Asteroid.SCAN_STATUSES.SURFACE_SCANNED} />
          </GraphicWrapper>
        </GraphicSection>
      </LeftPane>
      <RightPane>
        {/* TODO: consider stacking two UnscannedContainer's in this right pane until complete so the complete
            flow is more clear to the user */}
        {asteroid.Celestial.scanStatus < Asteroid.SCAN_STATUSES.RESOURCE_SCANNED && (
          <UnscannedWrapper>
            {isManager && (
              <UnscannedContainer>
                {scanStatus === 'READY_TO_FINISH' && (
                  <UnscannedHeader isManager>
                    <WarningOutlineIcon />
                    {scanType === 'RESOURCE'
                      ? 'Orbital Surface Scan'
                      : 'Un-Scanned Asteroid'}
                  </UnscannedHeader>
                )}
                <UnscannedBody>
                  {scanStatus === 'UNSCANNED' && (
                    <>
                      {scanType === 'SURFACE' && (
                        <p>
                          <b>You manage this asteroid.</b> Perform a long-range surface scan to determine its final bonuses.
                        </p>
                      )}
                      {scanType === 'RESOURCE' && (
                        <p>
                          An orbital scan to determine the final resource composition of this asteroid must be performed
                          at short-range.
                          <br/><br/>
                          <span style={crew._location?.asteroidId !== asteroid.id ? { color: theme.colors.error } : {}}>
                            Your crew must be in orbit of the asteroid.
                          </span>
                        </p>
                      )}
                      <Button
                        disabled={scanType === 'RESOURCE' && crew._location?.asteroidId !== asteroid.id}
                        onClick={startAsteroidScan}
                        isTransaction>
                        Start {scanType === 'RESOURCE' ? 'Orbital' : 'Long-Range'} Scan
                      </Button>
                    </>
                  )}
                  {scanStatus === 'SCANNING' && (
                    <>
                      <h3>{scanType === 'RESOURCE' ? 'ORBITAL' : 'LONG-RANGE'} SCAN IN PROGRESS</h3>
                      <LiveTimer target={asteroid.Celestial.scanFinishTime} />
                    </>
                  )}
                  {(scanStatus === 'READY_TO_FINISH' || scanStatus === 'FINISHING') && (
                    <>
                      <p>{scanType === 'RESOURCE' ? 'Orbital resource' : 'Long-range surface'} scan is complete. Ready to retrieve results.</p>
                      <Button
                        disabled={nativeBool(scanStatus === 'FINISHING')}
                        isTransaction
                        loading={reactBool(scanStatus === 'FINISHING')}
                        onClick={finalizeAsteroidScan}>
                        Finalize
                      </Button>
                    </>
                  )}
                </UnscannedBody>
              </UnscannedContainer>
            )}
            {!isManager && (
              <UnscannedContainer>
                <UnscannedHeader>
                  <WarningOutlineIcon />
                  {scanType === 'RESOURCE'
                      ? 'Long-range Scan Incomplete'
                      : 'Un-Scanned Asteroid'}
                </UnscannedHeader>
                <UnscannedBody isManager={isManager}>
                  The managing crew must complete both long-range and short-range scans to determine its resource composition and bonuses.
                </UnscannedBody>
              </UnscannedContainer>
            )}
          </UnscannedWrapper>
        )}
        {selected && (
          <div>
            <SelectedCategoryTitle category={selected.categoryKey} onClick={handleClick(-1)}>
              <ResourceGroupIcon category={selected.categoryKey}>{/* TODO: resize icons */}
                {ResourceGroupIcons[selected.categoryKey.toLowerCase()]}
              </ResourceGroupIcon>
              <span style={{ flex: 1 }}>{selected.category}</span>
              <CaretIcon />
            </SelectedCategoryTitle>
            <ResourceSectionBody>
              {selected.bonus?.level > 0 && (
                <BonusItem
                  category={selected.category}
                  onMouseEnter={setInfoPaneRef(true)}
                  onMouseLeave={setInfoPaneRef(false)}
                  style={{ marginBottom: 15, padding: 0, width: 225 }}>
                  <BonusBar bonus={selected.bonus.level} />
                  <label>Bonus Yield: +{selected.bonus.modifier}%</label>
                </BonusItem>
              )}
              {selected.resources.map((resource) => (
                <ResourceRow key={resource.i} category={selected.categoryKey}>
                  <ResourceIcon style={getProductSpriteStyle(resource.i) || undefined} />
                  <ResourceInfo>
                    <label>{resource.name}</label>
                    <BarChart value={resource.abundance} maxValue={selected.resources[0].abundance} twoLine>
                      <label>
                        {(resource.abundance * 100).toFixed(1)}%
                      </label>
                      <div />
                    </BarChart>
                  </ResourceInfo>
                  <ResourceAction>
                    <ButtonPill onClick={goToResourceMap(resource)}>
                      Resource Map
                    </ButtonPill>
                  </ResourceAction>
                </ResourceRow>
              ))}
            </ResourceSectionBody>
          </div>
        )}
        {!selected && (
          <>
            {asteroid.Celestial.scanStatus === Asteroid.SCAN_STATUSES.RESOURCE_SCANNED && (
              <div>
                <SectionHeader>Resource Groups</SectionHeader>
                <SectionBody>
                  {abundances.map(({ categoryKey, category, resources, abundance }, i) => (
                    <ResourceGroup
                      key={categoryKey}
                      color={theme.colors.resources[categoryKey]}
                      onClick={handleClick(i)}
                      onMouseEnter={handleHover(categoryKey, true)}
                      onMouseLeave={handleHover(categoryKey, false)}>
                      <ResourceGroupIcon category={categoryKey}>
                        {ResourceGroupIcons[categoryKey.toLowerCase()]}
                      </ResourceGroupIcon>
                      <ResourceGroupLabel>
                        <label>{category}</label>
                        <BarChart value={abundance} maxValue={abundances[0].abundance}>
                          <label>
                            {Math.round(abundance * 100).toFixed(1)}%
                          </label>
                          <div />
                        </BarChart>
                      </ResourceGroupLabel>
                      <ResourceGroupItems>
                        <label>{resources.length} Resources</label>
                        <div>
                          {resources.map((resource) => (
                            <div
                              key={resource.i}
                              data-tooltip-place="left"
                              data-tooltip-content={resource.name}
                              data-tooltip-id="globalTooltip"
                              style={getProductSpriteStyle(resource.i) || undefined} />
                          ))}
                        </div>
                      </ResourceGroupItems>
                      <NextLabel>
                        <NextIcon />
                      </NextLabel>
                    </ResourceGroup>
                  ))}
                </SectionBody>
              </div>
            )}

            {/* NOTE: for L1-scanned asteroids, these bonuses will already be set even though "unscanned" */}
            {nonzeroBonuses.length > 0 && (
              <div>
                <SectionHeader>Yield Bonuses</SectionHeader>
                <SectionBody>
                  <AsteroidBonuses bonuses={nonzeroBonuses} />
                </SectionBody>
              </div>
            )}
          </>
        )}
        <BonusInfoPane referenceEl={infoPaneAnchor} visible={!!infoPaneAnchor} />
      </RightPane>
    </Wrapper>
  );
};

export default ResourceDetails;
