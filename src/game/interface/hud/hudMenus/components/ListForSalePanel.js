import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';

import { RadioCheckedIcon, RadioUncheckedIcon, WarningIcon } from '~/components/Icons';
import CollapsibleBlock from '~/components/CollapsibleBlock';
import Button from '~/components/ButtonAlt';
import { CheckboxButton, CheckboxRow } from '~/components/filters/components';
import { nativeBool } from '~/lib/utils';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import useNftSaleManager from '~/hooks/actionManagers/useNftSaleManager';
import theme from '~/theme';

const borderColor = `rgba(255, 255, 255, 0.15)`;

const Section = styled.div`
  border-top: 1px solid ${borderColor};
  padding: 10px 0;
`;

const Warning = styled.div`
  align-items: center;
  display: flex;
  font-size: 85%;
  margin-top: 10px;
  & svg {
    color: ${p => p.theme.colors.red} !important;
    flex: 0 0 30px;
    font-size: 20px;
    margin-right: 4px;
  }
  & span {
    color: ${p => p.theme.colors.darkRed};
    display: inline-block;
  }
`;

// TODO: should we generate forSaleWarning here instead (based on entity type)?
export const ListForSaleInner = ({ forSaleWarning, isSaving, onCancel, onSave, originalPrice }) => {
  const [forSale, setForSale] = useState(originalPrice > 0);
  const [price, setPrice] = useState(originalPrice || 0);

  const isDirty = useMemo(() => (originalPrice !== (forSale ? price : 0)), [forSale, originalPrice, price]);

  const isIncomplete = useMemo(() => (forSale && !(price > 0)), [forSale, price]);

  const onUpdatePrice = useCallback((e) => {
    setPrice((e.currentTarget.value ? parseInt(e.currentTarget.value) : '') || '');
  }, []);

  const cancelForSale = useCallback(() => {
    setForSale(originalPrice > 0);
    setPrice(originalPrice);
    if (onCancel) onCancel();
  }, [originalPrice]);

  const saveForSale = useCallback(() => {
    return onSave(forSale ? price : 0);
  }, [onSave, forSale, price]);

  return (
    <>
      <Section>
        <CheckboxRow disabled={nativeBool(isSaving)} onClick={() => setForSale(false)}>
          <CheckboxButton checked={!forSale}>
            {!forSale ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
          </CheckboxButton>
          <span>Not for Sale</span>
        </CheckboxRow>
        <CheckboxRow disabled={nativeBool(isSaving)} onClick={() => setForSale(true)}>
          <CheckboxButton checked={forSale}>
            {forSale ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
          </CheckboxButton>
          <UncontrolledTextInput
            disabled={nativeBool(isSaving)}
            onChange={onUpdatePrice}
            value={price}
            style={{ marginRight: 6 }} />
          <span style={{ marginRight: 40 }}>SWAY</span>
        </CheckboxRow>
        {forSale > 0 && forSaleWarning && (
          <Warning>
            <WarningIcon />
            <span>{forSaleWarning}</span>
          </Warning>
        )}
      </Section>

      <Section style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {isDirty &&
            <Button
              disabled={nativeBool(isSaving)}
              onClick={() => cancelForSale()}
              size="small">Cancel</Button>
          }
          <Button
            disabled={nativeBool(!isDirty || isIncomplete || isSaving)}
            loading={isSaving}
            isTransaction
            onClick={() => saveForSale()}
            size="small"
            style={{ marginLeft: 6 }}>Update</Button>
        </div>
      </Section>
    </>
  );
}

const ListForSalePanel = ({ entity, forSaleWarning }) => {
  const { updateListing, isPendingUpdate } = useNftSaleManager(entity);

  const originalPrice = useMemo(() => (entity?.Nft?.price || 0) / 1e6, [entity?.Nft?.price]);

  const config = useMemo(() => {
    return {
      color: originalPrice ? theme.colors.brightMain : theme.colors.red
    };
  }, [originalPrice]);

  return (
    <CollapsibleBlock
      title="List for Sale"
      titleAction={() => (<span style={{ color: config.color }}>{originalPrice > 0 ? '' : 'Not '} For Sale</span>)} >
      <ListForSaleInner
        forSaleWarning={forSaleWarning}
        originalPrice={originalPrice}
        isSaving={isPendingUpdate}
        onSave={updateListing} />
    </CollapsibleBlock>
  );
};

export default ListForSalePanel;