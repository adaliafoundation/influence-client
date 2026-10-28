import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import FullscreenAttention, { delay } from '~/components/FullscreenAttention';
import useScreenSize from '~/hooks/useScreenSize';
import useInterval from '~/hooks/useInterval';
import useStore from '~/hooks/useStore';
import useSimulationState from '~/hooks/useSimulationState';
import useSession from '~/hooks/useSession';

export const COACHMARK_IDS = {
  actionButtonScanAsteroid: 'actionButtonScanAsteroid',
  actionButtonLandShip: 'actionButtonLandShip',
  actionButtonAssembleShip: 'actionButtonAssembleShip',
  actionButtonConstruct: 'actionButtonConstruct',
  actionButtonCoreSample: 'actionButtonCoreSample',
  actionButtonExtract: 'actionButtonExtract',
  actionButtonLaunchShip: 'actionButtonLaunchShip',
  actionButtonLease: 'actionButtonLease',
  actionButtonPlan: 'actionButtonPlan',
  actionButtonProcess: 'actionButtonProcess',
  actionButtonSelectDestination: 'actionButtonSelectDestination',
  actionButtonSetCourse: 'actionButtonSetCourse',
  actionButtonStationCrew: 'actionButtonStationCrew',
  actionDialogConstructSource: 'actionDialogConstructSource',
  actionDialogMaxRecipes: 'actionDialogMaxRecipes',
  actionDialogPlanType: 'actionDialogPlanType',
  actionDialogTargetInventory: 'actionDialogTargetInventory',
  actionDialogTargetProcess: 'actionDialogTargetProcess',
  actionDialogTargetLaunchType: 'actionDialogTargetLaunchType',
  asteroidMarketsHelper: 'asteroidMarketsHelper',
  backToBelt: 'backToBelt',
  detailsClose: 'detailsClose',
  destinationAsteroid: 'destinationAsteroid',
  hudCrewLocation: 'hudCrewLocation',
  hudInfoPane: 'hudInfoPane',
  hudMenuMarketplaces: 'hudMenuMarketplaces',
  hudMenuMyAssets: 'hudMenuMyAssets',
  hudMenuMyAssetsAgreement: 'hudMenuMyAssetsAgreement',
  hudMenuMyAssetsBuilding: 'hudMenuMyAssetsBuilding',
  hudMenuMyAssetsShip: 'hudMenuMyAssetsShip',
  hudMenuResources: 'hudMenuResources',
  hudMenuTargetResource: 'hudMenuTargetResource',
  hudRecruitCaptain: 'hudRecruitCaptain',
  porkchop: 'porkchop',
  simulationRightButton: 'simulationRightButton'
};

const CoachmarkContext = React.createContext();

const CoachmarkComponent = ({ refEl }) => {
  const { height, width } = useScreenSize();
  const [rect, setRect] = useState();

  // give the ref element time to "animate in" in case
  // that is something it does
  useEffect(() => {
    const to = setTimeout(() => {
      const boundingRect = refEl && refEl.getBoundingClientRect();
      setRect(boundingRect);
    }, 500);
    return () => {
      clearTimeout(to);
      setRect();
    }
  }, [refEl, height, width]);

  // watch for position changes
  useInterval(() => {
    const boundingRect = refEl && refEl.getBoundingClientRect();
    setRect(boundingRect);
  }, delay);

  // update the position as needed if rect or screen changes
  const position = useMemo(() => {
    if (!rect) return null;
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  }, [rect]);

  if (!position) return null;
  return createPortal(
    (
      <>
        <FullscreenAttention style={position} />
        <FullscreenAttention style={position} staggered />
      </>
    ), document.body
  );
}

export function CoachmarkProvider({ children }) {
  const { connecting } = useSession();
  const coachmarks = useStore(s => s.coachmarks);
  const launcherPage = useStore(s => s.launcherPage);
  const simulation = useSimulationState();

  const [disabled, setDisabled] = useState(true);
  const [refEls, setRefEls] = useState({});

  const activeCoachmarkKey = useMemo(() => {
    return Object.keys(coachmarks).find((k) => !!coachmarks[k] && !!refEls[k]);
  }, [coachmarks, refEls]);

  const register = useCallback((label) => (r) => {
    setRefEls((prev) => {
      let updated = { ...prev };
      if (r) updated[label] = r;
      else if (updated[label]) delete updated[label];
      return updated;
    });
  }, []);

  // delay coachmark display on new tutorial step (to encourage reading)
  useEffect(() => {
    setDisabled(true);
    const to = setTimeout(() => {
      setDisabled(false);
    }, 3000);
    return () => clearTimeout(to);
  }, [simulation?.step])

  const contextValue = useMemo(() => ({
    activeCoachmarkKey,
    register
  }), [activeCoachmarkKey, register]);
  return (
    <>
      <CoachmarkContext.Provider value={contextValue}>
        {children}
      </CoachmarkContext.Provider>
      {activeCoachmarkKey && !launcherPage && !connecting && !disabled && <CoachmarkComponent refEl={refEls[activeCoachmarkKey]} />}
    </>
  );
}

export default CoachmarkContext;