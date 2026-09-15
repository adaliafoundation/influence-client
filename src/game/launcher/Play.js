import { useEffect } from 'react';

import useSession from '~/hooks/useSession'
import { useControlledAlert } from '~/game/interface/Alerts';
import { InfluenceIcon } from '~/components/Icons';
import styled from 'styled-components';
import useCrewContext from '~/hooks/useCrewContext';
import formatters from '~/lib/formatters';
import CrewmateCardFramed, { EmptyCrewmateCardFramed } from '~/components/CrewmateCardFramed';
import theme from '~/theme';
import LiveFoodStatus from '~/components/LiveFoodStatus';
import CrewLocationCompactLabel from '~/components/CrewLocationCompactLabel';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const captainWidth = 232;
const crewmateWidth = 72;
const clipCorner = 12;
const Wrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  overflow: auto;
  & > h2 {
    color: white;
    filter: drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.5));
    font-size: 35px;
    font-weight: normal;
    margin-top: 0;
    margin-bottom: 25px;
  }
`;
const StatusRow = styled.div`
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  border-top: 1px solid ${p => p.theme.colors.mainBorder};
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - ${clipCorner}px),
    calc(100% - ${clipCorner}px) 100%,
    ${clipCorner}px 100%,
    0 calc(100% - ${clipCorner}px)
  );
  display: flex;
  flex-direction: row;
  font-size: 90%;
  height: 40px;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 15px;
  width: 360px;
`;
const CaptainWrapper = styled.div``;
const CrewmatesWrapper = styled.div`
  border-top: 1px solid ${p => p.theme.colors.mainBorder};
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  margin-top: 20px;
  padding: 20px 12px 20px;
  width: 100%;
`;

const Play = () => {
  const { crew, crews } = useCrewContext();
  const simulation = useSimulationEnabled();
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);

  useEffect(() => {
    if (crews?.length) {
      dispatchHudMenuOpened('MY_CREWS');
    }
    return () => {
      dispatchHudMenuOpened();
    }
  }, [!!crews?.length]);
  
  if (simulation || !crew) return null;
  return (
    <Wrapper>
      <h2>{formatters.crewName(crew)}</h2>
      <StatusRow>
        <CrewLocationCompactLabel crew={crew} alignLeft fontSize="inherit" noClick />
        <LiveFoodStatus crew={crew} fontSize="inherit" />
      </StatusRow>
      <CaptainWrapper>
        {/* TODO: would be nice to shrink this portrait to accomadate view height without scrolling */}
        <CrewmateCardFramed
          borderColor={theme.colors.darkMain}
          crewmate={crew._crewmates[0]}
          isCaptain
          width={captainWidth} />
      </CaptainWrapper>
      <CrewmatesWrapper>
        {[1,2,3,4].map((i) => {
          if (crew._crewmates[i]) {
            return (
              <CrewmateCardFramed
                key={i}
                borderColor={theme.colors.darkMain}
                crewmate={crew._crewmates[i]}
                noAnimation
                noArrow
                width={crewmateWidth} />
            );
          }
          return <EmptyCrewmateCardFramed key={i} width={crewmateWidth} hideHeader />;
        })}
      </CrewmatesWrapper>
    </Wrapper>
  );
}

export default Play;