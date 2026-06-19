import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import styled from 'styled-components';
import { Address, Encryption } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import AddressLink from '~/components/AddressLink';
import AttentionDot from '~/components/AttentionDot';
import Button from '~/components/ButtonAlt';
import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import DirectMessageDialog from '~/components/DirectMessageDialog';
import { ChevronRightIcon, InboxReceivedIcon, InboxSentIcon, InboxSentReadIcon } from '~/components/Icons';
import PageLoader from '~/components/PageLoader';
import useAccountFormatted from '~/hooks/useAccountFormatted';
import useIpfsContent from '~/hooks/useIpfsContent';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useUser from '~/hooks/useUser';
import useWalletCrews from '~/hooks/useWalletCrews';
import useWalletInbox from '~/hooks/useWalletInbox';
import api from '~/lib/api';
import formatters from '~/lib/formatters';
import { resolveChainId } from '~/lib/utils';
import LauncherDialog from './components/LauncherDialog';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 100%;
  overflow: hidden;
  padding: 30px 20px;
  width: 100%;
`;

const MessageWrapper = styled.div`
  width: 100%;
`;
const Uncollapsible = styled.div`
  align-items: center;
  background: ${p => p.expanded ? '#191919' : 'transparent'};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  height: 36px;
  padding: 0 6px;

  transition: background 150ms ease;

  & > svg {
    font-size: 20px;
  }
  & > label {
    flex: 1;
    margin-left: 8px;
    opacity: 0.5;
    transition: opacity 150ms ease;
  }
  & > svg:last-child {
    font-size: 28px;
    opacity: ${p => p.expanded ? 1 : 0.5};
    transform: rotate(${p => p.expanded ? '90deg' : '0deg'});
    transition: opacity 150ms ease, transform 150ms ease;
  }

  &:hover {
    background: #222;
    & > label {
      opacity: 0.7;
    }
  }
`;
const Collapsible = styled.div`
  ${p => p.expanded
    ? `
      border-bottom: 1px solid #444;
      min-height: 100px;
      padding-bottom: 20px;
    `
    : `
      border-bottom: 1px solid #222;
      min-height: 0;
    `
  }
  transition: min-height 150ms ease;
`;
const Unread = styled.div`
  color: ${p => p.theme.colors.success};
  display: flex;
  justify-content: center;
  width: 20px;
`;

const Title = styled.h3`
  border-bottom: 1px solid ${p => p.theme.colors.contentBorder};
  color: white;
  font-size: 18px;
  height: 30px;
  margin: 0 0 8px;
  padding-bottom: 8px;
  text-transform: uppercase;
`;

const Body = styled.div`
  display: flex;
  flex: 1 0 calc(100% - 30px);
  flex-direction: column;
  overflow: hidden;
`;

const ThreadTitle = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.darkMainRGB}, 0.25);
  color: white;
  display: flex;
  flex-direction: row;
  font-weight: normal;
  margin: 0;
  padding: 15px 20px 10px;
  & > div > div > label {
    display: inline-block;
    opacity: 0.4;
    width: 58px;
  }
`;

const ThreadWrapper = styled(Wrapper)`
  padding: 0;
  ${Body} {
    flex: 1 0 0;
    overflow: hidden auto;
    padding: 10px 20px 30px;
  }
`;

const RecoveryBody = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  text-align: center;
  & > p {
    font-size: 110%;
    margin: 0 0 20px;
    opacity: 0.6;
    width: 525px;
  }
  & > button {
    display: inline-block;
    margin-top: 10px;
    width: 350px;
  }
`;
const Empty = styled(RecoveryBody)``;
const Content = styled.div`
  flex: 1;
  overflow: auto;
  padding: 20px 10px;
  white-space: pre-line;
`;
const DecryptionError = styled.div`
  &:before {
    content: 'Decryption Error';
    color: rgba(${p => p.theme.colors.errorRGB}, 0.5);
  }
