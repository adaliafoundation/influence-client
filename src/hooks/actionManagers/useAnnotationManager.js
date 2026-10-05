import { useCallback, useContext, useMemo, useState } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { maxAnnotationLength } from '~/lib/utils';

export const isValidAnnotation = (val) => {
  if (val.length > maxAnnotationLength) return false;
  if (val.length === 0) return false;
  return true;
};

const useAnnotationManager = (activity, metaEntity) => {
  const { crew } = useCrewContext();
  const { execute, getStatus } = useContext(ChainTransactionContext);

  const crewId = crew?.id;

  const [saving, setSaving] = useState();

  const payload = useMemo(() => ({
    transaction_hash: activity?.event?.transactionHash,
    log_index: activity?.event?.logIndex,
    caller_crew: { id: crewId, label: Entity.IDS.CREW }
  }), [activity]);

  const saveAnnotation = useCallback(
    async (content) => {
      setSaving(true);

      try {
        const annotation = { content, type: 'EventAnnotation', version: 1 };
        const hash = await api.getAnnotationHash(annotation);
        return await execute(
          'AnnotateEvent',
          {
            ...payload,
            content_hash: hash.match(/.{1,31}/g) // chunk into shortstrings (max-length 31)
          },
          {
            annotation,
            entity: metaEntity,
            entities: activity.entities || (metaEntity ? [metaEntity] : [])
          }
        );
      } finally {
        setSaving(false);
      }
    },
    [execute, metaEntity, payload]
  );

  const status = useMemo(
    () => getStatus('AnnotateEvent', { ...payload }),
    [getStatus, payload]
  );

  return {
    saveAnnotation,
    savingAnnotation: saving || (status === 'pending'),
    txPending: (status === 'pending')
  };
};

export default useAnnotationManager;
