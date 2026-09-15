import { useState } from 'react';
import styled from 'styled-components';
import Loader from 'react-spinners/PuffLoader';

import { appConfig } from '~/appConfig';
import Image1 from '~/assets/images/hud_headers/Asteroid.png';
import Image2 from '~/assets/images/hud_headers/SurfaceShip.png';
import Image3 from '~/assets/images/hud_headers/Building_9.png';
import Image4 from '~/assets/images/hud_headers/BuildingSite_4.png';
import ClipCorner from '~/components/ClipCorner';
import NavIcon from '~/components/NavIcon';
import { DiscordIcon, TwitterXIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';

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

const QuestWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 300px;
  padding: 0 8px;
  position: relative;
  & > div {
    flex: 1;
    &:first-child {
      flex: 3;
    }
    &:nth-child(2) {
      font-size: 45px;
    }
    &:last-child {
      color: ${p => p.theme.colors.main};
      font-size: 15px;
      text-align: center;
    }
  }

  &:before {
    background: url(${p => p.bg}) no-repeat;
    background-position: top center;
    background-size: cover;
    content: '';
    display: block;
    height: 50%;
    left: 0;
    mask-image: linear-gradient(to bottom, black 0%, black 40%, transparent 100%);
    position: absolute;
    top: 0;
    width: 100%;
  }
`;


const quests = [
  {
    id: 1,
    title: 'Retweet the Influence Launch thread',
    icon: <TwitterXIcon />,
    bg: Image1
  },
  {
    id: 2,
    title: 'Follow Influence on X',
    icon: <TwitterXIcon />,
    bg: Image2
  },
  {
    id: 3,
    title: 'Join Influence on Discord',
    icon: <DiscordIcon />,
    bg: Image3
  },
  {
    id: 4,
    title: 'Retweet the Quest thread',
    icon: <TwitterXIcon />,
    bg: Image4
  },
];

const Quest = ({ quest }) => {
  return (
    <RewardBox onClick={() => window.open(appConfig.get('Url.socialQuests'))}>
      <QuestWrapper bg={quest.bg}>
        <div></div>
        <div>{quest.icon}</div>
        <div>{quest.title}</div>
      </QuestWrapper>
    </RewardBox>
  );
}


const RewardQuests = () => {
  const { isLaunched } = useCrewContext();
  const [error] = useState();
  const [loading] = useState();
  return (
    <Wrapper>
      <RewardsTitle>Powered By <b>Starknet Quest</b></RewardsTitle>
      <RewardsWrapperOuter>
        {!isLaunched && <ErrorWrapper>Coming soon.</ErrorWrapper>}
        {isLaunched && error && <ErrorWrapper>Something went wrong. Please try again.</ErrorWrapper>}
        {isLaunched && !error && loading && <LoadingWrapper><Loader color="white" size="60px" /></LoadingWrapper>}
        {isLaunched && !error && !loading && (
          <>
            <label>
              Individual quests. View quest status on <a href={appConfig.get('Url.socialQuests')} target="_blank">Starknet Quest</a>.
            </label>
            <RewardsWrapper gap={30} widthTarget={200}>
              {quests.map((quest) => <Quest key={quest.id} quest={quest} />)}
            </RewardsWrapper>
          </>
        )}
      </RewardsWrapperOuter>
    </Wrapper>
  );
};

export default RewardQuests;