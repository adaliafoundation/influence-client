import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

import { BellIcon, EyeIcon, FinishAllIcon, LoggedEventsIcon } from '~/components/Icons';
import CollapsibleSection from '~/components/CollapsibleSection';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useActionItems from '~/hooks/useActionItems';
import useCrewContext from '~/hooks/useCrewContext';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { hexToRGB } from '~/theme';
import ActionItem, { ITEM_WIDTH, TRANSITION_TIME } from './ActionItem';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useStarterMissionManager from '~/hooks/actionManagers/useStarterMissionManager';
import { useMissionScope } from '~/hooks/useMissionGuidance';
import { getMissionObjectiveRows } from '~/lib/missionObjectives';
import MissionObjective from './MissionObjective';


export const SECTION_WIDTH = ITEM_WIDTH + 30;

const TitleWrapper = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
`;

const ActionItemWrapper = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
  transition: width 0.15s ease;
  user-select: none;
  width: ${ITEM_WIDTH}px;

  &:first-child {
    margin-top: 14px;
  }
`;

const filterRowPadding = 9;
const selectionIndicatorHeight = 3;
const selectionIndicatorWidth = 30;
const Filters = styled.div`
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, .25);
  display: flex;
  flex-direction: row;
  overflow: hidden;
  padding: ${filterRowPadding}px 0px;
  width: 100%;

  & > a {
    display: block;
    filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.3));
    font-size: 24px;
    height: 26px;
    line-height: 24px;
    margin-top: -2px;
    padding: 0 6px;
  }
`;

const Filter = styled.div`
  cursor: ${p => p.theme.cursors.active};
  font-size: 90%;
  font-weight: bold;
  height: 26px;
  margin-right: 8px;
  padding: 4px 15px;
  position: relative;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.3);
  text-transform: uppercase;

  & > svg {
    filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.3));
    font-size: 22px;
  }

  & > b {
    color: white;
    margin-right: 2px;
  }

  &:after {
    content: "";
    background: currentColor;
    bottom: -${filterRowPadding + selectionIndicatorHeight}px;
    height: ${selectionIndicatorHeight}px;
    margin-left: 0;
    left: 50%;
    position: absolute;
    width: 0;
    transition: bottom 150ms ease, margin-left 150ms ease 50ms, width 150ms ease 50ms;
  }

  ${p => p.selected ? `` : `&:hover {`}
    &:after {
      bottom: -${filterRowPadding}px;
      margin-left: -${selectionIndicatorWidth / 2}px;
      width: ${selectionIndicatorWidth}px;
    }
  ${p => p.selected ? `` : `}`}
`;

const IconFilter = styled(Filter)`
  align-items: center;
  display: flex;
  flex-direction: row;
  opacity: ${p => p.selected ? 1 : 0.8};
  transition: opacity 150ms ease;
  ${p => p.selected ? `` : `&:hover { opacity: 0.9; }`}
  & > b {
    margin: 0 0 0 6px;
  }

  &:after {
    background: ${p => p.theme.colors.main};
  }
`;

const AllFilter = styled(IconFilter)`
  padding-left: 5px;
  padding-right: 2px;
  color: white;
  ${p => !p.selected && `
    opacity: 0.5;
    &:hover { opacity: 1; }
  `}
`;

const HiddenFilter = styled(IconFilter)`
  color: #CCC;
  padding-left: 0;
  padding-right: 0;
`;

const PillFilter = styled(Filter)`
  border-radius: 20px;
  border: 1.5px solid ${p => p.selected ? 'currentColor' : 'transparent'};
  transition: border-color 150ms ease;
`;

const ReadyFilter = styled(PillFilter)`
  background: rgba(${p => hexToRGB(p.theme.colors.success)},  ${p => p.selected ? 0.5 : 0.25});
  color: ${p => p.theme.colors.success};
  &:hover {
    background: rgba(${p => hexToRGB(p.theme.colors.success)}, ${p => p.selected ? 0.75 : 0.5});
  }
`;

const InProgressFilter = styled(PillFilter)`
  background: rgba(${p => p.theme.colors.mainRGB},  ${p => p.selected ? 0.5 : 0.25});
  color: ${p => p.theme.colors.brightMain};
  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, ${p => p.selected ? 0.75 : 0.5});
  }
`;

const OuterWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 0;
  pointer-events: none;
  position: relative;
  width: ${SECTION_WIDTH}px;
