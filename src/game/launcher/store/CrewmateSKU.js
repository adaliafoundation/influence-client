import { useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Crewmate } from '@influenceth/sdk';

import Button from '~/components/ButtonAlt';
import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import AdalianFlourish from '~/components/AdalianFlourish';
import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import { CrewmateCreditIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import SKUTitle from './components/SKUTitle';
import { PurchaseForm, PurchaseFormRows } from './components/PurchaseForm';
import SKUHighlight from './components/SKUHighlight';
import theme from '~/theme';
import { barebonesCrewmateAppearance } from '~/hooks/useStarterPacks';
import useStore from '~/hooks/useStore';
import formatters from '~/lib/formatters';

const Wrapper = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: row;
  width: 100%;
  & > * {
    margin-top: 10px;
  }

  & h4 {
    color: #ccc;
    font-size: 90%;
    font-weight: normal;
    margin: 0 0 6px;
    opacity: 0.6;
  }
`;

const Description = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: row;
  font-size: 16px;
  line-height: 1.4em;
  padding-right: 20px;
  padding-bottom: 20px;
  & > div {
    color: white;
    height: 190px;
    margin-right: 15px;
    text-align: center;
    width: 145px;
  }
  & > p {
    flex: 1;
    margin: 0 0 1em;
  }
`;

const CrewmatePurchaseForm = styled(PurchaseForm)`
  & > h3 {
    padding-left: 100px;
  }
`;

const FlairCard = styled.div`
  filter: drop-shadow(2px 2px 6px black);
  left: 10px;
  position: absolute;
  top: 10px;
  z-index: 1;
`;

const Body = styled.div`
  padding: 10px;
`;

const CrewmateSKU = () => {
  const history = useHistory();
  const { crew, crews } = useCrewContext();
  const selectedCrewId = useStore(s => s.selectedCrewId);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const activeCrew = crew || crews?.find((c) => c.id === selectedCrewId) || null;

  const onOpenCrew = useCallback(() => {
    dispatchLauncherPage();
    history.push(activeCrew?.id ? `/crew/${activeCrew.id}` : '/recruit/0');
  }, [activeCrew?.id, dispatchLauncherPage, history]);

  return (
    <Wrapper>
      <div style={{ paddingRight: 20 }}>
        <SKUTitle>Recruit Crewmates</SKUTitle>
        <Description>
          <div>
            <AdalianFlourish filter="brightness(125%) saturate(135%)" />
          </div>
          <p>
            Crewmates are the literal heart and soul of Adalia. They perform all in-game
            tasks and form your crew. A crew is composed of up to 5 crewmates.
            <br/><br/>
            Recruit additional crewmates directly from your active crew. Select an open
            slot in Crew Details to customize and recruit your next Adalian.
          </p>
        </Description>
      </div>
      <CrewmatePurchaseForm>
        <h3>Additional Crewmates</h3>

        <FlairCard>
          <CrewmateCardFramed
            noArrow
            CrewmateCardProps={{
              gradientRGB: theme.colors.mainRGB,
              useExplicitAppearance: true,
            }}
            crewmate={{
              Crewmate: {
                appearance: barebonesCrewmateAppearance,
                class: 0,
                coll: Crewmate.COLLECTION_IDS.ADALIAN,
              }
            }}
            width={85} />
        </FlairCard>

        <div style={{ padding: '10px 0 15px 100px' }}>
          <PurchaseFormRows>
            <div>
              <label>Collection</label>
              <span>Adalian</span>
            </div>
            <div>
              <label>Price</label>
              <span>$5.00 Each</span>
            </div>
          </PurchaseFormRows>
        </div>

        <Body>
          <h4>Recruitment</h4>
          <TextInputWrapper rightLabel="CREW DETAILS">
            <UncontrolledTextInput
              disabled
              style={{ height: 28 }}
              value={activeCrew ? formatters.crewName(activeCrew) : 'No active crew'} />
          </TextInputWrapper>

          <div style={{ margin: '20px 0 15px' }}>
            <h4>Receive</h4>
            <SKUHighlight>
              <CrewmateCreditIcon />
              <span style={{ marginLeft: 8 }}>1 Crewmate</span>
            </SKUHighlight>
          </div>

          <Button
            isTransaction
            onClick={onOpenCrew}
            style={{ width: '100%' }}>
            {activeCrew?.id ? 'Open Active Crew' : 'Recruit First Crewmate'}
          </Button>
        </Body>
      </CrewmatePurchaseForm>
    </Wrapper>
  );
};

export default CrewmateSKU;
