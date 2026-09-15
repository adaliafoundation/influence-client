import { useCallback, useMemo } from 'react';

import { TakeControlIcon } from '~/components/Icons';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useRepoManager from '~/hooks/actionManagers/useRepoManager';
import theme from '~/theme';

const isVisible = ({ crew, isAtRisk, lot }) => {
  if (!crew || !lot) return false;

  if (lot?.building) {
    // if i am the lot controller but not the building controller...
    if (crew?.id === lot?.Control?.controller?.id && crew?.id !== lot?.building?.Control?.controller?.id) {
      return true;
    }

    // if i am NOT the controller and the building is expired...
    if (crew?.id !== lot?.building?.Control?.controller?.id && isAtRisk) {
      return true;
    }
  }

  return false;
};

const RepoBuilding = ({ asteroid, crew, lot, onSetAction, _disabled }) => {
  const { currentRepo } = useRepoManager(lot?.id);

  const handleClick = useCallback(() => {
    onSetAction('REPO_BUILDING');
  }, [onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled || !!currentRepo) return 'loading...';
    if (!currentRepo) return getCrewDisabledReason({ asteroid, crew });
    return '';
  }, [_disabled, asteroid, crew]);

  const buttonParams = useMemo(() => {
    // if i am the lot controller but not the building controller...
    if (crew?.id === lot?.Control?.controller?.id && crew?.id !== lot?.building?.Control?.controller?.id) {
      return {
        label: 'Repossess Building',
        icon: <TakeControlIcon />
      }
    }

    // if i am NOT the controller and the building is expired...
    return {
      label: 'Claim Expired Construction Site',
      icon: <TakeControlIcon />
    }
  }, [crew, lot]);

  return (
    <ActionButton
      {...buttonParams}
      overrideColor={theme.colors.error}
      overrideBgColor={theme.colors.backgroundRed}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason,
        loading: !!currentRepo
      }}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: RepoBuilding, isVisible };

export default actionDefinition;
