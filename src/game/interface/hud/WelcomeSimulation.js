import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import Loader from 'react-spinners/PuffLoader';

import { ChevronDoubleDownIcon } from '~/components/Icons';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSimulationSteps from '~/simulation/useSimulationSteps';
import MockDataManager from '~/simulation/MockDataManager';
import MockTransactionManager from '~/simulation/MockTransactionManager';
import theme from '~/theme';
import TutorialMessage, { messageWidth, useCrewmateTutorialImageUrl } from './TutorialMessage';
import { fireTrackingEvent } from '~/lib/utils';

const BUBBLE_WIDTH = 60;

const Bubble = styled.div`
  background: rgba(${p => p.theme.colors.darkMainRGB}, 0.7);
  bottom: 10px;
  border-radius: 50px;
  cursor: ${p => p.theme.cursors.active};
  height: ${BUBBLE_WIDTH}px;
  left: 50%;
  opacity: ${p => p.isIn ? 1 : 0};
  outline: 1px solid ${p => p.theme.colors.main};
  padding: 2px;
  pointer-events: ${p => p.isIn ? 'all' : 'none'};
  position: fixed;
  transition: background 100ms ease, opacity 250ms ease ${p => p.isIn ? '200ms' : '0'}, outline 100ms ease;
  width: ${BUBBLE_WIDTH}px;
  z-index: 1000000;

  &:after {
    color: ${p => p.theme.colors.brightMain};
    content: "▾";
    position: absolute;
    bottom: -4px;
    right: -8px;
    transition: color 100ms ease;
  }

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.6);
    outline: 3px solid white;
    &:after {
      color: white;
    }
  }
`;

const CrewmateImage = styled.div`
  background-image: ${p => p.imageUrl ? `url("${p.imageUrl}")` : 'none'};
  background-position: top center;
  background-repeat: no-repeat;
  background-size: cover;
  border-radius: 0 0 ${BUBBLE_WIDTH}px ${BUBBLE_WIDTH}px;
  bottom: 40%;
  padding-top: 140%;
  position: relative;
  width: 100%;
  z-index: 2;
`;

const SkipSimulation = styled.div`
  bottom: 0;
  color: white;
  cursor: ${p => p.theme.cursors.active};
  font-size: 13px;
  height: 36px;
  left: calc(50% + ${messageWidth/2}px);
  line-height: 36px;
  opacity: ${p => p.isIn ? 0.8 : 0};
  pointer-events: ${p => p.isIn ? 'all' : 'none'};
  position: fixed;
  transition: opacity 150ms ease;
  z-index: 1000000;
  &:hover {
    opacity: 1;
  }
`;

const WelcomeSimulation = () => {
  const { connecting, login } = useSession(false);
  const setCoachmarkRef = useCoachmarkRefSetter();
  const [isHidden, setIsHidden] = useState(false);
  const [canAutohide, setCanAutohide] = useState(false);

  const { currentStep, currentStepIndex, isLastStep, isTransitioning } = useSimulationSteps();
  const bubbleImageUrl = useCrewmateTutorialImageUrl({
    crewmateImageOptionString: currentStep?.crewmateImageOptionString,
    crewmateId: currentStep?.crewmateId
  });

  const initialLoad = useRef(true);

  // watching for user action
  const history = useHistory();
  const actionDialog = useStore(s => s.actionDialog);
  const cutscenePlaying = !!useStore(s => s.cutscene);
  const launcherPage = useStore(s => s.launcherPage);
  const openHudMenu = useStore(s => s.openHudMenu);
  const [locationPath, setLocationPath] = useState();
  useEffect(() => {
    // (returns unlisten, so can just return directly to useEffect)
    return history.listen((location) => setLocationPath(location.pathname));
  }, [history]);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
    } else if (canAutohide) {
      setIsHidden(true);
    }
  }, [actionDialog?.type, connecting, locationPath, openHudMenu]);

  // we want to unhide the message on step change
  // then we want to hide it on first coachmark change for step (i.e. user has read and is now doing)
  useEffect(() => {
    setIsHidden(false);
    setCanAutohide(false);
    setTimeout(() => {
      setCanAutohide(true);
    }, 1000);
  }, [currentStepIndex]);

  const handleSkip = useCallback(() => {
    fireTrackingEvent('simulation', { step: 'skip-to-login' });
    login({ webWallet: true });
  }, []);

  if (!currentStep) return null;
  return createPortal(
    (
      <>
        <MockDataManager />
        <MockTransactionManager />

        <Bubble
          isIn={currentStep && !isTransitioning && !launcherPage && !cutscenePlaying && isHidden}
          onClick={() => setIsHidden(false)}
          ref={(currentStep && !isTransitioning && isHidden) ? setCoachmarkRef(COACHMARK_IDS.simulationRightButton) : undefined}>
          <CrewmateImage imageUrl={bubbleImageUrl} />
          <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
            <Loader size={BUBBLE_WIDTH} color={theme.colors.brightMain} speedMultiplier={0.5} />
          </div>
        </Bubble>
        
        <TutorialMessage
          closeIconOverride={<ChevronDoubleDownIcon />}
          crewmateId={currentStep?.crewmateId}
          crewmateImageOptionString={currentStep?.crewmateImageOptionString}
          isIn={currentStep && !isTransitioning && !launcherPage && !cutscenePlaying && !isHidden}
          messageOffset={15}
          onClose={() => setIsHidden(true)}
          rightButton={(
            currentStep.rightButton
            ? { ...currentStep.rightButton }
            : null
          )}
          setButtonRef={(currentStep && !isTransitioning && !isHidden) ? setCoachmarkRef(COACHMARK_IDS.simulationRightButton) : undefined}
          step={currentStep}
        />

        <SkipSimulation
          onClick={handleSkip}
          isIn={currentStep && !isTransitioning && !launcherPage && !cutscenePlaying && !isHidden && !isLastStep && !connecting}>
          Skip to Account Creation
        </SkipSimulation>
      </>
    ),
    document.body
  );
};

export default WelcomeSimulation;
