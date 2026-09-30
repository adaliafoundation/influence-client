import { errorMessages } from '../../../../lib/errorMessages';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';
import moment from 'moment';

import Button from '~/components/ButtonAlt';
import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import EntityLink from '~/components/EntityLink';
import { InputBlock } from '~/components/filters/components';
import UncontrolledTextArea, { resizeOnKeydown } from '~/components/TextAreaUncontrolled';
import useStore from '~/hooks/useStore';
import { nativeBool, reactPreline } from '~/lib/utils';
import useWebsocket from '~/hooks/useWebsocket';
import useCrewContext from '~/hooks/useCrewContext';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-bottom: 15px;
`;

const ChatsWrapper = styled.div`
  display: flex;
  flex-direction: column-reverse;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  width: 100%;
`;

const Chats = styled.div`
  border-bottom: 1px solid #333;
  display: flex;
  flex-direction: column;
  margin-bottom: 2px;
  width: 100%;
`;

const on = 12;
const off = 3;
const Break = styled.div`
  background: repeating-linear-gradient(
    45deg,
    #333 0,
    #333 ${on}px,
    #191919 ${on + 1}px,
    #191919 ${on + off}px
  );
  bottom: -1px;
  height: 8px;
  position: relative;
  width: 100%;
  z-index: 1;
`;

const Chat = styled.div`
  color: #AAA;
  display: flex;
  flex-direction: row;
  font-size: 15px;
  padding: 10px 0;

  a {
    color: white;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
    &:after {
      content: ":";
    }
  }
  &:not(:first-child) {
    border-top: 1px solid #333;
  }

  & > div:first-child {
    flex: 0 0 60px;
  }
  & > div:last-child {
    ${p => p.showTimestamp ? 'align-self: center;' : 'padding-top: 2px;'}
    flex: 1;
  }
`;
const Ago = styled.div`
  font-size: 85%;
  margin-top: 6px;
  opacity: 0.6;
`;

const RemainingChars = styled.div`
  color: ${p => p.remaining < 0
    ? p.theme.colors.error
    : (p.remaining < 50 ? p.theme.colors.orange : '#777')
  };
`;

const maxChatMessageLength = 280;

const isValidChatMessage = (content) => {
  return true;
}

const maxChatInputHeight = 95;

const ChatItem = ({ chat, showTimestamp }) => {
  const ago = useMemo(() => {
    if (!chat.timestamp) return 'a long time ago';
    const m = moment(new Date(chat.timestamp));
    return m.fromNow();
  }, [chat.timestamp]);
  return (
    <Chat showTimestamp={showTimestamp}>
      <div>
        <CrewCaptainCardFramed crewId={chat.crewId} noArrow width={50} />
      </div>
      <div>
        <div>
          <EntityLink id={chat.crewId} label={Entity.IDS.CREW} />{' '}<span>{reactPreline(chat.message)}</span>
        </div>
        {showTimestamp && <Ago>{ago}</Ago>}
      </div>
    </Chat>
  )
};

const AsteroidChat = () => {
  const { crew } = useCrewContext();
  const { emitMessage } = useWebsocket();

  const asteroidId = useStore(s => s.asteroids.origin);
  const chatHistory = useStore(s => s.chatHistory);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchChatRoomView = useStore(s => s.dispatchChatRoomView);

  const chatInputRef = useRef();
  const chatScrollRef = useRef();

  const [newChat, setNewChat] = useState();

  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, []);
  
  const [submitting, setSubmitting] = useState();
  const submitNewChat = useCallback(async () => {
    if (asteroidId && crew?.id && isValidChatMessage(newChat)) {
      setSubmitting(true);
      const ack = await emitMessage('send-message', {
        from: { label: Entity.IDS.CREW, id: crew?.id },
        asteroid: { label: Entity.IDS.ASTEROID, id: asteroidId },
        message: newChat
      });

      if (ack) {
        setNewChat('');
        resizeOnKeydown(maxChatInputHeight)(chatInputRef.current);
        scrollToBottom();

        // reset focus on textarea
        setTimeout(() => {
          chatInputRef.current.focus();
        }, 0);
      } else {
        createAlert({
          type: 'GenericAlert',
          data: { content: errorMessages.messageFailed },
          duration: 3000,
          level: 'warning',
        });
      }

      setSubmitting(false);
    }
  }, [asteroidId, crew?.id, emitMessage, newChat, createAlert]);

  const handleNewChatChange = useCallback(async (e) => {
    setNewChat(e.currentTarget.value || '');
    resizeOnKeydown(maxChatInputHeight)(e);
    scrollToBottom();
  }, [scrollToBottom]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      submitNewChat();
    }
  }, [submitNewChat]);

  const remaining = useMemo(() => maxChatMessageLength - (newChat?.length || 0), [newChat?.length]);

  const asteroidChats = useMemo(
    () => (chatHistory || [])
      // filter to asteroid (and connection breaks)
      .filter((c) => c.isConnectionBreak || c.asteroidId === asteroidId)
      // filter out consecutive connection breaks
      .filter((c, i, arr) => i === 0 || !(c.isConnectionBreak && arr[i - 1].isConnectionBreak))
      // filter out connection break if first or last element
      .filter((c, i, arr) => (i > 0 && i < arr.length - 1) || !c.isConnectionBreak),
    [asteroidId, chatHistory]
  );

  const lastChat = asteroidChats?.[asteroidChats?.length - 1];
  useEffect(() => {
    if (asteroidId && lastChat?.unread) {
      dispatchChatRoomView(asteroidId);
    }
  }, [asteroidId, lastChat?.timestamp]);

  useEffect(() => {
    scrollToBottom();
  }, [asteroidChats, scrollToBottom]);

  return (
    <Wrapper>
      <ChatsWrapper ref={chatScrollRef}>
        <Chats>
          {asteroidChats.map((chat, i) => {
            return chat.isConnectionBreak
              ? (
                <Break key={i}
                  data-tooltip-content="Connection interruption (messages may be missing)"
                  data-tooltip-id="hudMenuTooltip" />
              )
              : <ChatItem key={chat.timestamp} chat={chat} showTimestamp={!!crew} />;
          })}
        </Chats>
      </ChatsWrapper>
      <InputBlock>
        <div>
          <UncontrolledTextArea
            disabled={nativeBool(!asteroidId || !crew || crew._isSimulation || submitting)}
            onChange={handleNewChatChange}
            onKeyDown={handleKeyDown}
            placeholder="Add message..."
            ref={chatInputRef}
            style={{ height: 36 }}
            value={newChat} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <RemainingChars remaining={remaining}>{remaining.toLocaleString()} Remaining</RemainingChars>
          <Button
            disabled={nativeBool(!newChat || remaining < 0 || !asteroidId || !crew || crew._isSimulation || submitting)}
            loading={!!submitting}
            size="small"
            onClick={submitNewChat}>
            Send
          </Button>
        </div>
      </InputBlock>
    </Wrapper>
  );
};

export default AsteroidChat;