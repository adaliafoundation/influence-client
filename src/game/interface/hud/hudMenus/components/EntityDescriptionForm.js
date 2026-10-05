import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import UncontrolledTextArea from '~/components/TextAreaUncontrolled';
import { InputBlock } from '~/components/filters/components';
import { maxAnnotationLength, nativeBool } from '~/lib/utils';
import useAnnotationManager, { isValidAnnotation } from '~/hooks/actionManagers/useAnnotationManager';
import useDescriptionAnnotation from '~/hooks/useDescriptionAnnotation';
import useIpfsContent from '~/hooks/useIpfsContent';
import useEarliestActivity from '~/hooks/useEarliestActivity';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const RemainingChars = styled.div`
  color: ${p => p.remaining < 0
    ? p.theme.colors.error
    : (p.remaining < 50 ? p.theme.colors.orange : '#777')
  };
`;

// TODO: create validity functions for annotaions
const EntityDescriptionForm = ({ buttonSize = 'small', buttonText = 'Update', entity, label, minTextareaHeight = '200px', onCancel, onSave }) => {
  const { data: earliest } = useEarliestActivity(entity);
  const { saveAnnotation, savingAnnotation, txPending } = useAnnotationManager(earliest, entity);
  const { data: annotation, isLoading: annotationLoading } = useDescriptionAnnotation(entity);
  const { data: originalDesc, isLoading: contentLoading } = useIpfsContent(annotation?.ipfs?.hash);
  const simulationEnabled = useSimulationEnabled();
  const isLoading = annotationLoading || contentLoading;

  const [desc, setDesc] = useState();
  useEffect(() => {
    if (!desc) setDesc(originalDesc)
  }, [originalDesc])

  const handleDescChange = useCallback(async (e) => {
    setDesc(e.currentTarget.value || '');
  }, []);

  const saveDescChange = useCallback(async () => {
    if (isValidAnnotation(desc)) {
      return saveAnnotation(desc);
    }
  }, [entity?.id, desc]);

  const handleCancel = useCallback(async () => {
    setDesc(originalDesc);
    if (onCancel) onCancel();
  }, [onCancel, originalDesc]);

  useEffect(() => {
    if (txPending && onSave) {
      onSave();
    }
  }, [txPending]);

  const remaining = useMemo(() => maxAnnotationLength - (desc?.length || 0), [desc?.length]);

  return (
    <InputBlock>
      <label>{label}</label>
      <div>
        <UncontrolledTextArea
          disabled={nativeBool(!entity || savingAnnotation || simulationEnabled)}
          onChange={handleDescChange}
          placeholder="Type a custom description..."
          style={{ minHeight: minTextareaHeight }}
          value={desc === undefined ? originalDesc : desc} />
      </div>
      <div style={{ borderTop: '1px solid #333' }}>
        <RemainingChars remaining={remaining}>{remaining.toLocaleString()} Remaining</RemainingChars>
        <div style={{ flex: 1 }} />
        <Button
          disabled={nativeBool(!entity || savingAnnotation || !desc)}
          size={buttonSize}
          onClick={handleCancel}
          style={{ marginRight: 6 }}>Cancel</Button>
        <Button
          disabled={nativeBool(isLoading || !entity || savingAnnotation || !desc || remaining < 0 || (desc === originalDesc) || simulationEnabled)}
          loading={savingAnnotation}
          size={buttonSize}
          isTransaction
          onClick={saveDescChange}>{buttonText}</Button>
      </div>
    </InputBlock>
  );
};

export default EntityDescriptionForm;