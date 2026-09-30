import { errorMessages } from '../../../../lib/errorMessages';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThrottle } from '@react-hook/throttle';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';
import { cloneDeep } from 'lodash';

import Button from '~/components/ButtonAlt';
import CrewmateCardFramed, { EmptyCrewmateCardFramed } from '~/components/CrewmateCardFramed';
import CrewLocationLabel from '~/components/CrewLocationLabel';
import LiveFoodStatus from '~/components/LiveFoodStatus';
import IconButton from '~/components/IconButton';
import { CloseIcon, CrewIcon, ManageCrewIcon, NewCrewIcon, PlusIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useHydratedCrew from '~/hooks/useHydratedCrew';
import useHydratedLocation from '~/hooks/useHydratedLocation';
import useStore from '~/hooks/useStore';
import useCrewSwapManager from '~/hooks/actionManagers/useCrewSwapManager';
import actionStages from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { reactBool, nativeBool } from '~/lib/utils';
import theme from '~/theme';
import { ActionDialogInner } from '../ActionDialog';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogBody,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer,
  FlexSectionBlock,
  ShipInputBlock,
  BuildingInputBlock,
  EmptyResourceImage,
  CrewSelectionDialog,
} from './components';

const Instructions = styled.div`
  color: ${p => p.isExchanging ? p.theme.colors.main : '#888'};
  font-size: 15px;
  transition: color 500ms ease;
`;

const Titlebar = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 10px;
  & > div:first-child {
    align-items: center;
    color: white;
    display: flex;
    flex-direction: row;
    font-size: 24px;
    & > svg {
      color: ${p => p.theme.colors.main};
      margin-right: 5px;
    }
  }
`;

const ForeignCrewWarning = styled.span`
  color: ${p => p.theme.colors.error};
`;

const Crewmates = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 0 20px 0 30px;
  user-select: none;
  width: 100%;
`;

const CrewmateWrapper = styled.div`
  ${p => p.onMouseDown && `
    & > div {
      cursor: ${p.theme.cursors.active} !important;
    }
  `}

  ${p => (p.onMouseDown || p.onMouseUp)
    ? `
      &:hover {
        & > div > div:first-child {
          border-color: ${p.theme.colors.main} !important;
        }
        & > div > div > svg:nth-child(2) > path {
          stroke: ${p.theme.colors.main} !important;
        }
        ${p.isDragging && `
          ${EmptyCrewmateCardFramed} {
            border-color: ${p.theme.colors.main};
          }
        `}
      }
    `
    : `
      & > div > div {
        opacity: 0.5;
      }
      & > div > div:first-child {
        border-color: #444 !important;
      }
      & > div > div > svg:nth-child(2) > path {
        stroke: #444 !important;
      }
      & img { pointer-events: none; }
    `
  }

  &:not(:first-child):after {
    content: "${p => p.place}";
    color: ${p => p.theme.colors.main};
    display: block;
    font-size: 14px;
    font-weight: bold;
    margin-top: 8px;
    text-align: center;
  }
`;

const Dragging = styled.div.attrs(p => ({
  style: {
    left: `${p.position.x - p.offset.x}px`,
    top: `${p.position.y - p.offset.y}px`
  }
}))`
  box-shadow: 0 0 10px 0 rgba(${p => p.theme.colors.mainRGB}, 0.5);
  position: fixed;
  opacity: 0.75;
  pointer-events: none !important;
  z-index: 10000;
`;

