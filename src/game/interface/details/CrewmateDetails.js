import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { Address, Crewmate, Entity, Time } from '@influenceth/sdk';
import LoadingAnimation from 'react-spinners/PuffLoader';

import CoverImageSrc from '~/assets/images/modal_headers/OwnedCrew.png';
import Button from '~/components/ButtonAlt';
import Details from '~/components/DetailsModal';
import {
  BackIcon,
  MyAssetIcon
} from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useConstants from '~/hooks/useConstants';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import useEarliestActivity from '~/hooks/useEarliestActivity';
import useCrewmate from '~/hooks/useCrewmate';
import MarketplaceLink from '~/components/MarketplaceLink';
import CrewmateCard from '~/components/CrewmateCard';
import CrewTraitIcon from '~/components/CrewTraitIcon';
import MouseoverInfoPane from '~/components/MouseoverInfoPane';
import formatters from '~/lib/formatters';
import TabContainer from '~/components/TabContainer';
import AnnotationBio from '~/components/AnnotationBio';
import EntityActivityLog from './EntityActivityLog';

const borderColor = 'rgba(200, 200, 200, 0.15)';
const breakpoint = 1375;

const tabContainerCss = css`
  color: white;
  font-size: 15px;
  flex: 1;
  @media (min-height: 950px) {
    max-height: 500px;
  }
  @media (max-width: ${breakpoint}px) {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.05);
    border: 2px solid rgba(${p => p.theme.colors.mainRGB}, 0.15);
    border-left: none;
    border-right: none;
    box-shadow: -4px 0 8px rgba(${p => p.theme.colors.mainRGB}, 0.25);
    margin-top: 0;
  }
`;

const History = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  margin-top: 5px;
  overflow: hidden;
  padding: 0 15px;
`;

const LogHeader = styled.ul``;
const Log = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  & ul {
    display: flex;
    flex-direction: column;
    list-style-type: none;
    margin: 0;
    padding: 5px 0;
  }
  & ${LogHeader} {
    @media (max-width: ${breakpoint}px) {
      display: none;
    }
  }

  & > div {
    border-top: 1px solid ${borderColor};
    flex: 1;
    height: 100%;
    overflow-y: auto;
    padding-right: 5px;
    margin-right: -5px;
    & ul {
      margin-right: -5px;
      @media (max-width: ${breakpoint}px) {
        margin-right: 0;
      }
    }

    @media (max-width: ${breakpoint}px) {
      border-top: none;
      height: auto;
      max-height: calc(100vh - 200px);
    }
  }

  @media (max-width: ${breakpoint}px) {
    display: block;
    margin: 0 -10px;
  }
`;

const foldOffset = 28;
const belowFoldMin = 256;

const CoverImage = styled.div`
  height: calc(80% + ${foldOffset}px);
  left: 0;
  max-height: calc(100% - ${foldOffset}px - ${belowFoldMin}px);
  position: absolute;
  top: 0;
  width: 100%;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    height: 33%;
    max-height: none;
  }

  &:before {
    background-color: #111;
    background-image: url(${p => p.src});
    background-repeat: no-repeat;
    background-position: ${p => p.center || 'center center'};
    background-size: cover;
    content: '';
    display: block;
    height: 100%;
    mask-image: linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.6) 10%, rgba(0, 0, 0, 0.6) 75%, transparent 100%);
    transition:
      background-position 750ms ease-out,
      opacity 750ms ease-out;
  }
`;

const MainContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: flex-start;
  margin-top: 60px;
  overflow: hidden;
  padding: 25px 35px;
  position: relative;
  z-index: 1;
`;

const AboveFold = styled.div`
  align-items: stretch;
  display: flex;
  flex-direction: row;
  min-height: 375px;
`;

const CardSection = styled.div`
  flex: 0 0 225px;
`;

const CardWrapper = styled.div`
  background: black;
  border: 1px solid #363636;
  margin-bottom: 20px;
  padding: 6px;
  width: 100%;
`;

const TraitsAndBio = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 20px;
  & > h3 {
    border-bottom: 1px solid #333;
    color: #888;
    font-size: 14px;
    margin: 0;
    padding-bottom: 6px;
    text-transform: uppercase;
  }
`;

const TraitWrapper = styled.div`
  min-height: 180px;
  padding: 10px 0;
`;
const TraitRow = styled.div`
  line-height: 55px;
  font-size: 70px;
  & > span {
    display: inline-block;
    margin-right: 4px;
  }
`;

