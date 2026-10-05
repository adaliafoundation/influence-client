import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { RandomEvent } from '@influenceth/sdk';

import CrewAssignment from '~/game/interface/details/crewAssignments/Assignment';
import useCrewContext from '~/hooks/useCrewContext';
import { FlexSectionInputBlock } from './hud/actionDialogs/components';
import styled from 'styled-components';
import { SwayIcon } from '~/components/Icons';
import { formatFixed } from '~/lib/utils';
import { bookIds } from '~/hooks/useBookSession';
import useBookTokens from '~/hooks/useBookTokens';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStore from '~/hooks/useStore';

const ResultInner = styled.div`
  align-items: stretch;
  display: flex;
  height: 100%;
  & > div {
    align-items: center;
    display: flex;
    flex: 1;
    padding: 0 10px;
    & b {
      font-weight: normal;
      color: white;
    }
    &:not(:last-child) {
      border-right: 1px solid rgba(255, 255, 255, 0.1);
    }
  }
`;

const SwayHighlight = styled.div`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
  color: white;
  font-size: 30px;
  font-weight: bold;
  padding: 5px;
  text-align: center;
  width: 100%;
`;

const SwayResult = ({ swayAmount }) => {
  return (
    <FlexSectionInputBlock title="Result" style={{ marginTop: 40, width: 'calc(100% - 50px)' }}>
      <ResultInner>
        <div>
          <div>Your crew have earned <b>{' '}SWAY</b>.</div>
        </div>
        <div>
          <SwayHighlight><SwayIcon /> {swayAmount}</SwayHighlight>
        </div>
      </ResultInner>
    </FlexSectionInputBlock>
  );
}

const RandomEventAssignment = () => {
  const { execute } = useContext(ChainTransactionContext);
  const history = useHistory();
  const { crew, pendingTransactions } = useCrewContext();

  const randomEvent = crew?._actionTypeTriggered?.pendingEvent;

  const { bookTokens } = useBookTokens(bookIds[`RANDOM_${randomEvent}`]);
  const [finishing, setFinishing] = useState(false);

  const isPending = useMemo(
    () => (pendingTransactions || []).find((tx) => tx.key === 'ResolveRandomEvent'),
    [pendingTransactions]
  );

  const onAccept = useCallback((choice) => {
    return execute('ResolveRandomEvent', { choice, caller_crew: { id: crew?.id, label: crew?.label } });
  }, [crew, execute]);

  const onFinishAssignment = useCallback(() => {
    setFinishing(true);
  }, [randomEvent]);

  useEffect(() => {
    if (!randomEvent) history.push('/');
  }, [randomEvent]);

  const overrides = useMemo(() => {
    if (finishing || isPending) {
      return {
        content: <SwayResult {...bookTokens} />,
        onBack: () => setFinishing(false),
        onFinish: () => {
          // TODO: when there are more complex events, should obviously do this differently
          return onAccept(RandomEvent.TYPES[crew?._actionTypeTriggered?.pendingEvent]?.choices?.[0] || 1);
        },
        finishButtonLabel: 'Accept',
        finishButtonProps: { isTransaction: true, loading: !!isPending, disabled: !!isPending }
      }
    }
  }, [bookTokens, finishing, isPending, onAccept]);

  return (
    <CrewAssignment
      overrides={overrides}
      onFinish={onFinishAssignment} />
  );
};

export default RandomEventAssignment;