`;

export const ActionItemContainer = styled.div`
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  pointer-events: auto;
  width: ${ITEM_WIDTH}px;
`;

const ActionItemCategory = styled.div`
  &:not(:first-child) {
    margin-top: 10px;
  }
  &:not(:last-child) {
    &:after {
      border-bottom: 1px solid rgba(255, 255, 255, .25);
      content: "";
      display: block;
      padding-bottom: 10px;
      width: 100%;
    }
  }
`;

const AllAction = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 14px;
  flex: 0 0 34px;
  margin-top: 4px;
  pointer-events: all;
`;

const FinishAll = styled(AllAction)`
  color: ${p => p.theme.colors.success};
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.3));
  & > svg {
    margin-left: 4px;
    margin-right: 9px;
    font-size: 150%;
  }
  &:hover {
    color: white;
    text-decoration: underline;
  }
`;

const UnhideAll = styled(AllAction)`
  & > svg {
    font-size: 22px;
    margin-right: 4px;
  }
`;

const ActionItems = () => {
  const { authenticated } = useSession();
  const { allVisibleItems: allItems } = useActionItems();
  const { crew } = useCrewContext();
  const { execute, getStatus } = useContext(ChainTransactionContext);
  const getActivityConfig = useGetActivityConfig();
  const simulationEnabled = useSimulationEnabled();
  const dispatchUnhideAllActionItems = useStore(s => s.dispatchUnhideAllActionItems);
  const manager = useStarterMissionManager();
  const view = manager.data;
  const scope = useMissionScope(view?.campaign);
  const preferences = useStore(s => s.objectivePreferences[scope]);
  const setPreferences = useStore(s => s.dispatchObjectivePreferences);
  const setDetails = useStore(s => s.dispatchMissionDetails);
  const openLauncher = useStore(s => s.dispatchLauncherPage);
  const missionRows = useMemo(() => simulationEnabled ? [] : getMissionObjectiveRows(view, manager.getPending),
    [simulationEnabled, view, manager.getPending]);
  const [displayItems, setDisplayItems] = useState();

  useEffect(() => {
    if (displayItems) {
      // TODO: maybe this should show new ones while transitioning out old ones?
      // set to transition state
      setDisplayItems((items) => {
        items.forEach((item) => {
          if (!allItems.find((i) => i.uniqueKey === item.uniqueKey)) {
            item.transitionOut = true;
          }
        });
        return items;
      });

      // after TRANSITION_TIME, update to post-transition
      setTimeout(() => {
        setDisplayItems(allItems);
      }, TRANSITION_TIME);
    } else {
      setDisplayItems(allItems);
    }
  }, [allItems]);

  const selectedFilter = preferences?.filter || 'ready';
  const setSelectedFilter = useCallback(filter => setPreferences(scope, { filter }), [scope, setPreferences]);
  const [lastClick, setLastClick] = useState();

  const onClickFilter = useCallback((filter) => (e) => {
    e.stopPropagation();
    setSelectedFilter(filter);
    setLastClick(Date.now());
  }, [setSelectedFilter]);

  const onUnhideAll = useCallback(() => {
    dispatchUnhideAllActionItems();
    setSelectedFilter('all');
    setLastClick(Date.now());
  }, [dispatchUnhideAllActionItems, setSelectedFilter]);

  const isFinishingAll = useMemo(
    () => getStatus('FinishAllReady') === 'pending',
    [getStatus]
  );

  const autoFinishCalls = useMemo(() => {
    return allItems
      .map((a) => {
        if (a.type === 'ready') {
          const c = getActivityConfig(a);
          if (c.getActionItemFinishCall) {
            return c.getActionItemFinishCall({ id: crew?.id, label: crew?.label });
          }
        }
        return null;
      })
      .filter((a) => !!a);
  }, [allItems, crew, getActivityConfig]);

  const onFinishAll = useCallback(() => {
    if (isFinishingAll) return;
    execute('FinishAllReady', { finishCalls: autoFinishCalls });
  }, [autoFinishCalls, execute, isFinishingAll]);

  const tallies = useMemo(() => {
    return (displayItems || []).reduce(
      (acc, cur) => {
        if (!cur.hidden) {
          acc.all++;
          if (['failed', 'randomEvent', 'ready'].includes(cur.type)) acc.ready++;
          if (['pending', 'unready', 'unstarted'].includes(cur.type)) acc.progress++;
        } else {
          acc.hidden++;
        }
        return acc;
      },
      {
        all: missionRows.length,
        ready: missionRows.filter(row => row.type === 'ready').length,
        progress: missionRows.filter(row => row.type === 'progress').length,
        hidden: 0
      }
    )
  }, [displayItems, missionRows]);

  const filteredDisplayItems = useMemo(() => {
    let filter;
    if (selectedFilter === 'all') filter = (i) => !i.hidden;
    if (selectedFilter === 'ready') filter = (i) => !i.hidden && ['failed', 'randomEvent', 'ready'].includes(i.type);
    if (selectedFilter === 'progress') filter = (i) => !i.hidden && ['pending', 'unready', 'unstarted'].includes(i.type);
    if (selectedFilter === 'hidden') filter = (i) => i.hidden;

    return (displayItems || []).filter(filter);
  }, [displayItems, selectedFilter]);

  const filteredDisplayCategories = useMemo(() => {
    const categorized = {};
    filteredDisplayItems.forEach((i) => {
      if (!categorized[i.category]) {
        categorized[i.category] = {
          category: i.category,
          items: []
        }
      }
      categorized[i.category].items.push(i);
    })
    return Object.values(categorized);
  }, [filteredDisplayItems]);

  return (
    <>
      <OuterWrapper>
        {authenticated && <div style={{ color: 'white', paddingLeft: 32, fontSize: 13 }}>Objectives</div>}
        {authenticated && (
          <CollapsibleSection
            key={scope}
            borderless
            initiallyClosed={preferences?.collapsed ?? false}
            onCollapsedChange={collapsed => setPreferences(scope, { collapsed })}
            collapsibleProps={{
              style: {
                display: 'flex',
                flexDirection: 'column',
                marginBottom: 40,
                width: SECTION_WIDTH - 32
              }
            }}
            openOnChange={lastClick}
            title={(
              <TitleWrapper>
                <Filters>
                  <ReadyFilter onClick={onClickFilter('ready')} selected={selectedFilter === 'ready'}><b>{(tallies.ready || 0).toLocaleString()}</b> Ready</ReadyFilter>
                  <InProgressFilter onClick={onClickFilter('progress')} selected={selectedFilter === 'progress'}><b>{(tallies.progress || 0).toLocaleString()}</b> In Progress</InProgressFilter>
                  <AllFilter title="All objectives" onClick={onClickFilter('all')} selected={selectedFilter === 'all'}><BellIcon /> <b>{(tallies.all || 0).toLocaleString()}</b></AllFilter>
                  {tallies.hidden > 0 && <HiddenFilter onClick={onClickFilter('hidden')} selected={selectedFilter === 'hidden'}><EyeIcon /> <b>{(tallies.hidden || 0).toLocaleString()}</b></HiddenFilter>}
                  <div style={{ flex: 1 }} />
                  <Link to="/listview/eventlog" onClick={(e) => e.stopPropagation()} style={{ paddingRight: 0 }}><LoggedEventsIcon /></Link>
                </Filters>
              </TitleWrapper>
            )}>
            {['all', 'ready'].includes(selectedFilter) && autoFinishCalls?.length > 1 && !isFinishingAll && (
              <FinishAll onClick={onFinishAll}><FinishAllIcon /> Finish All Ready Items</FinishAll>
            )}
            {selectedFilter === 'hidden' && (
              <UnhideAll onClick={onUnhideAll}><EyeIcon /> Unhide All</UnhideAll>
            )}
            <ActionItemWrapper>
              <ActionItemContainer>
                {missionRows.filter(row => selectedFilter === 'all' || row.type === selectedFilter).map(row => {
                  return <MissionObjective key={row.mission.id} row={row}
                    onDetails={() => row.invitation
                      ? openLauncher('missions', 'starter')
                      : setDetails({ scope, id: row.mission.id })} />;
                })}
                {filteredDisplayCategories.map(({ category, items }) => (
                  <ActionItemCategory key={category}>
                    {items.map((item) => (
                      <ActionItem
                        key={item.uniqueKey}
                        data={item}
                        getActivityConfig={getActivityConfig}
                      />
                    ))}
                  </ActionItemCategory>
                ))}
              </ActionItemContainer>
            </ActionItemWrapper>
          </CollapsibleSection>
        )}
            
      </OuterWrapper>
    </>
  );
};

export default ActionItems;