const MouseoverTitle = styled.div`
  border-bottom: 1px solid #222;
  color: ${p => p.highlight ? p.theme.colors.main : '#999'};
  font-size: 14px;
  padding-bottom: 4px;
  text-transform: uppercase;
`;
const MouseoverBody = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding: 10px 0 0;
  & > div:not(:first-child) {
    padding-left: 15px;
    & > h3 {
      color: white;
      font-size: 16px;
      margin: 0 0 6px;
    }
    & > p {
      color: #888;
      font-size: 14px;
      margin: 0;
    }
  }
`;
const MouseoverIcon = styled.div`
  font-size: 80px;
  line-height: 0;
`;

const BioWrapper = styled.div`
  color: ${p => p.isAutogenerated ? '#999' : p.theme.colors.main};
  font-size: 95%;
  line-height: 1.5em;
  padding: 10px 15px;
`;

const ManagementContainer = styled.div`
  border-left: 1px solid #363636;
  display: flex;
  flex-direction: column;
  flex: 0 0 280px;
  margin-left: 30px;
  padding-left: 30px;
  & > div {
    margin-top: 20px;
    &:first-child {
      margin-top: 0;
    }

    & > button {
      margin-bottom: 8px;
      width: 225px;
    }
  }
`;
const MyCrewStatement = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  font-weight: bold;
  & > svg {
    font-size: 24px;
    margin-right: 10px;
  }
`;
const Stat = styled.div`
  color: white;
  &:before {
    content: "${p => p.label}:";
    display: block;
    opacity: 0.7;
  }
`;

const BelowFold = styled.div`
  flex: 1;
  height: 0;
  padding-top: 10px;
`;

const noop = () => {/* noop */};

const mouseoverPaneProps = (visible) => ({
  css: css`
    padding: 10px;
    pointer-events: ${visible ? 'auto' : 'none'};
    width: 400px;
  `,
  placement: 'top',
  visible
});

const PopperWrapper = (props) => {
  const [refEl, setRefEl] = useState();
  return props.children(refEl, props.disableRefSetter ? noop : setRefEl);
}

const MouseableCrewTrait = (props) => {
  const [hovered, setHovered] = useState();
  return (
    <PopperWrapper>
      {(refEl, setRefEl) => (
        <span
          ref={setRefEl}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered()}>
          <CrewTraitIcon {...props} />

          <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered)}>
            <MouseoverTitle highlight={props.type === 'impactful'}>
              {props.type === 'impactful' ? 'Impactful Trait' : 'Trait'}
            </MouseoverTitle>
            <MouseoverBody>
              <MouseoverIcon>
                <CrewTraitIcon {...props} />
              </MouseoverIcon>
              <div>
                <h3>{Crewmate.getTrait(props.trait).name}</h3>
                <p>{formatters.crewmateTraitDescription(Crewmate.getTrait(props.trait).description)}</p>
              </div>
            </MouseoverBody>
          </MouseoverInfoPane>
        </span>
      )}
    </PopperWrapper>
  );
};

