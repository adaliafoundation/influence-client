import { useCallback, useMemo } from 'react';

import { TakeControlIcon } from '~/components/Icons';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useRepoManager from '~/hooks/actionManagers/useRepoManager';
import theme from '~/theme';

const isVisible = ({ crew, lot }) => !!crew && !!lot?.building && crew.id !== lot.building.Control?.controller?.id;

const RepoBuilding = ({ asteroid, crew, lot, onSetAction, _disabled }) => {
  const { currentRepo, authorization, takeoverType } = useRepoManager(lot?.id);

  const handleClick = useCallback(() => {
    onSetAction('REPO_BUILDING');
  }, [onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled || !!currentRepo) return 'loading...';
    if (authorization.status !== 'allowed') return authorization.status === 'unresolved' ? true : 'repossession restricted';
    if (!currentRepo) return getCrewDisabledReason({ asteroid, crew, requireSurface: false });
    return '';
  }, [_disabled, asteroid, crew, currentRepo, authorization]);

  const buttonParams = useMemo(() => {
    // if i am the lot controller but not the building controller...
    if (takeoverType !== 'expired') {
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
  }, [takeoverType]);

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
