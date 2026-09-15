import { useCallback } from 'react';
import { useHistory } from 'react-router-dom';

import { AgreementsListIcon } from '~/components/Icons';
import ActionButton from './ActionButton';

const isVisible = () => false;

const ViewAgreements = ({ entity, permission, tally, _disabled }) => {
  const history = useHistory();
  const handleClick = useCallback(() => {
    history.push(`/listview/agreements?uuid=${entity.uuid}&permission=${permission}`)
  }, [entity, permission]);

  return (
    <ActionButton
      label="View Agreements"
      flags={{
        badge: tally,
        disabled: _disabled
      }}
      icon={<AgreementsListIcon /> }
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: ViewAgreements, isVisible };

export default actionDefinition;