import { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Asteroid } from '@influenceth/sdk';

import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import { BecomeAdminIcon, MyAssetIcon } from '~/components/Icons';
import useAsteroid from '~/hooks/useAsteroid';
import useControlAsteroid from '~/hooks/actionManagers/useControlAsteroid';
import useStore from '~/hooks/useStore';
import useCrewContext from '~/hooks/useCrewContext';
import actionStage from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { reactBool } from '~/lib/utils';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  
  FlexSection,
  FlexSectionInputBlock,
  ActionDialogBody,
  AsteroidImage,
  FlexSectionSpacer
} from './components';
import { ActionDialogInner } from '../ActionDialog';
import theme from '~/theme';

const AsteroidImageWrapper = styled.div`
  position: relative;
  & > svg:first-child {
    position: absolute;
    color: white;
    left: 5px;
    top: 5px;
    z-index: 1;
  }
`;

const Note = styled.div`
  color: ${p => p.theme.colors.main};
  margin-bottom: 40px;
  text-align: center;
`;

const ControlAsteroid = ({ asteroid, controlManager, stage, ...props }) => {
  const { controlAsteroid } = controlManager;
  const { captain, crew } = useCrewContext();

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    if (lastStatus.current && stage !== lastStatus.current) {
      props.onClose();
    }
    lastStatus.current = stage;
  }, [stage]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <BecomeAdminIcon />,
          label: 'Become Administrator',
        }}
        actionCrew={crew}
        location={{ asteroid }}
        onClose={props.onClose}
        overrideColor={stage === actionStage.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection style={{ alignItems: 'flex-start' }}>
          <FlexSectionInputBlock
            title="Asteroid"
            image={(
              <AsteroidImageWrapper>
                <MyAssetIcon />
                <AsteroidImage asteroid={asteroid} size="115px" />
              </AsteroidImageWrapper>
            )}
            label={formatters.asteroidName(asteroid)}
            sublabel={(
              <>{Asteroid.Entity.getSize(asteroid)} <span style={{ color: 'white' }}>{Asteroid.Entity.getSpectralType(asteroid)}-type</span></>
            )}
          />

          <FlexSectionSpacer />

          <FlexSectionInputBlock
            title="Asteroid Administrator"
            image={<CrewmateCardFramed crewmate={captain} isCaptain width={78} />}
            label={formatters.crewName(crew)}
            sublabel="New Administrator"
          />
        </FlexSection>

        <FlexSection>
          <Note>
            Note: The managing crew oversees all lots on an asteroid. They govern lot usage policies,
            and all asteroid-wide management actions are committed to their Crew Log.
          </Note>
        </FlexSection>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!crew}
        goLabel="Set Crew"
        onGo={() => controlAsteroid(asteroid.id)}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const asteroidId = useStore(s => s.asteroids.origin);
  const { data: asteroid, isLoading } = useAsteroid(asteroidId);
  const controlManager = useControlAsteroid(asteroidId);

  useEffect(() => {
    if (!asteroid && !isLoading) {
      if (props.onClose) props.onClose();
    } else if (controlManager.alreadyControlled) {
      if (props.onClose) props.onClose();
    }
  }, [asteroid, controlManager, isLoading]);

  const stage = useMemo(() => controlManager.takingControl ? actionStage.COMPLETING : actionStage.NOT_STARTED, [controlManager.takingControl]);

  return (
    <ActionDialogInner
      actionImage="Management"
      isLoading={reactBool(isLoading)}
      stage={stage}>
      <ControlAsteroid
        asteroid={asteroid}
        controlManager={controlManager}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
