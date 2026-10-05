import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import styled from 'styled-components';

import useSession from '~/hooks/useSession';
import useBook from '~/hooks/useBook';
import useCreateStorySession from '~/hooks/useCreateStorySession';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import CrewmateCard from '~/components/CrewmateCard';
import Details from '~/components/DetailsModal';
import Loader from '~/components/Loader';
import NavIcon from '~/components/NavIcon';
import TitleWithUnderline from '~/components/TitleWithUnderline';
import {
  ArvadIcon,
  BackIcon,
  CheckIcon,
  ChevronDoubleDownIcon as SelectIcon,
  CollapsedIcon,
  ExpandedIcon,
  LockIcon,
  WarningOutlineIcon
} from '~/components/Icons';
import SvgFromSrc from '~/components/SvgFromSrc';

import theme from '~/theme.js';

const crewStates = {
  ready: {
    alwaysOn: ['button'],
    button: 'Ready to Start',
    buttonAttention: true,
    buttonHover: 'Begin Assignment',
    buttonIconHover: null,
    clickable: true,
    icon: <SelectIcon />,
    rgb: theme.colors.mainRGB,
    rgbHover: '255, 255, 255',
  },
  notReady: {
    alwaysOn: ['button', 'caption', 'icon'],
    button: 'Not Ready',
    caption: 'This character must finish a previous chapter first.',
    fade: true,
    icon: <WarningOutlineIcon />,
    rgb: '200, 129, 55'
  },
  complete: {
    alwaysOn: ['button', 'icon'],
    button: 'Finished',
    clickable: true,
    fade: true,
    icon: <CheckIcon />,
    rgb: theme.colors.successRGB,
  },
  incomplete: {
    alwaysOn: ['button'],
    button: 'Continue »',
    buttonAttention: true,
    clickable: true,
    icon: <SelectIcon />,
    rgb: '255, 255, 255',
  }
};

const HEADER_HEIGHT = 40;

const SectionContainer = styled.div`
  flex: 1;
  position: relative;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 0 10px;
    ${p => !p.visible ? 'display: none;' : ''}
  }
`;

const SectionHeader = styled.div`
  height: ${HEADER_HEIGHT}px;
`;

const SectionBody = styled.div`
  height: calc(100% - ${HEADER_HEIGHT}px - 1.5em);
  margin-top: 1.5em;
  overflow: auto;
  scrollbar-width: thin;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    margin-top: 10px;
  }
`;

const SectionSpacer = styled.div`
  width: 40px;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const CrewHeader = styled(SectionHeader)`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const MobileCrewHeaderContainer = styled.div`
  display: none;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: flex;
    flex-direction: row;
    & ${CrewHeader} {
      display: flex;
      flex: 1;
    }
    & > div:first-child {
      align-items: center;
      display: flex;
      font-size: 24px;
      height: ${HEADER_HEIGHT}px;
      justify-content: center;
      width: ${HEADER_HEIGHT}px;
    }
  }
`;

const CrewSection = styled(SectionBody)`
  padding-left: 3px;
  padding-top: 3px;
  & > div {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    @media (min-width: ${p => p.theme.breakpoints.xl}px) {
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    }
    & > div {
      padding: 0 12px 12px 0;
      @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
        padding-right: 0;
      }
    }
  }
`;

const CrewlessSection = styled(SectionBody)`
  padding: 15px;
  background: rgba(51, 51, 51, 0.5);
  text-align: center;
  & > div {
    & > a {
      white-space: nowrap;
    }
  }
`;

const SectionTitle = styled.div`
  font-size: 16px;
  font-weight: bold;
`;

const SectionSubtitle = styled.div`
  font-size: 13px;
  line-height: 1.6em;
  opacity: 0.6;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    white-space: nowrap;
  }
`;

const BookHeader = styled(SectionHeader)`
  align-items: flex-end;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  color: ${p => p.theme.colors.main};
  display: flex;
  font-size: 16px;
  text-transform: uppercase;

  & > * {
    height: 32px;
  }
`;
const BookIcon = styled.div`
  font-size: 2em;
  margin-right: 12px;
  margin-bottom: 12px;
`;

const BookBody = styled(SectionBody)`
  padding-right: 10px;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding-right: 0px;
  }
`;

