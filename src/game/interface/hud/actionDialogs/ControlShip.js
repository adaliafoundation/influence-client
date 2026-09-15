import { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';

import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import { BecomeAdminIcon } from '~/components/Icons';
import useAsteroid from '~/hooks/useAsteroid';
import useCrewContext from '~/hooks/useCrewContext';
import actionStage from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { locationsArrToObj, reactBool } from '~/lib/utils';

import { ActionDialogFooter, ActionDialogHeader, FlexSection, FlexSectionInputBlock, ActionDialogBody, FlexSectionSpacer, ShipInputBlock } from './components';
import { ActionDialogInner } from '../ActionDialog';
import theme from '~/theme';
import useControlShip from '~/hooks/actionManagers/useControlShip';
import useEntity from '~/hooks/useEntity';
import useShip from '~/hooks/useShip';


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

// TODO: combine with ControlAsteroid?
const ControlShip = ({ asteroid, lot, ship, controlManager, stage, ...props }) => {
  const { controlShip } = controlManager;
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
          label: 'Commandeer Ship',
        }}
        actionCrew={crew}
        location={{ asteroid, lot, ship }}
        onClose={props.onClose}
        overrideColor={stage === actionStage.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection style={{ alignItems: 'flex-start' }}>
          <ShipInputBlock title="Ship" ship={ship} />

          <FlexSectionSpacer />

          <FlexSectionInputBlock
            title="Commanding Crew"
            image={<CrewmateCardFramed crewmate={captain} isCaptain width={62} />}
            label={formatters.crewName(crew)}
            sublabel="New Commanding Crew"
          />
        </FlexSection>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!crew}
        goLabel="Set Commanding Crew"
        onGo={() => controlShip(asteroid.id)}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { data: ship, isLoading: shipIsLoading } = useShip(props.shipId);
  const controlManager = useControlShip(props.shipId);

  const loc = useMemo(() => locationsArrToObj(ship?.Location?.locations || []), [ship]);
  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(loc.asteroidId);
  const { data: lot, isLoading: lotIsLoading } = useEntity({ id: loc.lotId, label: Entity.IDS.LOT });

  useEffect(() => {
    if (props.onClose) {
      if (!ship && !shipIsLoading) {
        props.onClose();
      } else if (!asteroid && !asteroidIsLoading) {
        props.onClose();
      } else if (controlManager.alreadyControlled) {
        props.onClose();
      }
    }
  }, [asteroid, controlManager, asteroidIsLoading, shipIsLoading]);

  const stage = useMemo(() => controlManager.takingControl ? actionStage.COMPLETING : actionStage.NOT_STARTED, [controlManager.takingControl]);

  return (
    <ActionDialogInner
      actionImage="Management"
      isLoading={reactBool(asteroidIsLoading || lotIsLoading || shipIsLoading)}
      stage={stage}>
      <ControlShip
        asteroid={asteroid}
        lot={lot}
        ship={ship}
        controlManager={controlManager}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
