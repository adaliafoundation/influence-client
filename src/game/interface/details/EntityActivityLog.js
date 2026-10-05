import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import moment from 'moment';
import LoadingAnimation from 'react-spinners/PropagateLoader';
import { Entity } from '@influenceth/sdk';

import {
  CaretIcon,
  ChatIcon,
  LinkIcon,
} from '~/components/Icons';
import DataTableComponent from '~/components/DataTable';
import useActivities from '~/hooks/useActivities';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import useIpfsContent from '~/hooks/useIpfsContent';
import EntityName from '~/components/EntityName';
import useCrewContext from '~/hooks/useCrewContext';
import formatters from '~/lib/formatters';
import useAnnotationManager, { isValidAnnotation } from '~/hooks/actionManagers/useAnnotationManager';
import UncontrolledTextArea, { resizeOnKeydown } from '~/components/TextAreaUncontrolled';
import { maxAnnotationLength, nativeBool, reactPreline } from '~/lib/utils';
import Button from '~/components/ButtonAlt';
import theme from '~/theme';

const History = styled.div`
  flex: 1;
  max-width: 100%;
  overflow: auto;
  & > table {
    width: 100%;
    th {
      color: white;
    }
  }
`;

const Icon = styled.div`
  font-size: 25px;
  margin-right: 10px;
  width: 25px;
`;
const LabelHolder = styled.span`
  align-items: center;
  ${p => p.color ? `color: ${p.color};` : ''}
  display: flex;
  & > ${Icon} {
    color: ${p => p.color || 'white'};
  }
  & > span {
    font-size: 90%;
  }
`;

const Loading = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 80px;
  opacity: 0.2;
  width: 100%;
`;

const EmptyLogEntry = styled.div`
  padding-top: 50px;
  text-align: center;
`;

const TransactionLink = styled.a`
  flex: 0 0 28px;
  font-size: 116%;
  height: 20px;
  text-align: center;

  & > svg {
    color: ${p => p.theme.colors.main};
  }

  &:hover {
    & > svg {
      color: white;
    }
  }
`;

const ListWrapper = styled.div`
  align-items: flex-start !important;
  display: flex;
  flex-direction: row;
  width: 100%;
  & > * {
    margin-top: 6px;
  }
`;
const Flourish = styled.div`
  color: white;
  font-size: 32px;
  padding-right: 12px;
`;
const List = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 100px;
  & > div {
    margin-bottom: 6px;
  }
`;
const ItemWrapper = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  display: flex;
  flex-direction: row;
  min-height: 100px;
  padding: 8px;
`;
const CrewDetails = styled.div`
  flex: 0 0 175px;
  padding: 8px 12px;
  & > div {
    color: white;
    font-weight: bold;
    white-space: normal;
    word-break: break-word;
  }
  & > span {
    font-size: 85%;
  }
`;
const Content = styled.div`
  color: ${p => p.theme.colors.main};
  flex: 0 1 850px;
  min-height: 100px;
  max-height: 150px;
  overflow: hidden auto;
  padding: 8px 12px;
  white-space: normal;
  word-break: break-word;
`;
const RemainingChars = styled.div`
  color: ${p => p.remaining < 0
    ? p.theme.colors.error
    : (p.remaining < 50 ? p.theme.colors.orange : '#777')
  };