const CrewDraggable = ({
  crew,
  isDragging,
  isForeignCrew,
  onCancel,
  onMouseDown,
  onMouseUp,
  orderedCrewmates,
  orderedCrewmatesOffset = 0,
  stage
}) => {
  const { crewmateMap } = useCrewContext();
  return (
    <>
      <Titlebar>
        <div>
          {onCancel ? <IconButton onClick={onCancel} style={{ height: '1.5em', width: '1.5em' }}><CloseIcon /></IconButton> : <CrewIcon />}
          {formatters.crewName(crew)}
        </div>
        <div>
          {isForeignCrew
            ? <ForeignCrewWarning>Crew is not under my control</ForeignCrewWarning>
            : <LiveFoodStatus crew={crew} />
          }
        </div>
      </Titlebar>
      <Crewmates>
        {Array.from(Array(5)).map((_, i) => {
          const index = i + orderedCrewmatesOffset;
          const interactivityProps = { isDragging };
          const crewmate = orderedCrewmates[index];

          if (stage === actionStages.NOT_STARTED) {
            // i can (re)move any crewmate i own (not an empty slot, not an unowned crewmate)
            if (crewmate && crewmateMap?.[crewmate.id]) {
              interactivityProps.onMouseDown = onMouseDown(index);
            }

            // i can replace any crewmate or empty slot on MY crew
            if (!isForeignCrew) {
              interactivityProps.onMouseUp = onMouseUp(index);
            }
          }

          return (
            <CrewmateWrapper key={i} place={i + 1} {...interactivityProps}>
              {crewmate && (
                <CrewmateCardFramed
                  borderColor={`rgba(${theme.colors.mainRGB}, 0.4)`}
                  CrewmateCardProps={{ hideHeader: false, hideNameInHeader: true }}
                  crewmate={crewmate}
                  isCaptain={reactBool(i === 0)}
                  noArrow={reactBool(i > 0)}
                  width={i === 0 ? 130 : 118} />
              )}
              {!crewmate && (
                <EmptyCrewmateCardFramed
                  borderColor={`rgba(${theme.colors.mainRGB}, 0.2)`}
                  width={i === 0 ? 130 : 118} />
              )}
            </CrewmateWrapper>
          );
        })}
      </Crewmates>
    </>
  );
};

