import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';

import adalianImage from '~/assets/images/crew_collections/4.png'
import useCrewContext from '~/hooks/useCrewContext';
import useBookSession, { bookIds } from '~/hooks/useBookSession';
import useStore from '~/hooks/useStore';
import AdalianFlourish from '~/components/AdalianFlourish';
import ConfirmationDialog from '~/components/ConfirmationDialog';
import CrewmateCard from '~/components/CrewmateCard';
import NavIcon from '~/components/NavIcon';
import CrewSilhouetteCard from '~/components/CrewSilhouetteCard';
import ChoicesDialog from '~/components/ChoicesDialog';
import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import { nativeBool } from '~/lib/utils';


const RecruitingDiv = styled.div`
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.3);
  padding: 4px;
`;

const SilhouetteWrapper = styled.div`
  opacity: 0.3;
`;

const NavSpacer = styled.div`
  border-top: 1px dotted ${p => p.completed ? '#FFF' : '#777'};
  height: 0;
  margin: 0 8px;
  width: 1.5em;

  ${p => p.steps > 4 && `
    opacity: 0;
    width: 0.5em;
  `}
`;

const PagePrompt = styled.div`
  color: white;
  margin-bottom: 1em;
`;

const Progress = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  & > label {
    font-size: 20px;
    color: ${p => p.theme.colors.secondaryText};
  }
  & > div {
    align-items: center;
    display: flex;
    flex-direction: row;
    font-size: 20px;
    margin-left: 25px;
  }
`;

const PromptDetails = styled.div`
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  color: ${p => p.theme.colors.main};
  padding: 1em 2em;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 1em;
  }
`;

const CrewContainer = styled.div`
  min-width: 200px;
  padding-bottom: 12px;

  background-position: top center;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const REQUIRE_CONFIRM = false;

