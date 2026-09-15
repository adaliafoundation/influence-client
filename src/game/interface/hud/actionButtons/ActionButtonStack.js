import { useCallback, useMemo, useState } from 'react';
import styled, { css } from 'styled-components';

import MouseoverInfoPane from '~/components/MouseoverInfoPane';
import useBlockTime from '~/hooks/useBlockTime';
import ActionButton from './ActionButton';
import useEntity from '~/hooks/useEntity';
import LiveTimer from '~/components/LiveTimer';

const MouseoverPanel = styled.div`
  background: rgba(16,16,16,0.95);
  border: 1px solid #333;
  padding: 10px;
  width: 100%;
`;
const MouseoverTitle = styled.div`
  border-bottom: 1px solid #333;
  color: #656565;
  font-size: 14px;
  margin-bottom: 4px;
  padding-bottom: 8px;
  text-transform: uppercase;
`;
const MouseoverBody = styled.div``;
const Item = styled.div`
  color: #AAA;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  font-size: 15px;
  margin: 0 -6px;
  padding: 4px 6px;
  transition: background 150ms ease, color 150ms ease;
  & > label {
    flex: 1;
    white-space: nowrap;
  }
  & > span {
    white-space: nowrap;
  }
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }
`;
const Ready = styled.span`
  color: ${p => p.theme.colors.success};
  text-transform: uppercase;
`;
const Pending = styled.span`
  color: ${p => p.theme.colors.main};
  text-transform: uppercase;
`;

const mouseoverPaneProps = (visible) => ({
  css: css`
    background: transparent;
    border: 0;
    margin-bottom: 0;
    padding-bottom: 6px;
    pointer-events: ${visible ? 'auto' : 'none'};
    width: 320px;
  `,
  placement: 'top',
  visible
});

const StackItem = ({ label, finishTime, preloadEntity, onClick }) => {
  const blockTime = useBlockTime();
  const { data: entity } = useEntity(preloadEntity);

  const handleClick = useCallback(() => {
    onClick(entity);
  }, [entity, onClick]);

  return (
    <Item onClick={handleClick}>
      <label>{label}</label>
      {finishTime && finishTime < blockTime && <Ready>Ready</Ready>}
      {finishTime && !(finishTime < blockTime) && <span><LiveTimer target={finishTime} maxPrecision={2} waitingForBlockText='...' /></span>}
      {!finishTime && <Pending>Pending</Pending>}
    </Item>
  )
};

const StackItemButton = ({ label, finishTime, preloadEntity, onClick, ...props }) => {
  const blockTime = useBlockTime();
  const { data: entity } = useEntity(preloadEntity);

  const handleClick = useCallback(() => {
    onClick(entity);
  }, [entity, onClick]);

  const attention = useMemo(() => finishTime && (finishTime <= blockTime), [blockTime, finishTime])

  return (
    <ActionButton
      {...props}
      ref={props.setRef}
      label={label}
      onClick={handleClick}
      flags={{
        attention,
        loading: !attention,
        finishTime
      }} />
  );
};

// TODO: if only one in stack, no mouseover... just replace button with one
const ActionButtonStack = ({ stack, stackLabel, ...props }) => {
  const blockTime = useBlockTime();

  const [refEl, setRefEl] = useState();
  const [stackHovered, setStackHovered] = useState();

  const stackAttention = useMemo(() => {
    return stack.find((a) => a.finishTime && (a.finishTime <= blockTime));
  }, [blockTime, stack]);

  const handleClick = useCallback((onClick) => (...args) => {
    setStackHovered();
    if (onClick) onClick(...args);
  }, []);

  if (stack?.length === 0) return null;
  if (stack?.length === 1) {
    return (
      <StackItemButton
        {...stack[0]}
        {...props} />
    );
  }
  return (
    <span
      ref={setRefEl}
      onMouseEnter={() => setStackHovered(true)}
      onMouseLeave={() => setStackHovered()}>
      <ActionButton
        label=""
        ref={props.setRef}
        {...props}
        flags={{
          attention: stackAttention,
          loading: !stackAttention,
          tally: stack.length
        }}
        style={{ marginRight: 8 }} />

      <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(stackHovered)}>
        <MouseoverPanel>
          <MouseoverTitle>{stackLabel}</MouseoverTitle>
          <MouseoverBody>
            {stack.map(({ onClick, ...s }, i) => (
              <StackItem key={i} onClick={handleClick(onClick)} {...s} />
            ))}
          </MouseoverBody>
        </MouseoverPanel>
      </MouseoverInfoPane>
    </span>
  );
}

export default ActionButtonStack;