`;

const StyledLink = styled(Link)`
  color: ${p => p.theme.colors.main};
  opacity: 0.8;
  text-decoration: none;
  transition: opacity 150ms ease;
  white-space: nowrap;
  &:hover {
    opacity: 1;
    text-decoration: underline;
  }
`;

const Actions = styled.div`
  border-top: 1px solid #222;
  display: flex;
  justify-content: flex-end;
  padding: 10px 20px 10px;
`;

const MessageInner = ({ message }) => {
  const queryClient = useQueryClient();
  const { accountAddress } = useSession();

  const dmPrivateKey = useStore(s => s.dmPrivateKey);

  const { data: ipfsContent, isLoading } = useIpfsContent(message?.ipfs?.hash);
  
  const [decryptedContent, setDecryptedContent] = useState();
  const [decryptionError, setDecryptionError] = useState();
  useEffect(() => {
    setDecryptionError();
    const iAmRecipient = Address.areEqual(accountAddress, message?.recipient);
    const decryptable = ipfsContent?.[iAmRecipient ? 'recipient' : 'sender'];
    if (decryptable && dmPrivateKey) {
      Encryption.decryptContent(dmPrivateKey, decryptable)
        .then((content) => {
          setDecryptedContent(content);
          if (!message?.read && iAmRecipient) {
            api.markMessageAsRead(message.id).then(() => {
              // (give use a moment to see unread then mark as read)
              setTimeout(() => {
                queryClient.setQueryData(
                  ['inbox', accountAddress],
                  (messages) => {
                    try {
                      messages.find((m) => m.id === message.id).read = true;
                    } catch (e) {
                      console.warn('Failed to mark message as read', e);
                    }
                    return messages;
                  }
                );
              }, 3500)
            });
          }
        })
        .catch((e) => {
          console.error(e);
          setDecryptedContent();
          setDecryptionError(true);
        });
    }
  }, [dmPrivateKey, ipfsContent, message]);

  return (
    <Content>
      {isLoading && <PageLoader />}
      {decryptionError ? <DecryptionError /> : (decryptedContent || '...')}
    </Content>
  );
};
  
  
const Message = ({ message, initialExpanded, isSent, scrollToSelf }) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  const onToggle = useCallback(() => {
    setExpanded((e) => !e);
  }, []);

  const elRef = useRef();
  useEffect(() => {
    if (elRef.current) {
      if (scrollToSelf) {
        elRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [scrollToSelf])

  return (
    <MessageWrapper ref={elRef}>
      <Uncollapsible expanded={expanded} onClick={onToggle}>
        {(!isSent && !message.read)
          ? <Unread><AttentionDot size={12} /></Unread>
          : (isSent
            ? (message.read
                ? <InboxSentReadIcon data-tooltip-content="Sent (read)" data-tooltip-id="launcherTooltip" />
                : <InboxSentIcon data-tooltip-content="Sent (unread)" data-tooltip-id="launcherTooltip" />
              )
            : <InboxReceivedIcon data-tooltip-content="Received (read)" data-tooltip-id="launcherTooltip" />
          )}
        <label>{moment(message.createdAt).format('MMM Do YYYY, h:mma')}</label>
        <ChevronRightIcon />
      </Uncollapsible>
      
      <Collapsible expanded={expanded}>
        {expanded && <MessageInner message={message} />}
      </Collapsible>
    </MessageWrapper>
  );
};

const Thread = ({ correspondent }) => {
  const { accountAddress } = useSession();
  const { threads, dataUpdatedAt } = useWalletInbox();
  const { data: crews } = useWalletCrews(correspondent);

  const sortedCrews = useMemo(() => {
    return crews?.sort((a, b) => (a.Name?.name || `Crew #${a.id}`).toLowerCase() < (b.Name?.name || `Crew #${b.id}`).toLowerCase() ? -1 : 1);
  }, [crews]);

  const messages = useMemo(() => {
    return (threads.find((t) => t.correspondent === correspondent)?.messages || [])
      .sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  }, [correspondent, dataUpdatedAt]);

  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dismissLauncher = useCallback(() => {
    dispatchLauncherPage();
  }, []);

  const [composing, setComposing] = useState();

  const messagesWithMeta = useMemo(() => {
    let hasScrollTarget = false;
    return (messages || []).map((m, i) => {
      const isSent = Address.areEqual(accountAddress, m.sender);
      const initialExpanded = (!isSent && !m.read) || (i === messages.length - 1);
      const scrollToSelf = initialExpanded && !hasScrollTarget;
      hasScrollTarget = hasScrollTarget || scrollToSelf;
      return {
        isSent,
        initialExpanded,
        scrollToSelf,
        message: m
      };
    });
  }, [dataUpdatedAt, messages]);

  return (
    <ThreadWrapper>
      <ThreadTitle>
        <CrewCaptainCardFramed crewId={crews?.[0]?.id} width={56} />
        <div style={{ flex: 1, paddingLeft: 12 }}>
          <div>
            <label>Wallet: </label>
            <AddressLink address={correspondent} doNotReplaceYou reverseUnderline />
          </div>
          <div style={{ maxHeight: 62, overflow: 'auto' }}>
            <label>Crew{crews?.length === 1 ? '' : 's'}: </label>
            {sortedCrews?.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 && ', '}
                <StyledLink onClick={dismissLauncher} to={`/crew/${c.id}`}>{formatters.crewName(c)}</StyledLink>
              </Fragment>
            ))}
          </div>
        </div>
      </ThreadTitle>
      <Body>
        {messagesWithMeta.map((m) => <Message key={m.message.id} {...m} />)}
      </Body>
      <Actions>
        <Button onClick={() => setComposing(true)}>Reply</Button>
      </Actions>
      {composing && (
        <DirectMessageDialog onClose={() => setComposing()} recipient={correspondent} />
      )}
    </ThreadWrapper>
  );
};