const ManageCrew = ({ altCrews, crew, isForeignCrew, manager, stage, ...props }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { reorderRoster, swapCrewmates } = manager;

  const hydratedLocation = useHydratedLocation(crew?._location);

  const [crewSelectorOpen, setCrewSelectorOpen] = useState();
  const [exchangeCrewId, setExchangeCrewId] = useState(props.exchangeCrewId);
  const [pristine, setPristine] = useState();
  const [orderedCrewmates, setOrderedCrewmates] = useState([]);

  const [dragging, setDragging] = useState();
  const [dragOffset, setDragOffset] = useState();
  const [dragPosition, setDragPosition] = useThrottle(null, 30, true);

  const exchangeCrew = useMemo(() => {
    if (exchangeCrewId === 0) {
      return {
        id: 0,
        label: Entity.IDS.CREW,
        Crew: {
          roster: [],
        },
        Name: {
          name: '(New Crew)'
        },
        _crewmates: [],
        _location: cloneDeep(crew._location),
      };
    }
    return altCrews.find((c) => c.id === exchangeCrewId);
  }, [altCrews, exchangeCrewId])

  useEffect(() => {
    if (!crew?._crewmates) return;
    const slots = [];
    for (let i = 0; i < (exchangeCrew ? 10 : 5); i++) {
      slots.push((i < 5 ? crew._crewmates[i] : exchangeCrew?._crewmates?.[i - 5]) || null);
    }
    setOrderedCrewmates(slots);
    setPristine(slots.map((c) => c?.id));
  }, [crew?._crewmates, exchangeCrew?._crewmates]);

  const onSaveChanges = useCallback(() => {
    if (!(crew?.id > 0 && orderedCrewmates.length > 0)) return;
    if (exchangeCrew) {
      swapCrewmates({
        crewId1: crew.id,
        newRoster1: orderedCrewmates.slice(0, 5).map((c) => c?.id).filter((c) => !!c),
        crewId2: exchangeCrew.id,
        newRoster2: orderedCrewmates.slice(5).map((c) => c?.id).filter((c) => !!c),
      })
    } else {
      reorderRoster({
        crewId: crew.id,
        newRoster: orderedCrewmates.slice(0, 5).map((c) => c?.id).filter((c) => !!c),
      });
    }
  }, [crew?.id, exchangeCrew, orderedCrewmates, reorderRoster, swapCrewmates]);

  const onMouseDown = useCallback((index) => (e) => {
    e.preventDefault();

    setDragOffset({ x: e.nativeEvent?.offsetX, y: e.nativeEvent?.offsetY });
    setDragPosition({ x: e.clientX, y: e.clientY });
    setDragging(index);
  }, []);

  const onMouseUp = useCallback((index) => (e) => {
    if (dragging >= 0 && index >= 0 && dragging !== index) {
      // if dropping on a foreign crew (not allowed)
      if (isForeignCrew && index < 5) {
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: {
            content: errorMessages.crewControl
          },
          duration: 10000
        });

      // if taking from foreign crew but no available slots
      } else if (isForeignCrew && index >= 5 && !orderedCrewmates.findIndex((c, i) => i >= 5 && !c)) {
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: {
            content: errorMessages.crewFull
          },
          duration: 10000
        });

      // good from here... update state
      } else {
        setOrderedCrewmates((prevOrder) => {
          const dragged = prevOrder[dragging];
          const replaced = prevOrder[index];

          const newOrder = [ ...prevOrder ];
          newOrder[dragging] = null;
          newOrder[index] = dragged;

          // replaced should go into first null on the same crew they were on
          // (or if there is no space, first null)
          let replaceNullIndex = -1;
          if (index >= 5) {
            replaceNullIndex = newOrder.findIndex((c, i) => i >= 5 && !c);
          }
          if (replaceNullIndex === -1) {
            replaceNullIndex = newOrder.findIndex((c) => !c);
          }
          if (replaceNullIndex >= 0) {
            newOrder[replaceNullIndex] = replaced;
          } // else should be impossible

          // ensure empty slots are at the end of each crew
          const target = newOrder.slice(0, 5).filter((c) => !!c);
          const exchange = newOrder.slice(5).filter((c) => !!c);
          return Array.from(Array(exchangeCrew ? 10 : 5)).map((_, i) => {
            return (i < 5 ? target[i] : exchange[i - 5]) || null;
          });
        });
      }
    }
    setDragging();
  }, [dragging, isForeignCrew]);

  useEffect(() => {
    const mouseMoveHandler = (e) => setDragPosition({ x: e.clientX, y: e.clientY });
    const mouseUpHandler = (e) => onMouseUp(-1);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.querySelector('html').addEventListener('mouseup', mouseUpHandler);
    return () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.querySelector('html').removeEventListener('mouseup', mouseUpHandler);
    }
  }, [onMouseUp]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    // (close on status change from)
    if (lastStatus.current === actionStages.COMPLETING && stage !== actionStages.COMPLETING) {
      props.onClose();
    }
    lastStatus.current = stage;
  }, [stage]);

  const isPristine = useMemo(() => {
    if (!pristine || !orderedCrewmates) return true;
    return pristine.join(',') === orderedCrewmates.map((c) => c?.id).join(',');
  }, [pristine, orderedCrewmates]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: exchangeCrewId === 0 ? <NewCrewIcon /> : <ManageCrewIcon />,
          label: exchangeCrewId === 0 ? 'Form New Crew' : 'Manage Crew',
          status: stage === actionStages.NOT_STARTED ? 'Arrange Crewmates' : undefined,
        }}
        actionCrew={crew}
        location={hydratedLocation}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody style={{ minHeight: '55vh' }}>
        <FlexSection style={{ marginBottom: 16 }}>
          <FlexSectionBlock
            title="Active Crew"
            titleDetails={<Instructions isExchanging={!!exchangeCrew}>Drag crewmates to re-arrange</Instructions>}
            bodyStyle={{ height: 'auto', paddingRight: 0 }}
            style={{ width: '100%' }}>
            <CrewDraggable
              crew={crew}
              isDragging={reactBool(dragging >= 0)}
              isForeignCrew={reactBool(isForeignCrew)}
              onMouseDown={onMouseDown}
              onMouseUp={onMouseUp}
              orderedCrewmates={orderedCrewmates}
              stage={stage}
            />
          </FlexSectionBlock>
        </FlexSection>

        {exchangeCrew && (
          <FlexSection>
            <FlexSectionBlock
              title="Exchanging Crew"
              titleDetails={<CrewLocationLabel hydratedLocation={hydratedLocation} style={{ fontSize: '15px' }} />}
              bodyStyle={{ height: 'auto', paddingRight: 0 }}
              style={{ width: '100%' }}>
              <CrewDraggable
                crew={exchangeCrew}
                isDragging={reactBool(dragging >= 0)}
                onCancel={() => setExchangeCrewId()}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                orderedCrewmates={orderedCrewmates}
                orderedCrewmatesOffset={5}
                stage={stage}
              />
            </FlexSectionBlock>
          </FlexSection>
        )}

        {!exchangeCrew && (
          <FlexSection>
            {hydratedLocation.ship
              ? <ShipInputBlock title="At Location" ship={hydratedLocation.ship} />
              : <BuildingInputBlock title="At Location" building={hydratedLocation.building} />}

            <FlexSectionSpacer />

            {altCrews.length === 0 && (
              <FlexSectionBlock>
                <div style={{ marginTop: -8 }}>No other crews at this location.</div>
                <Button
                  disabled={nativeBool(stage !== actionStages.NOT_STARTED)}
                  onClick={() => setExchangeCrewId(0)}
                  style={{ marginTop: 12 }}>
                  <PlusIcon /> Form New Crew
                </Button>
              </FlexSectionBlock>
            )}
            {crew._ready === true && altCrews.length > 0 && (
              <FlexSectionInputBlock
                image={<EmptyResourceImage iconOverride={<CrewIcon />} />}
                isSelected={reactBool(stage === actionStages.NOT_STARTED)}
                label="Crew Exchange"
                onClick={stage === actionStages.NOT_STARTED ? () => setCrewSelectorOpen(true) : undefined}
                sublabel={`${altCrews.length} Available Crew${altCrews.length === 1 ? '' : 's'}`}
              />
            )}
          </FlexSection>
        )}

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={nativeBool(isPristine)}
        goLabel="Save Changes"
        onGo={onSaveChanges}
        stage={stage}
        {...props} />

      {dragging >= 0 && createPortal(
        <Dragging offset={dragOffset} position={dragPosition}>
          <CrewmateCardFramed
            borderColor={`rgba(${theme.colors.mainRGB}, 0.4)`}
            crewmate={orderedCrewmates[dragging || 0]}
            noArrow
            style={{ pointerEvents: 'none' }}
            width={120} />
        </Dragging>,
        document.body
      )}

      {stage === actionStages.NOT_STARTED && (
        <CrewSelectionDialog
          crews={altCrews}
          onClose={() => setCrewSelectorOpen(false)}
          onSelected={setExchangeCrewId}
          open={crewSelectorOpen}
          title="Exchange With Crew"
        />
      )}
    </>
  );
};

