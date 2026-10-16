import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import Button from '~/components/ButtonPill';
import DataReadout from '~/components/DataReadout';
import { CopyIcon, WarningIcon } from '~/components/Icons';
import WalletIcon from '~/components/WalletIcon';
import { usePrivyWallet } from '~/contexts/PrivyWalletContext';
import useCopyWalletAddress from '~/hooks/useCopyWalletAddress';
import useSession from '~/hooks/useSession';
import { getWalletLabel, normalizeConnectorId, WALLET_IDS } from '~/lib/wallets';

const Panel = styled.div`
  max-width: 720px;
  padding: 30px 20px;
  & h3 {
    border-bottom: 1px solid ${p => p.theme.colors.contentBorder};
    color: white;
    font-size: 18px;
    margin: 0 0 24px;
    padding-bottom: 8px;
    text-transform: uppercase;
  }
  & p { line-height: 1.5; }
`;

const AccountRow = styled(DataReadout)`
  align-items: flex-start;
  padding: 12px 0;
  & > label {
    flex: 0 0 200px;
    margin-top: 6px;
  }
  & > span {
    display: block;
    min-width: 0;
  }
  & p:first-child { margin-top: 0; }
`;

const WalletType = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
  & svg { width: 32px; height: 32px; }
`;

const AddressButton = styled.button`
  align-items: center;
  background: transparent;
  border: 1px solid ${p => p.theme.colors.contentBorder};
  color: white;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  gap: 12px;
  margin: 0;
  padding: 12px;
  text-align: left;
  width: 100%;
  & span { overflow-wrap: anywhere; min-width: 0; }
  & svg { flex-shrink: 0; }
  &:hover { border-color: ${p => p.theme.colors.main}; }
`;

const Warning = styled.p`
  align-items: flex-start;
  color: ${p => p.theme.colors.warning};
  display: flex;
  gap: 8px;
  & svg { flex-shrink: 0; margin-top: 3px; }
`;

const Account = () => {
  const { accountAddress, walletId } = useSession(false);
  const { exportPrivateKey, modalOpen, ready } = usePrivyWallet();
  const copyAddress = useCopyWalletAddress(accountAddress);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState();

  const wasModalOpen = useRef(modalOpen);
  const exportAttempt = useRef(0);

  useEffect(() => {
    // Closing Privy's modal does not always settle its export promise.
    if (wasModalOpen.current && !modalOpen) {
      exportAttempt.current += 1;
      setExporting(false);
    }
    wasModalOpen.current = modalOpen;
  }, [modalOpen]);

  const onExport = async () => {
    const attempt = ++exportAttempt.current;
    setExporting(true);
    setError(undefined);
    try {
      await exportPrivateKey();
    } catch (e) {
      if (attempt === exportAttempt.current) {
        setError('Private key export was not completed. You can try again.');
      }
    } finally {
      if (attempt === exportAttempt.current) setExporting(false);
    }
  };

  return (
    <Panel>
      <h3>Account</h3>
      {!accountAddress ? <p>Log in to view your wallet account.</p> : (
        <>
          <AccountRow label="Wallet Type">
            <WalletType><WalletIcon walletId={walletId} />{getWalletLabel(walletId)}</WalletType>
          </AccountRow>
          <AccountRow label="Account address">
            <AddressButton type="button" aria-label="Copy account address" onClick={copyAddress}>
              <span>{accountAddress}</span><CopyIcon />
            </AddressButton>
          </AccountRow>
          {normalizeConnectorId(walletId) === WALLET_IDS.PRIVY && (
            <AccountRow label="Export Account">
              <p>Export your private key to access this account in another compatible wallet (ReadyX).
                Keep the account address above for importing your account.</p>
              <Warning><WarningIcon /><span>Never share your private key.
                Anyone can use it to gain complete control over your account.</span></Warning>
              <Button disabled={!ready || exporting} onClick={onExport}>
                {exporting ? 'Exporting…' : 'Export private key'}
              </Button>
              {error && <p role="alert">{error}</p>}
            </AccountRow>
          )}
        </>
      )}
    </Panel>
  );
};

export default Account;