const CrewmateDetails = ({ crewmateId, crewmate, isOwnedCrewmate }) => {
  const history = useHistory();

  const { data: earliestActivity, isLoading: earliestLoading } = useEarliestActivity({ id: crewmateId, label: Entity.IDS.CREWMATE });

  const { data: TIME_ACCELERATION } = useConstants('TIME_ACCELERATION');

  const viewingAs = useMemo(() => ({ id: crewmateId, label: Entity.IDS.CREWMATE }), [crewmateId]);

  const onBackToCrew = useCallback(() => {
    if (crewmate?.Control?.controller.id) {
      history.push(`/crew/${crewmate?.Control?.controller.id}`);
    }
  }, [crewmate]);

  const formationDate = useMemo(() => {
    if (earliestLoading) return '...';
    if (!earliestActivity) return 'Unknown';
    return `${Time.fromUnixSeconds(earliestActivity?.event?.timestamp, TIME_ACCELERATION).toGameClockADays(true)} SA`;
  }, [earliestActivity, earliestLoading]);

  return (
    <>
      <MainContainer>
        <AboveFold>
          <CardSection>
            <CardWrapper>
              <CrewmateCard crewmate={crewmate} showClassInHeader />
            </CardWrapper>
            <Button onClick={onBackToCrew} width={150}>
              <BackIcon /> <span>Crew</span>
            </Button>
          </CardSection>

          <TraitsAndBio>
            <h3>Traits</h3>
            <TraitWrapper>
              <TraitRow>
                {(crewmate?.Crewmate?.impactful || []).map((i) => (
                  <MouseableCrewTrait key={i} trait={i} type="impactful" opaque />
                ))}
              </TraitRow>
              <TraitRow>
                {(crewmate?.Crewmate?.cosmetic || []).map((i) => (
                  <MouseableCrewTrait key={i} trait={i} type="cosmetic" opaque />
                ))}
              </TraitRow>
            </TraitWrapper>

            <h3>Brief</h3>
            {/* TODO: a real bio would replace this if set, AND would set isAutogenerated to false */}
            <BioWrapper isAutogenerated>
              {crewmate?.Name?.name}
              {crewmate?.Crewmate?.coll === 4
                ? ` is an Adalian, born after the arrival of the Arvad to the Belt.`
                : ` is one of the rare surviving members of the Arvad manifest.`}
              {crewmate?.Crewmate?.title > 0
                ? ` Officially, their title is ${Crewmate.Entity.getTitle(crewmate)?.name}, but they have functioned
                    as a ${Crewmate.Entity.getClass(crewmate)?.name} in Adalia since ${formationDate}.`
                : ` They officially began as a ${Crewmate.Entity.getClass(crewmate)?.name} in Adalia in ${formationDate}.`
              }
            </BioWrapper>
          </TraitsAndBio>

          <ManagementContainer>
            {/* TODO: warning on crewmate on my crew but that i do not own */}
            {/* TODO: warning on crewmate i own that is on a different crew */}
            {isOwnedCrewmate && <MyCrewStatement><MyAssetIcon /> This crewmate asset is owned by me.</MyCrewStatement>}
            <Stat label="Start Date">{formationDate}</Stat>
            {crewmate?.Crewmate?.title > 0 && <Stat label="Title">{Crewmate.Entity.getTitle(crewmate)?.name}</Stat>}
            <Stat label="Collection">{Crewmate.Entity.getCollection(crewmate)?.name}</Stat>

            <div style={{ flex: 1 }} />

            {isOwnedCrewmate && (
              <div style={{ paddingTop: 15 }}>
                {/* <Button disabled>Edit Bio</Button> */}
                <MarketplaceLink
                  chain={crewmate?.Nft?.chain}
                  assetType="crewmate"
                  id={crewmate?.id}>
                  {(onClick, setRefEl) => <Button setRef={setRefEl} onClick={onClick}>List for Sale</Button>}
                </MarketplaceLink>
              </div>
            )}
          </ManagementContainer>
        </AboveFold>

        <BelowFold>
          <TabContainer
            containerCss={tabContainerCss}
            containerHeight="36px"
            iconCss={{}}
            labelCss={{
              minWidth: '50px',
              textAlign: 'center',
              textTransform: 'uppercase'
            }}
            tabCss={{ padding: '0 30px', width: 'auto' }}
            tabs={[
              {
                label: 'Crewmate Log',
              },
              {
                label: 'Crewmate Bio',
              }
            ]}
            paneCss={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'hidden' }}
            panes={[
              <EntityActivityLog entity={crewmate} viewingAs={viewingAs} />,
              <AnnotationBio entity={crewmate} isEditable={isOwnedCrewmate} />
            ]}
          />
        </BelowFold>
      </MainContainer>
    </>
  );
};

const Wrapper = () => {
  const { i } = useParams();
  const { accountAddress } = useSession();
  const { crewmateMap, loading: myCrewLoading } = useCrewContext();
  const history = useHistory();

  const { data: crewmate, isLoading: crewmateLoading } = useCrewmate(Number(i));

  const createAlert = useStore(s => s.dispatchAlertLogged);

  useEffect(() => {
    // if id is specified...
    if (i) {
      // ...return to / with error if crew not found
      if (!crewmateLoading && !crewmate) {
        createAlert({
          type: 'GenericAlert',
          data: { content: 'Invalid Crewmate ID specified.' },
          level: 'warning',
          duration: 5000
        });
        history.replace('/');
      }

    // if i is not specified and I am not logged in... return to / without warning
    } else {
      history.replace('/');
    }
  }, [crewmateLoading, crewmate, i]);

  const loading = myCrewLoading || crewmateLoading;
  // TODO: onClose, should maybe just go "back", but possibly should go to "crew" page
  return (
    <Details
      edgeToEdge
      headerProps={{ background: 'true', v2: 'true' }}
      onCloseDestination="/"
      contentInnerProps={{ style: { display: 'flex', flexDirection: 'column', height: '100%' } }}
      title={<>Crewmate Details</>}
      width="1250px">
      <CoverImage src={CoverImageSrc} />
      {loading && (
        <div style={{ position: 'absolute', left: 'calc(50% - 30px)', top: 'calc(50% - 30px)' }}>
          <LoadingAnimation color="white" />
        </div>
      )}
      {crewmate && !loading && (
        <CrewmateDetails
          crewmateId={i}
          crewmate={crewmate}
          isOwnedCrewmate={Address.areEqual(crewmateMap[i]?.Nft?.owner, accountAddress)}
        />
      )}
    </Details>
  );
};

export default Wrapper;
