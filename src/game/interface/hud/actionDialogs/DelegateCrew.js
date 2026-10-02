import { useActionSubmission } from '~/contexts/ActionSubmissionContext';
import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Address } from '@influenceth/sdk';

import Button from '~/components/ButtonAlt';
import { CrewIcon } from '~/components/Icons';
import TextInput from '~/components/TextInput';
import useCrewDelegationManager from '~/hooks/actionManagers/useCrewDelegationManager';
import actionStages from '~/lib/actionStages';
import { nativeBool } from '~/lib/utils';
import { ActionDialogInner } from '../ActionDialog';
import {
  ActionDialogBody,
  ActionDialogHeader,
} from './components';

const Content = styled.div`
  color: ${p => p.theme.colors.mainText};
  display: flex;
  flex-direction: column;
  padding: 24px 36px 8px;
  width: 520px;
`;

const Copy = styled.div`
  color: #aaa;
  font-size: 15px;
  line-height: 1.45;
  margin-bottom: 20px;

  & > p {
    margin: 0 0 12px;
  }
`;

const Field = styled.label`
  color: white;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  text-transform: uppercase;
`;

const AddressInput = styled(TextInput)`
  box-sizing: border-box;
  margin-top: 8px;
  width: 100%;
`;

const Footer = styled.div`
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  margin: 12px 36px 0;
  padding: 15px 0;

  & > button {
    margin-left: 10px;
  }
`;

const normalizeStarknetAddress = (address) => {
  try {
    return Address.toStandard(address, 'starknet');
  } catch (e) {
    return '';
  }
};

const DelegateCrew = ({ crew, crewId, onClose }) => {
  const id = crewId || crew?.id;
  const { delegateCrew, getDelegationStatus } = useCrewDelegationManager(id);
  const [address, setAddress] = useState('');

  const normalizedAddress = useMemo(() => normalizeStarknetAddress(address), [address]);
  const normalizedOwnerAddress = useMemo(() => normalizeStarknetAddress(crew?.Nft?.owner), [crew?.Nft?.owner]);
  const normalizedDelegatedAddress = useMemo(() => normalizeStarknetAddress(crew?.Crew?.delegatedTo), [crew?.Crew?.delegatedTo]);
  const status = getDelegationStatus(normalizedAddress);
  const submission = useActionSubmission();
  const isBusy = submission?.busy || status === 'pending';
  const disabled = !normalizedAddress
    || (!!normalizedOwnerAddress && Address.areEqual(normalizedAddress, normalizedOwnerAddress))
    || (!!normalizedDelegatedAddress && Address.areEqual(normalizedAddress, normalizedDelegatedAddress))
    || isBusy;

  const onSubmit = useCallback(() => {
    if (!disabled) return delegateCrew(normalizedAddress);
  }, [delegateCrew, disabled, normalizedAddress]);

  return (
    <ActionDialogInner
      actionImage="CrewManagement"
      stage={isBusy ? actionStages.STARTING : actionStages.NOT_STARTED}>
      <ActionDialogHeader
        action={{
          icon: <CrewIcon />,
          label: 'Delegate Crew',
          status: isBusy ? 'Submitting' : 'Set Delegate'
        }}
        actionBarTitle="Crew Delegation"
        onClose={onClose}
        stage={isBusy ? actionStages.STARTING : actionStages.NOT_STARTED}
        wide />
      <ActionDialogBody>
        <Content>
          <Copy>
            <p>Delegation lets another Starknet account act as this crew in the game while ownership remains with your wallet.</p>
            <p>Use this when you want to play from another account or grant operational access without transferring the crew NFT.</p>
          </Copy>
          <Field>
            Starknet address
            <AddressInput
              disabled={nativeBool(isBusy)}
              initialValue=""
              onChange={setAddress}
              placeholder="0x..." />
          </Field>
        </Content>
      </ActionDialogBody>
      <Footer>
        <Button onClick={submission?.dismiss || onClose}>Cancel</Button>
        <Button disabled={nativeBool(disabled)} isTransaction onClick={onSubmit}>
          Delegate Crew
        </Button>
      </Footer>
    </ActionDialogInner>
  );
};

export default DelegateCrew;