const PartTitle = styled.div`
  cursor: ${p => p.theme.cursors.active};
  div:nth-child(1) {
    color: ${p => p.theme.colors.main};
    flex: 1;
    font-size: 13px;
  }
  div:nth-child(2) {
    font-size: 20px;
  }
`;
const PartSection = styled.div`
  margin-top: 1.5em;
  &:first-child { margin-top: 0; }
  & > ${PartTitle} {
    display: flex;
    justifyContent: space-between;
    height: 24px;
    width: 100%;
  }
`;

const ChaptersContainer = styled.div`
  max-height: ${p => p.collapsed ? '1px' : '400px'};
  overflow: hidden;
  transition: max-height 250ms ease-out;
`;

const ChapterRowInner = styled.div`
  border-bottom: 1px solid rgba(255,255,255,0.2);
  flex: 1;
  height: 100%;
  margin-left: 0.75em;
  padding: 6px 0;

  & > div {
    align-items: center;
    background-color: ${p => p.selected ? 'rgba(255, 255, 255, 0.2)' : 'none'};
    display: flex;
    font-size: 13px;
    height: 100%;
    padding: 0 6px 0 12px;
    transition: background-color 200ms ease;

    & > div {
      flex: 1;
      font-size: 17px;
    }
  }
`;

const ChapterRow = styled.div`
  align-items: center;
  color: ${p => p.status === 'locked' ? '#666' : 'white'};
  cursor: ${p => p.status === 'locked' ? null : p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  height: 48px;

  &:first-child ${ChapterRowInner} {
    border-top: 1px solid rgba(255,255,255,0.2);
  }

  &:hover ${ChapterRowInner} > div {
    background-color: ${p => p.status === 'locked' ? null : 'rgba(255, 255, 255, 0.25)'};
  }
`;

const diamondConnectionHeight = 20;
const DiamondContainer = styled.div`
  align-items: center;
  display: flex;
  font-size: 80%;
  height: 100%;
  justify-content: center;
  margin: 0 0.1em 0 0.5em;
  position: relative;
  width: 1em;
  z-index: 2;
  ${(p) => p.connect && `
    &:before {
      content: '';
      position: absolute;
      height: ${diamondConnectionHeight}px;
      width: 0;
      border-left: 1px dotted #AAA;
      bottom: calc(100% - ${diamondConnectionHeight / 2}px);
      left: calc(50% - 1px);
      z-index: 1;
    }`}
`;

const ChapterProgressContainer = styled.span`
  align-items: center;
  color: ${p => p.status === 'complete' ? p.theme.colors.success : p.theme.colors.main};
  display: flex;
  flex-direction: row;
  &:before {
    content: "${p => p.crewReady > 0 ? p.crewReady : ''}";
    margin-right: 6px;
  }
`;

const ProgressIcon = styled.span`
  border-radius: 50%;
  display: block;
  height: ${p => p.size};
  width: ${p => p.size};
  ${p => {
    if (p.status === 'notReady') {
      return `border: 0.2em solid currentColor;`;
    } else if (p.status === 'full') {
      return `background: currentColor;`;
    } else if (p.status === 'partial') {
      return `background: linear-gradient(to right, ${p.inactiveColor} 50%, currentColor 50%);`;
    }
    return '';
  }}
`;