const EnableInbox = () => {
  const { chainId, walletAccount } = useSession();
  const { data: user, isLoading } = useUser();
  const { execute, getStatus } = useContext(ChainTransactionContext);

  const dispatchDmPrivateKey = useStore(s => s.dispatchDmPrivateKey);

  const getPrivateKeyFromSeed = useCallback(async (seed) => {
    const signature = await walletAccount.signMessage({
      domain: {
        name: 'Influence',
        chainId: resolveChainId(chainId, 'hex'),
        version: '1.1.0'
      },
      message: { message: 'Messaging Hash', nonce: seed.substr(0, 24) },
      primaryType: 'Message',
      types: {
        Message: [
          { name: 'message', type: 'string' },
          { name: 'nonce', type: 'string' }
        ],
        StarkNetDomain: [
          { name: 'name', type: 'felt' },
          { name: 'chainId', type: 'felt' },
          { name: 'version', type: 'felt' }
        ]
      }
    });
    if (signature) {
      const signedSeed = `${seed}${BigInt(`${signature.join('')}`).toString(16)}`;
      return await Encryption.generatePrivateKeyFromSeed(signedSeed);
    }
    return null;
  }, [chainId, walletAccount]);

  // TODO (later):
  // - add button to connected-inbox to change encryption key (or settings)
  //  - when this happens, unpin all messages (OR re-encrypt with new key?)
  const [pendingKeypair, setPendingKeypair] = useState();
  const rekeyInbox = useCallback(async () => {
    const seed = Encryption.generateSeed();
    const privateKey = await getPrivateKeyFromSeed(seed);
    if (privateKey) {
      const publicKey = Encryption.getPublicKeyFromPrivateKey(privateKey);
      const messagingKeys = Encryption.publicKeyToMessagingKeys(publicKey);
      await execute('RekeyInbox', messagingKeys);
      setPendingKeypair([publicKey, privateKey, seed]);
    }
  }, [execute]);

  const isRekeying = useMemo(() => {
    return getStatus('RekeyInbox') === 'pending';
  }, [getStatus]);

  // once detect the rekeying is underway, clear the local private key, then save the new seed and new private key
  useEffect(() => {
    if (isRekeying) {
      dispatchDmPrivateKey();
      if (pendingKeypair[1] && pendingKeypair[2]) {
        api.updateUser({ directMessagingSeed: pendingKeypair[2] }).then(() => {
          dispatchDmPrivateKey(pendingKeypair[1]);
          setPendingKeypair();
        });
      }
    }
  }, [isRekeying]);

  const [isRecovering, setIsRecovering] = useState();
  const recoverKey = useCallback(async () => {
    setIsRecovering(true);
    const seed = await api.getInboxSeed();
    if (seed) {
      const privateKey = await getPrivateKeyFromSeed(seed);
      if (privateKey) {
        dispatchDmPrivateKey(privateKey);
      }
    }
    setIsRecovering(false);
  }, []);

  if (isLoading) return <PageLoader />;

  if (user?.hasSeed && user?.publicKey) {
    return (
      <Wrapper>
        <Title>Connect to Your Inbox</Title>
        <RecoveryBody>
          <p>
            By signing your recovery seed, you can regenerate your private key
            to gain access to your inbox.
          </p>
          <Button
            disabled={isRecovering}
            isTransaction
            loading={isRecovering}
            onClick={recoverKey}
            size="large">Recover Key</Button>
        </RecoveryBody>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Title>Inbox Setup</Title>
      <RecoveryBody>
        <p>
          To enable decentralized direct messaging, you must first create an encryption
          key-pair for your messages.
        </p>
        <p>
          The public key will be published on-chain so that anyone sending to you can
          encrypt their message, such that it can only be decrypted by you (with your 
          unpublished private key).
        </p>
        <Button
          disabled={isRekeying}
          isTransaction
          loading={isRekeying}
          onClick={rekeyInbox}
          size="large">Enable Direct Messaging</Button>
      </RecoveryBody>
    </Wrapper>
  );
}

const EmptyInbox = () => {
  return (
    <Wrapper>
      <Title>Inbox</Title>
      <Empty><p>You have not yet received any messages.</p></Empty>
    </Wrapper>
  );
};

const AccountLabel = ({ address }) => {
  const label = useAccountFormatted({ address, doNotReplaceYou: true, truncate: true });
  return label || '';
};

const InboxWrapper = () => {
  const { accountAddress, authenticating, connecting, _isSimulation } = useSession();
  const { data: user, isLoading: userIsLoading } = useUser();
  const { dataUpdatedAt, isLoading, threads } = useWalletInbox();

  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dmPrivateKey = useStore(s => s.dmPrivateKey);

  // redirect if not logged in
  useEffect(() => {
    if (!(accountAddress && !_isSimulation)) {
      if (!authenticating && !connecting) {
        const t = setTimeout(() => {
          dispatchLauncherPage('play');
        }, 10);
        return () => clearTimeout(t);
      }
    }
  }, [accountAddress, authenticating, connecting, _isSimulation]);

  const messagePanes = useMemo(() => {
    return threads?.map((thread) => ({
      key: thread.correspondent,
      label: <AccountLabel address={thread.correspondent} />,
      sublabel: moment(thread.updatedAt).format('MMM Do YYYY, h:mma'),
      badge: thread.messages?.length || 0,
      attention: thread.unreadTally > 0,
      pane: <Thread correspondent={thread.correspondent} />
    }));
  }, [dataUpdatedAt, threads]);

  if (!accountAddress || isLoading || userIsLoading) {
    return <PageLoader />;
  }

  if (!user?.publicKey || !user?.hasSeed || !dmPrivateKey) {
    return <LauncherDialog singlePane={<EnableInbox />} />
  }

  if (threads?.length === 0) {
    return <LauncherDialog singlePane={<EmptyInbox />} />
  }

  return <LauncherDialog panes={messagePanes} />;
};

export default InboxWrapper;
