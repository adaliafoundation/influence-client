import { useCallback, useState } from 'react';
import styled from 'styled-components';
import Loader from 'react-spinners/PuffLoader';

import { appConfig } from '~/appConfig';
import AsteroidsHeroImage from '~/assets/images/sales/asteroids_hero.png';
import AsteroidSurfaceImage from '~/assets/images/hud_headers/Asteroid.png';
import ClipCorner from '~/components/ClipCorner';
import NavIcon from '~/components/NavIcon';
import AdalianFlourish from '~/components/AdalianFlourish';
import ArvadianFlourish from '~/components/ArvadianFlourish';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';

const missions = {
  community: [
    {
      id: 1,
      title: 'Romulus, Remus, and the Rest',
      Objective: 'Construct a building on Adalia Prime',
      'Mission Cap': '7,000 buildings'
    },
    {
      id: 2,
      title: 'Learn by Doing',
      Objective: 'Construct a Warehouse or an Extractor anywhere in the Belt',
      'Mission Cap': '6,000 buildings'
    },
    {
      id: 3,
      title: 'Four Pillars',
      Objective: 'Construct a Refinery, Bioreactor, Factory, or Shipyard anywhere in the Belt',
      'Mission Cap': '3,000 buildings'
    },
    {
      id: 4,
      title: 'Together, We Can Rise',
      Objective: 'Construct a Spaceport, Marketplace, or Habitat anywhere in the Belt',
      'Mission Cap': '400 buildings'
    },
    {
      id: 5,
      title: 'The Fleet',
      Objective: 'Construct a ship',
      'Mission Cap': '300 ships'
    },
    {
      id: 6,
      title: 'Rock Breaker',
      Objective: 'Mine one tonne of material',
      'Mission Cap': '12,000 tonnes'
    },
    {
      id: 7,
      title: 'Prospecting Pays Off',
      Objective: 'Take one core sample',
      'Mission Cap': '15,000 core samples'
    },
    {
      id: 8,
      title: 'Potluck',
      Objective: 'Manufacture 5 tonnes of food',
      'Mission Cap': '20,000 tonnes'
    },
  ],
  colonization: [
    {
      id: 1,
      title: 'Touchdown',
      Objective: 'Scan + Land on the asteroid',
      Reward: '50,000 SWAY',
      Beneficiary: 'Scanner'
    },
    {
      id: 2,
      title: 'Below the Surface',
      Objective: 'Build Extractor + Mine 10k tonnes',
      Reward: '75,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 3,
      title: 'Pack it Up',
      Objective: 'Build Warehouse + Store 3 different raw materials',
      Reward: '75,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 4,
      title: 'Refined Taste',
      Objective: 'Build Refinery + Refine a Product',
      Reward: '100,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 5,
      title: 'Industrial Revolution',
      Objective: 'Build Factory + Manufacture a product',
      Reward: '125,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 6,
      title: 'PoTAYto / PoTAHto',
      Objective: 'Build Bioreacter + Grow one standard recipe of potatoes',
      Reward: '150,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 7,
      title: 'Expansion and Exploration',
      Objective: 'Build Shipyard + Manufacture a ship',
      Reward: '200,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 8,
      title: 'Port City',
      Objective: 'Build Spaceport + Dock a ship',
      Reward: '225,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 9,
      title: 'Open for Business',
      Objective: 'Build Marketplace + 10 market orders filled',
      Reward: '250,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 10,
      title: 'Homesteading',
      Objective: 'Build Habitat + Have 5 Crewmates minted from that habitat',
      Reward: '500,000 SWAY',
      Beneficiary: 'Player'
    },
    {
      id: 11,
      title: 'We Built this City',
      Objective: 'Have all 9 buildings present on the asteroid simultaneously',
      Reward: '750,000 SWAY',
      Beneficiary: 'Asteroid Admin'
    }
  ]
};

const StyledNavIcon = styled(NavIcon).attrs((p) => ({
  color: p.theme.colors.darkMain,
  selected: true,
  selectedColor: p.theme.colors.darkMain,
  size: 20,
  background: 'black'
}))`
  position: absolute;
  bottom: -10px;
  left: 50%;
  margin-left: -14px;
`;  

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 20px 20px 0;
`;
const RewardsTitle = styled.div`
  border-bottom: 1px solid #222;
  color: #888;
  padding: 5px 0 15px;
  text-align: center;
  & > b {
    color: white;
    font-weight: normal;
  }
`;
const RewardsWrapperOuter = styled.div`
  flex: 1;
  overflow: hidden auto;
  padding: 25px 5px;
  & > label {
    color: #ccc;
    display: block;
    font-size: 15px;
    padding: 0 0 25px;
    text-align: center;
    & > a {
      color: ${p => p.theme.colors.main};
      transition: color 150ms ease;
      &:hover {
        color: ${p => p.theme.colors.brightMain};
      }
    }
  }
`;
const RewardsWrapper = styled.div`
  display: grid;
  gap: ${p => p.gap || 20}px;
  grid-template-columns: repeat(auto-fit, minmax(${p => p.widthTarget || 250}px, 1fr));