// TODO: ecs refactor
const CrewAssignments = () => {
  const { id: bookId, selected: initialSelectedId } = useParams();
  const history = useHistory();
  const { authenticated } = useSession();

  const createStorySession = useCreateStorySession();
  const { crew, crewmateMap } = useCrewContext();
  const { data: book, isError } = useBook(bookId);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const playSound = useStore(s => s.dispatchEffectStartRequested);

  const [collapsedParts, setCollapsedParts] = useState([]);
  const [bookReady, setBookReady] = useState(false);
  const [mobileView, setMobileView] = useState('book');
  const [selectedStory, setSelectedStory] = useState();

  // TODO: genesis book deprecation vvv
  const eligibleCrew = useMemo(() => {
    if (crew && crewmateMap) {
      const eligible = crew._crewmates
        .filter((i) => [1,2,3].includes(crewmateMap[i]?.crewCollection))
        .map((i) => crewmateMap[i]);
      if (eligible.length === 0) history.push('/crew');
      return eligible;
    }
    return null;
  }, [crew?._crewmates, crewmateMap]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^^^

  const selectStory = useCallback((story) => () => {
    if (story) {
      playSound('click');
      setSelectedStory(story);
      setMobileView('crew');
    } else {
      playSound('failure');
    }
  }, [playSound]);

  const selectCrewmate = useCallback((crewId) => async () => {
    if (bookReady && selectedStory) {
      const crewStatus = selectedStory.crewStatuses[crewId];
      if (crewStatus && !['notReady', 'loading'].includes(crewStatus)) {
        let session = (selectedStory.sessions || []).find((s) => s.owner === crewId);

        // if no session yet, create one
        if (!session) {
          session = await new Promise((resolve, reject) => {
            createStorySession.mutate({
              bookId,
              storyId: selectedStory.id,
              crewId
            }, {
              onSuccess: resolve,
              onError: reject
            })
          });
        }

        if (session) {
          playSound('success');
          history.push(`/crew-assignment/${session.id}`);
          return;
        }
      }
      return;
    }

    playSound('failure');
  }, [bookId, bookReady, createStorySession, history, playSound, selectedStory]);

  useEffect(() => {
    if (book && eligibleCrew) {
      let firstIncompleteStory = null;
      let initialSelectedStory = null;
      let lastStory = null;
      let crewReadyForNext = eligibleCrew.map(({ i }) => i);
      book.parts.forEach(({ stories }) => {
        stories.forEach((item, i) => {
          if (!item.story) item.story = { id: `placeholder_${i}` };

          const { story } = item;
          const comingSoon = !story.title
            || story.title === 'COMING_SOON'
            || (story.availableOn && new Date(story.availableOn) > new Date());
          if (comingSoon) {
            story.status = 'locked';
          } else {
            story.crewStatuses = {};
            story.ready = 0;
            story.partial = 0;
            story.complete = 0;

            const crewCompleted = [];
            eligibleCrew.forEach(({ i }) => {
              if (crewReadyForNext.includes(i)) {
                const crewSession = (story.sessions || []).find((s) => s.owner === i);
                if (crewSession && crewSession.isComplete) {
                  story.complete++;
                  story.crewStatuses[i] = 'complete';
                  crewCompleted.push(i);
                } else if (crewSession && !crewSession.isComplete) {
                  story.partial++;
                  story.crewStatuses[i] = 'incomplete';
                } else {
                  story.ready++;
                  story.crewStatuses[i] = 'ready';
                }
              } else {
                story.crewStatuses[i] = 'notReady';
              }
            });
            crewReadyForNext = crewCompleted;

            // set story status
            story.status = 'notReady';
            if (eligibleCrew?.length > 0) {
              if (story.complete === eligibleCrew.length) {
                story.status = 'complete';
              } else if (story.ready + story.partial === eligibleCrew.length) {
                story.status = 'full';
              } else if (story.ready + story.partial + story.complete === eligibleCrew.length) {
                story.status = 'partial';
              }
            }

            // set story of desired selection from url (if any)
            if (initialSelectedId && initialSelectedId === story.id) {
              initialSelectedStory = story;
            }
            // find first incomplete story (and keep track of last story as fallback)
            if (firstIncompleteStory === null && story.status !== 'complete') {
              firstIncompleteStory = story;
            }
            lastStory = story;
          }
        });
      });
      setSelectedStory(initialSelectedStory || firstIncompleteStory || lastStory);
      setBookReady(true);
    }
  }, [book, eligibleCrew, initialSelectedId]);

  const togglePart = useCallback((partId) => () => {
    playSound('click');
    if (collapsedParts.includes(partId)) {
      setCollapsedParts(
        collapsedParts.filter((p) => p !== partId)
      );
    } else {
      setCollapsedParts([
        ...collapsedParts,
        partId
      ]);
    }
  }, [collapsedParts, playSound]);

  if (!book && isError) { // TODO: if this page is ever restored, the following createAlert is no longer in correct format
    createAlert({
      type: 'GenericLoadingError',
      label: 'crew assignment collection',
      level: 'warning',
    });
    history.push('/');
  }

  const { title, parts } = book || {};
  return (
    <Details title="Crew Assignments" maxWidth="2200px" width="max">
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%'
      }}>
        <SectionContainer visible={mobileView === 'book'}>
          {!bookReady && <Loader />}
          {bookReady && (
            <>
              <BookHeader>
                <BookIcon>
                  {book.icon && <SvgFromSrc src={book.icon} />}
                  {!book.icon && <ArvadIcon />}
                </BookIcon>
                <TitleWithUnderline>{title}</TitleWithUnderline>
              </BookHeader>
              <BookBody>
                {parts.map(({ title, stories }, x) => {
                  const isCollapsed = collapsedParts.includes(title);
                  return (
                    <PartSection key={x}>
                      <PartTitle onClick={togglePart(title)}>
                        <div>{title}</div>
                        <div>{isCollapsed ? <CollapsedIcon /> : <ExpandedIcon />}</div>
                      </PartTitle>
                      <ChaptersContainer collapsed={isCollapsed}>
                        {stories.map(({ story }, i) => {
                          const { id, title, ready, partial, status } = (story || { id: i, status: 'locked' });
                          return (
                            <ChapterRow
                              key={id}
                              onClick={selectStory(status === 'locked' ? null : story)}
                              status={status}>
                              <DiamondContainer connect={i > 0}>
                                <NavIcon
                                  animate
                                  selected={selectedStory && id === selectedStory.id} />
                              </DiamondContainer>
                              <ChapterRowInner index={x} selected={selectedStory && id === selectedStory.id}>
                                <div>
                                  <div>{status === 'locked' ? 'Coming Soon' : title}</div>
                                  {status === 'locked' && <LockIcon style={{ opacity: 0.7 }} />}
                                  {status !== 'locked' && (
                                    <ChapterProgressContainer crewReady={ready + partial} status={status}>
                                      {status === 'complete' && <CheckIcon />}
                                      {status !== 'complete' && (
                                        <ProgressIcon size="1em"
                                          inactiveColor="#003f54"
                                          status={status}
                                        />
                                      )}
                                    </ChapterProgressContainer>
                                  )}
                                </div>
                              </ChapterRowInner>
                            </ChapterRow>
                          )
                        })}
                      </ChaptersContainer>
                    </PartSection>
                  );
                })}
              </BookBody>
            </>
          )}
        </SectionContainer>

        <SectionSpacer />

        <SectionContainer visible={mobileView === 'crew'}>
          {authenticated && !eligibleCrew && <Loader />}
          {!(authenticated && !eligibleCrew) && (
            <>
              <CrewHeader>
                <SectionTitle>Owned Crew ({eligibleCrew?.length || 0})</SectionTitle>
                <SectionSubtitle>Select a Crewmate to begin the assignment with:</SectionSubtitle>
              </CrewHeader>

              <MobileCrewHeaderContainer>
                <div onClick={() => setMobileView('book')}>
                  <BackIcon />
                </div>
                <CrewHeader>
                  <SectionTitle>{selectedStory?.title || ''}</SectionTitle>
                  <SectionSubtitle>Select a Crewmate to begin the assignment:</SectionSubtitle>
                </CrewHeader>
              </MobileCrewHeaderContainer>

              {eligibleCrew && eligibleCrew.length > 0
                ? (
                  <CrewSection>
                    <div>
                      {eligibleCrew.map((c) => {
                        const crewStatus = bookReady ? selectedStory?.crewStatuses[c.id] : 'loading';
                        const uiConfig = crewStates[crewStatus || 'notReady'] || {};
                        return (
                          <div key={c.id}>
                            <CrewmateCard
                              crewmate={c}
                              clickable={uiConfig.clickable}
                              fade={uiConfig.fade}
                              overlay={uiConfig}
                              onClick={selectCrewmate(c.id)} />
                          </div>
                        );
                      })}
                    </div>
                  </CrewSection>
                )
                : (
                  <CrewlessSection>
                    <h4>You must have a crew to complete crew assignments.</h4>
                    {/* NOTE: this is deprecated for now because any new crew will not be in an eligible
                      collection for these assignments

                    <div>
                      <a href={`${appConfig.get('Url.ethereumNftMarket')}/collection/influence-crew`} target="_blank" rel="noreferrer">Click here</a>
                      {' '}to acquire crewmates through trade, or <Link to="/crew">click here</Link> to mint your own.
                    </div>
                    */}
                  </CrewlessSection>
                )
              }
            </>
          )}
        </SectionContainer>
      </div>
    </Details>
  );
};

export default CrewAssignments;
