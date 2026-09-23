import styled from 'styled-components';
import { ReadyIcon } from '~/components/AnimatedIcons';
import { TargetIcon } from '~/components/Icons';
import { itemColors, backgroundColors } from '~/lib/actionItem';
import { ActionItemRow, ActionItemIcon } from './ActionItem';

const Row = styled(ActionItemRow)`
  align-items: flex-start;
  height: auto;
  min-height: 34px;
  ${ActionItemIcon} {
    align-self: stretch;
    height: auto;
    flex-shrink: 0;
  }
`;
const Content = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 8px;
  & h3 {
    flex: 1;
    min-width: 0;
    color: white;
    font-size: inherit;
    font-weight: normal;
    line-height: 1.4;
    margin: 0;
    min-height: 34px;
    display: flex;
    align-items: center;
    overflow-wrap: anywhere;
  }
`;
const Action = styled.button`
  background: none;
  border: 0;
  color: inherit;
  cursor: ${p => p.theme.cursors.active};
  font: inherit;
  font-size: 12px;
  padding: 0;
  min-height: 21px;
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0;
  ${Row}:hover &, ${Row}:focus-within & { opacity: 1; }
  &:hover { color: white; text-decoration: underline; }
`;

const MissionObjective = ({ row, onDetails }) => {
  const type = row.type === 'ready' ? 'ready' : 'unready';
  return <Row as="article" oneRow color={itemColors[type]} bgColor={backgroundColors[type]} onClick={onDetails}>
    <ActionItemIcon aria-hidden="true">
      {type === 'ready' ? <ReadyIcon /> : <span><TargetIcon /></span>}
    </ActionItemIcon>
    <Content>
      <h3>{row.invitation ? 'Begin your starter campaign' : `Mission: ${row.mission.title}`}</h3>
      <Action onClick={event => { event.stopPropagation(); onDetails(); }}>
        Show details
      </Action>
    </Content>
  </Row>;
};

export default MissionObjective;