`;

const AnnotationItem = ({ annotation }) => {
  const { data: content, isLoading } = useIpfsContent(annotation?.ipfs?.hash);
  const ago = useMemo(() => {
    if (!annotation.createdAt) return 'a long time ago';
    const m = moment(new Date(annotation.createdAt));
    return m.fromNow();
  }, [annotation.createdAt]);
  return (
    <ItemWrapper>
      <div>
        <CrewCaptainCardFramed crewId={annotation.crew} width={65} />
      </div>
      <CrewDetails>
        <div><EntityName label={Entity.IDS.CREW} id={annotation.crew} /></div>
        <span>{ago}</span>
      </CrewDetails>
      <Content>
        {isLoading
          ? <Loading><LoadingAnimation color="white" loading /></Loading>
          : reactPreline(content)
        }
      </Content>
    </ItemWrapper>
  );
}

const AddAnnotationItem = ({ activity }) => {
  const { crew } = useCrewContext();
  const { saveAnnotation, savingAnnotation, txPending } = useAnnotationManager(activity);

  const [annotation, setAnnotation] = useState();

  const handleChange = useCallback(async (e) => {
    setAnnotation(e.currentTarget.value || '');
    resizeOnKeydown(95)(e);
  }, []);

  const saveNewAnnotation = useCallback(async () => {
    if (isValidAnnotation(annotation)) {
      return saveAnnotation(annotation);
    }
  }, [annotation]);

  const remaining = useMemo(() => maxAnnotationLength - (annotation?.length || 0), [annotation?.length]);

  return (
    <ItemWrapper>
      <div>
        <CrewCaptainCardFramed crewId={crew.id} width={65} />
      </div>
      <CrewDetails>
        <div>{formatters.crewName(crew)}</div>
      </CrewDetails>
      <Content>
        {txPending
          ? <Loading><LoadingAnimation color="white" loading /></Loading>
          : (
            <>
              <div>
                <UncontrolledTextArea
                  disabled={nativeBool(savingAnnotation)}
                  onChange={handleChange}
                  placeholder="Add annotation..."
                  style={{ height: 36 }}
                  value={annotation} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <RemainingChars remaining={remaining}>{remaining.toLocaleString()} Remaining</RemainingChars>
                <Button
                  disabled={nativeBool(savingAnnotation || !annotation || remaining < 0)}
                  loading={savingAnnotation}
                  size="small"
                  isTransaction
                  onClick={saveNewAnnotation}>
                  Add Annotation
                </Button>
              </div>
            </>
          )
        }
      </Content>
    </ItemWrapper>
  );
}

// (earliest annotations don't always have createdAt)
const fallbackTime = '2000-01-01T00:00:00.000Z';

const AnnotationsList = ({ activity }) => {
  const { crew } = useCrewContext();
  if (!crew && !activity?._virtuals?.eventAnnotations) return null;
  return (
    <ListWrapper>
      <Flourish><CaretIcon /></Flourish>
      <List>
        {crew && <AddAnnotationItem key={activity._virtuals.eventAnnotations.length} activity={activity} />}
        {activity._virtuals.eventAnnotations
          .sort((a, b) => (a.createdAt || fallbackTime) > (b.createdAt || fallbackTime) ? -1 : 1)
          .map((a) => <AnnotationItem key={a?.ipfs?.hash} annotation={a} />)}
      </List>
    </ListWrapper>
  );
}

const EntityActivityLog = ({ entity, viewingAs }) => {
  const getActivityConfig = useGetActivityConfig();
  const { data: activities } = useActivities(entity);

  const activityRows = useMemo(() => {
    return (activities || [])
      .map((a) => ({ ...a, _logContent: getActivityConfig(a, viewingAs)?.logContent }))
      .filter((a) => !!a._logContent);
  }, [activities, getActivityConfig, viewingAs]);

  const columns = useMemo(() => {
    return [
      {
        key: 'createdAt',
        label: 'Time',
        noMinWidth: true,
        selector: (row) => {
          const m = moment(new Date(row.event.timestamp * 1000));
          return <span style={{ color: 'white', fontWeight: 'bold', marginRight: 10 }}>{m.fromNow()}</span>;
        },
      },
      {
        key: 'label',
        bodyStyle: { whiteSpace: 'wrap', width: '100%' },
        label: 'Event',
        wrap: true,
        selector: row => (
          <LabelHolder>
            <Icon>{row._logContent.icon}</Icon>
            <span>{row._logContent.content}</span>
          </LabelHolder>
        ),
      },
      {
        key: 'annotationCount',
        label: 'Annotations',
        noMinWidth: true,
        selector: row => {
          const tally = row._virtuals?.eventAnnotations?.length || 0;
          return (
            <LabelHolder color={tally > 0 ? theme.colors.main : '#444'}>
              <Icon><ChatIcon /></Icon>
              <span>{row._virtuals?.eventAnnotations?.length || 0}</span>
            </LabelHolder>
          );
        }
      },
      {
        key: 'link',
        label: 'Link',
        align: 'center',
        noMinWidth: true,
        selector: row => row._logContent.txLink
          ? (
            <TransactionLink href={row._logContent.txLink} rel="noreferrer" target="_blank">
              <LinkIcon />
            </TransactionLink>
          )
          : null
        ,
      },
      {
        key: '_expandable',
        skip: true,
        selector: row => <AnnotationsList activity={row} />
      }
    ];
  }, []);

  return (
    <History>
      {activityRows?.length > 0
        ? (
          <DataTableComponent
            columns={columns}
            data={activityRows}
            keyField="id"
            sortDirection="desc"
            sortField="createdAt"
          />
        )
        : (
          <EmptyLogEntry>No logs recorded yet.</EmptyLogEntry>
        )
      }
    </History>
  );
}

export default EntityActivityLog;