const Wrapper = ({ crew, loading, ...props }) => {
  const { crews, crewmateMap } = useCrewContext();
  const crewSwapManager = useCrewSwapManager();
  const { actionStage } = crewSwapManager;

  const locationCrews = useMemo(() => {
    if (!crew?._location) return [];
    return crews.filter((c) => (
      crew.Location.location.label === c.Location.location.label
      && crew.Location.location.id === c.Location.location.id
      && crew.id !== c.id
      && c._ready === true // only show crews that are ready
    ));
  }, [crew?._location]);

  useEffect(() => {
    // if could not load crew...
    let shouldClose = !crew && !loading;
    // or it is a foreign crew without any of my crewmates...
    shouldClose ||= props.isForeignCrew && crew && !(crew.Crew?.roster || []).find((id) => !!crewmateMap?.[id])
    // ...should close
    if (shouldClose && props.onClose) props.onClose();
  }, [!crew, !loading]);

  return (
    <ActionDialogInner
      actionImage="CrewManagement"
      isLoading={reactBool(loading)}
      stage={actionStage}>
      <ManageCrew
        crew={crew}
        altCrews={locationCrews}
        manager={crewSwapManager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

const TargetMyCrewWrapper = (props) => {
  const { crew, loading: myCrewLoading } = useCrewContext();
  return (
    <Wrapper
      crew={crew}
      loading={myCrewLoading}
      {...props}
    />
  );
};

// this would only be used if you are transferring your crewmate off of someone else's crew
// TODO: block other dialog functions
const TargetForeignCrewWrapper = (props) => {
  const { data: crew, isLoading } = useHydratedCrew(props.crewId);
  return (
    <Wrapper
      crew={crew}
      isForeignCrew
      loading={isLoading}
      {...props}
    />
  );
};

const OuterWrapper = (props) => props?.crewId ? <TargetForeignCrewWrapper {...props} /> : <TargetMyCrewWrapper {...props} />;

export default OuterWrapper;
