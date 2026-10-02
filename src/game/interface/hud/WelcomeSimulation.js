import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import { ChevronDoubleDownIcon } from '~/components/Icons';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSimulationSteps from '~/simulation/useSimulationSteps';
import MockDataManager from '~/simulation/MockDataManager';
import MockTransactionManager from '~/simulation/MockTransactionManager';
import TutorialMessage, { messageWidth } from './TutorialMessage';
import TutorialBubble from './TutorialBubble';
import { fireTrackingEvent } from '~/lib/utils';
import { getPrimaryNewPlayerLoginOptions } from '~/lib/wallets';

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
    login(getPrimaryNewPlayerLoginOptions());
  }, [login]);

  if (!currentStep) return null;
  return createPortal(
    (
      <>
        <MockDataManager />
        <MockTransactionManager />

        <TutorialBubble
          crewmateImageOptionString={currentStep?.crewmateImageOptionString}
          crewmateId={currentStep?.crewmateId}
          isIn={currentStep && !isTransitioning && !launcherPage && !cutscenePlaying && isHidden}
          onClick={() => setIsHidden(false)}
          setRef={(currentStep && !isTransitioning && isHidden) ? setCoachmarkRef(COACHMARK_IDS.simulationRightButton) : undefined} />
        
        <TutorialMessage
          closeIconOverride={<ChevronDoubleDownIcon />}
          closeLabel="Minimize guidance"
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