`;
const LoadingWrapper = styled.div`
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  width: 100%;
`;

const ErrorWrapper = styled(LoadingWrapper)``;

const rewardMenuCornerSize = 18;
const RewardBoxWrapper = styled.div`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.1);
  border: 1px solid ${p => p.theme.colors.darkMain};
  ${p => p.theme.clipCorner(rewardMenuCornerSize)};
  cursor: ${p => p.theme.cursors.active};
  position: relative;
  transition: background 150ms ease, border-color 150ms ease;
  width: 100%;

  & > svg:last-child {
    transition: color 150ms ease;
    color: ${p => p.theme.colors.darkMain};
  }
`;
const RewardBoxOuterWrapper = styled.div`
  position: relative;
  width: 100%;

  &:hover {
    & > ${RewardBoxWrapper} {
      background: rgba(${p => p.theme.colors.mainRGB}, 0.25);
      border-color: ${p => p.theme.colors.main};
      & > svg:last-child {
        color: ${p => p.theme.colors.main};
      }
    }
    & > ${StyledNavIcon} {
      & rect:first-child {
        stroke: ${p => p.theme.colors.main};
      }
      & rect:last-child {
        fill: white;
      }
    }
  }
`;

const RewardBox = ({ children, onClick }) => {
  return (
    <RewardBoxOuterWrapper onClick={onClick}>
      <RewardBoxWrapper>
        {children}
        <ClipCorner dimension={rewardMenuCornerSize} />
      </RewardBoxWrapper>
      <StyledNavIcon />
    </RewardBoxOuterWrapper>
  )
};

const MissionWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: ${p => p.mode === 'community' ? 340 : 400}px;
  padding: 0 8px;
  position: relative;
  & > div:first-child {
    flex: 0 0 145px;
    padding: 10px 0;
    width: 100%;
  }
  & > h3 {
    align-items: center;
    background: rgba(${p => p.theme.colors.mainRGB}, 0.5);
    color: white;
    display: flex;
    flex-shrink: 0;
    font-size: 110%;
    font-weight: normal;
    justify-content: center;
    min-height: 40px;
    margin: 0;
    padding: 5px 50px;
    text-align: center;
    text-transform: uppercase;
    width: 100%;
  }
  & > div:last-child {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: space-between;
    padding: 15px 20px 25px;
    & > div {
      text-align: center;
      & > h6 {
        color: #555;
        font-size: 14px;
        margin: 0 0 4px;
        text-transform: uppercase;
      }
      & > span {
        color: #ccc;
        font-size: 13px;
      }
    }
    & > hr {
      border-color: rgba(255, 255, 255, 0.05);
      width: 100%;
    }
  }

  &:before {
    background: url(${p => p.mode === 'community' ? AsteroidSurfaceImage : AsteroidsHeroImage}) no-repeat;
    background-position: top center;
    background-size: cover;
    content: '';
    display: block;
    height: 125px;
    left: 0;
    mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.9) 40%, transparent 100%);
    position: absolute;
    top: 0;
    width: 100%;
  }
`;
const Mission = ({ mission, mode }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const onClick = useCallback(() => {
    const targetUrl = mode === 'community' ? appConfig.get('Url.communityMissions') : appConfig.get('Url.colonizationMissions');
    if (targetUrl) {
      window.open(targetUrl);
    }
    else {
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Coming soon!' },
        duration: 1e3
      });
    }
  }, [createAlert, mode]);
  const { id, title, ...kvps } = mission;
  return (
    <RewardBox onClick={onClick}>
      <MissionWrapper mode={mode}>
        <div>{mode === 'community' ? <ArvadianFlourish /> : <AdalianFlourish />}</div>
        <h3>{mission.title}</h3>
        <div>
          {Object.keys(mission).map((k, i) => ['id', 'title'].includes(k) ? null : (
            <>
              {i > 0 && <hr/>}
              <div>
                <h6>{k}</h6>
                <span>{kvps[k]}</span>
              </div>
            </>
          ))}
        </div>
      </MissionWrapper>
    </RewardBox>
  );
};
const RewardMissions = ({ mode }) => {
  const { isLaunched } = useCrewContext();
  useState();
  const [error] = useState();
  const [loading] = useState();
  return (
    <Wrapper>
      <RewardsTitle>Powered By <b>Wendash</b></RewardsTitle>
      <RewardsWrapperOuter>
        {!isLaunched && <ErrorWrapper>Coming soon.</ErrorWrapper>}
        {isLaunched && error && <ErrorWrapper>Something went wrong. Please try again.</ErrorWrapper>}
        {isLaunched && !error && loading && <LoadingWrapper><Loader color="white" size="60px" /></LoadingWrapper>}
        {isLaunched && !error && !loading && (
          <>
            {mode === 'colonization' && (
              <label>
                Individual milestones with SWAY rewards.{' '}
                {appConfig.get('Url.colonizationMissions')
                  ? <>View your completion status on <a href={appConfig.get('Url.colonizationMissions')} target="_blank" rel="noopener noreferrer">Wendash</a>.</>
                  : <>Coming Soon</>
                }
              </label>
            )}
            {mode === 'community' && (
              <label>
                Players work together towards these massively social milestones.
                View your completion status on <a href={appConfig.get('Url.communityMissions')} target="_blank" rel="noopener noreferrer">Wendash</a>.
              </label>
            )}
            <RewardsWrapper>
              {missions[mode].map((mission) => (
                <Mission
                  key={mission.id}
                  mission={mission}
                  mode={mode} />
              ))}
            </RewardsWrapper>
          </>
        )}
      </RewardsWrapperOuter>
    </Wrapper>
  );
};

export default RewardMissions;