const CrewAssignment = ({ crewId, crewmateId, crewmateMap, onFinish, overrides = {} }) => {
  const { captain, crew } = useCrewContext();
  const history = useHistory();

  const {
    bookError,
    bookSession,
    storySession,
    choosePath,
    undoPath
  } = useBookSession(crewId, crewmateId);

  const playSound = useStore(s => s.dispatchEffectStartRequested);

  const [confirmingExitStoryMode, setConfirmingExitStoryMode] = useState();
  const [pathLoading, setPathLoading] = useState();
  const [selection, setSelection] = useState();

  let onCloseDestination;
  if (Object.keys(crewmateMap || {}).length > 0) {
    onCloseDestination = '/crew';
  } else {
    onCloseDestination = '/';
  }

  useEffect(() => {
    if (bookError) history.push(onCloseDestination);
  }, [bookError, onCloseDestination]);

  // on step change, clear selection (to close modal) and set pseudo path-loading
  useEffect(() => {
    setSelection();

    setPathLoading(true);
    setTimeout(() => { setPathLoading(false); }, 100);
  }, [storySession?.currentStep]);

  const confirmPath = useCallback(() => {
    playSound('click');
    choosePath(selection.id);
  }, [choosePath, playSound, selection]);

  const selectPath = useCallback((path) => () => {
    playSound('click' );

    // if only one choice (or auto confirming), don't need to confirm
    if (!REQUIRE_CONFIRM || storySession?.linkedPaths?.length === 1) {
      choosePath(path.id);

    // else, confirm in modal
    } else {
      setSelection(path);
    }
  }, [choosePath, playSound, storySession]);

  const onGoBack = useCallback(() => {
    playSound('click');
    history.push(onCloseDestination);
  }, [history, playSound, onCloseDestination]);

  const onUndoPath = useCallback(() => {
    undoPath();
  }, [undoPath]);

  const finish = useCallback(() => {
    if (overrides?.onFinish) {
      overrides?.onFinish();
      return;
    }
    playSound('success');
    choosePath('x');
    onFinish(); // ${bookSession?.isMintingStory ? 'create' : 'complete'}
  }, [history, playSound, bookSession?.isMintingStory, overrides?.onFinish]);

  const confirmExitStoryMode = useCallback(() => {
    setConfirmingExitStoryMode(true);
  }, []);

  const onConfirmExitStoryMode = useCallback(() => {
    onFinish(); // ${bookSession?.isMintingStory ? 'create' : 'complete'}
  }, []);

  const backButton = useMemo(() => {
    if (bookSession && storySession && !(bookSession.currentStoryIndex === 0 && storySession.currentStep === 0)) {
      return {
        label: 'Back',
        onClick: overrides?.onBack || ((bookSession.currentStoryIndex > 0 || storySession.currentStep > 0) ? onUndoPath : onGoBack),
      };
    }
    return null;
  }, [bookSession, onUndoPath, onGoBack, overrides?.onBack, storySession]);

  const dialogProps = useMemo(() => {
    if (!bookSession || !storySession) return {};

    const isMintingStory = bookSession.isMintingStory;
    const isLastPageOfStory = storySession.isLastPage;
    const isLastPageOfBook = isLastPageOfStory && bookSession.isLastStory;

    const nextButton = {
      label: overrides?.finishButtonLabel || (isLastPageOfBook ? 'Finish' : (isLastPageOfStory ? 'Next Chapter' : 'Next') ),
      onClick: isLastPageOfBook ? finish : selectPath(storySession.linkedPaths[0]),
      props: overrides?.finishButtonProps || undefined
    }
    
    // assignment defaults
    const p = {
      choicelessInFooter: true,
      choicelessButton: { ...nextButton },
      dialogTitle: 'Random Event',
      flourish: (
        <CrewContainer>
          <CrewCaptainCardFramed crewId={crewId || crew?.id} width={200} />
        </CrewContainer>
      ),
      flourishWidth: 220,
      leftButton: backButton,
      rightButton: (isLastPageOfStory && isMintingStory) ? { ...nextButton } : null,
    };

    // minting story overrides
    if (isMintingStory) {
      p.choicelessInFooter = false;
      p.dialogTitle = 'Crewmate Creation';

      // flourish
      if (bookSession.bookId === bookIds.ADALIAN_RECRUITMENT) {
        p.flourish = <AdalianFlourish />;
        p.flourishWidth = 205;

      } else {
        p.flourish = (
          <CrewContainer isMintingStory>
            <RecruitingDiv>
              {bookSession.crewmate
                ? <CrewmateCard
                    crewmate={bookSession.crewmate || captain}
                    hideIfNoName
                    noWrapName
                    showClassInHeader
                    width="225px" />
                : <SilhouetteWrapper><CrewSilhouetteCard /></SilhouetteWrapper>
              }
            </RecruitingDiv>
          </CrewContainer>
        );
        p.flourishWidth = 250;
      }

      // don't use choiceless button on last page of minting story + update rightButton text
      if (isLastPageOfStory) {
        p.choicelessButton = null;
        if (isMintingStory && p.rightButton && isLastPageOfBook) {
          p.rightButton.label = 'Finalize Crewmate';
        }

      // on minting story, offer "skip story" button on first page
      } else if (bookSession.currentStoryIndex === 0 && storySession.currentStep === 0) {
        p.rightButton = {
          label: 'Skip Story',
          onClick: confirmExitStoryMode,
          props: {
            disabled: nativeBool(isLastPageOfBook)
          }
        };
      }
    }

    return p;
  }, [backButton, bookSession, confirmExitStoryMode, crewId, overrides, storySession]);

  // TODO: v should probably redirect somewhere
  if (!bookSession || !storySession) return null;
  return (
    <>
      <ChoicesDialog
        {...dialogProps}
        onCloseDestination={onCloseDestination}
        coverImage={storySession.image}
        coverImageCenter={storySession.imageCenter}
        content={storySession.content}
        contentOverride={overrides?.content}
        choices={storySession.isLastPage ? null : storySession.linkedPaths}
        isHTML={storySession.isHTML}
        isLoading={overrides?.isLoading}
        isLoadingChoice={pathLoading}
        onSelect={selectPath}
        prompt={storySession.prompt}
        title={storySession.title}
        subtitle={storySession.totalSteps > 1 && (
          <Progress>
            <label>{Math.min(storySession.totalSteps, storySession.currentStep + 1)} of {storySession.totalSteps}</label>
            <div>
              {Array.from({ length: storySession.totalSteps }, (x, i) => {
                let color = '#777';
                if (i < storySession.currentStep) {
                  color = '#FFF'; //theme.colors.main;
                } else if (i === storySession.currentStep) {
                  color = '#FFF';
                }
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <NavSpacer steps={storySession.totalSteps} completed={i <= storySession.currentStep} />}
                    <NavIcon
                      animate
                      selected={i === storySession.currentStep}
                      size="1em"
                      color={color} />
                  </React.Fragment>
                );
              })}
            </div>
          </Progress>
        )}
      />

      {confirmingExitStoryMode && (
        <ConfirmationDialog
          body={(
            <div style={{ fontSize: '110%' }}>
              <div>
                Exiting story mode will allow you to select your character's traits
                all at once, in contrast to deriving their traits from the choices you
                make for them through their unique origin story.
              </div>
              <div style={{ marginTop: 15 }}>
                You will not be able to return to story mode once you exit.
              </div>
            </div>
          )}
          onConfirm={onConfirmExitStoryMode}
          onReject={() => setConfirmingExitStoryMode()}
        />
      )}

      {REQUIRE_CONFIRM && selection && (
        <ConfirmationDialog
          title="Your Selection:"
          body={(
            <>
              <PagePrompt>{storySession.prompt}</PagePrompt>
              <PromptDetails>{selection.text}</PromptDetails>
            </>
          )}
          onConfirm={confirmPath}
          onReject={selectPath()}
        />
      )}
    </>
  );
};

export default CrewAssignment;
