import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Entity, Permission, Time } from '@influenceth/sdk';
import styled from 'styled-components';
import Clipboard from 'react-clipboard.js';
import numeral from 'numeral';

import { appConfig } from '~/appConfig';
import { CheckIcon, CloseIcon, ExtendAgreementIcon, FormAgreementIcon, FormLotAgreementIcon, GiveNoticeIcon, LinkIcon, CancelAgreementIcon, LotControlIcon, PermissionIcon, RefreshIcon, SwayIcon, WarningOutlineIcon, WarningIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import { isHybrid } from '~/lib/gameMode';
import { daysToSeconds, reactBool, locationsArrToObj, formatFixed, monthsToSeconds, secondsToMonths, nativeBool, secondsToDays, safeBigInt, formatTimer } from '~/lib/utils';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  FlexSectionSpacer,
  ActionDialogBody,
  FlexSectionInputBlock,
  FlexSection,
  FlexSectionBlock,
  LotInputBlock,
  BuildingInputBlock,
  ShipInputBlock,
} from './components';
import { ActionDialogInner } from '../ActionDialog';
import actionStages from '~/lib/actionStages';
import theme, { hexToRGB } from '~/theme';
import CrewIndicator from '~/components/CrewIndicator';
import useEntity from '~/hooks/useEntity';
import useSession from '~/hooks/useSession';
import useAgreementManager from '~/hooks/actionManagers/useAgreementManager';
import useHydratedLocation from '~/hooks/useHydratedLocation';
import useCrew from '~/hooks/useCrew';
import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import Button from '~/components/ButtonAlt';
import useBlockTime from '~/hooks/useBlockTime';
import useLot from '~/hooks/useLot';
import useAsteroid from '~/hooks/useAsteroid';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

const FormSection = styled.div`
  margin-top: 12px;
  &:first-child {
    margin-top: 0px;
  }
`;

const InputLabel = styled.div`
  align-items: center;
  color: #888;
  display: flex;
  flex-direction: row;
  font-size: 14px;
  margin-bottom: 3px;
  & > label {
    flex: 1;
  }
  & > span {
    b {
      color: white;
      font-weight: normal;
    }
  }
`;

const DisabledUncontrolledTextInput = styled(UncontrolledTextInput)`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.15);
`;

const InputSublabels = styled.div`
  display: flex;
  flex-direction: row;
  font-size: 80%;
  justify-content: space-between;
  margin: 6px 0;
  & > div > b {
    color: white;
    font-weight: normal;
  }
`;

const Desc = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 90%;
  & > a { text-decoration: none; }
`;
const ContractDesc = styled(Desc)`
  margin-bottom: 20px;
`;

const InsufficientAssets = styled.span`
  color: ${p => p.theme.colors.red};
`;
const Alert = styled.div`
  & > div {
    display: flex;

    &:first-child {
      align-items: center;
      background: rgba(${p => hexToRGB(p.theme.colors[p.scheme ? (p.scheme === 'success' ? 'green' : 'red') : 'main'])}, 0.4);
      color: white;
      display: flex;
      font-size: 20px;
      padding: 8px 8px;
      & > svg {
        font-size: 24px;
        margin-right: 6px;
      }

      ${p => p.scheme && `
        &:after {
          content: "${p.scheme === 'success' ? 'Permitted' : 'Restricted'}";
          color: ${p.scheme === 'success' ? p.theme.colors.green : p.theme.colors.red};
          flex: 1;
          text-align: right;
          text-transform: uppercase;
        }
      `}
    }

    &:not(:first-child) {
      align-items: flex-end;
      justify-content: space-between;
      padding: 8px 10px 0;
      b {
        color: white;
        font-weight: normal;
      }

      ${p => p.scheme && `
        color: ${p.scheme === 'success' ? p.theme.colors.green : p.theme.colors.red};
      `}
    }
  }
`;

const FormAgreement = ({
  agreementManager,
  entity,
  isExtension,
  isTermination,
  permission,
  stage,
  ...props
}) => {
  const { provider } = useSession();
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { currentAgreement, currentPolicy, cancelAgreement, enterAgreement, extendAgreement, pendingChange } = agreementManager;
  const { data: asteroid } = useAsteroid(locationsArrToObj(entity?.Location?.locations || []).asteroidId);
  const blockTime = useBlockTime();
  const { crew } = useCrewContext();
  const { data: swayBalance } = useSwayBalance();

  const location = useHydratedLocation(locationsArrToObj(entity?.Location?.locations || []));

  const { data: controller } = useCrew((entity?.label === Entity.IDS.LOT ? asteroid : entity)?.Control?.controller?.id);
  // NOTE: this flow is only relevant to prepaid and contract policy types now, so no account-permitted stuff here yet
  const { data: permitted } = useCrew(currentAgreement?.permitted?.id);

  const maxTerm = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (isExtension && currentAgreement?.endTime > now) {
      return 365 - secondsToDays(Math.max(0, currentAgreement?.endTime - currentAgreement?.startTime));
    }
    return 365;
  }, [currentAgreement, isExtension]);

  const maxTermFloored = useMemo(() => Math.floor(maxTerm * 10) / 10, [maxTerm]);

  const minTerm = useMemo(() => {
    return (isExtension) ? 1 : currentPolicy?.policyDetails?.initialTerm || 0
  }, [currentPolicy]);

  const [initialPeriod, setInitialPeriod] = useState(
    (pendingChange?.vars?.term || pendingChange?.vars?.added_term)
      ? secondsToDays(pendingChange.vars.term || pendingChange.vars.added_term)
      : (isExtension ? Math.min(maxTermFloored, 30) : (currentPolicy?.policyDetails?.initialTerm || 0))
  );

  const remainingPeriod = useMemo(() => currentAgreement?.endTime - blockTime, [blockTime, currentAgreement?.endTime]);
  const refundablePeriod = useMemo(() => Math.max(0, remainingPeriod - monthsToSeconds(currentAgreement?.noticePeriod)), [currentAgreement?.noticePeriod, remainingPeriod]);
  const refundableAmount = useMemo(() => refundablePeriod * (currentAgreement?.rate_swayPerSec || 0), [currentAgreement?.rate_swayPerSec, refundablePeriod]);

  const stats = useMemo(() => {
    if (isTermination) {
      return [
        {
          label: 'Remaining Lease',
          value: `${formatFixed(secondsToMonths(remainingPeriod), 2)} mo`,
          direction: 0
        },
        {
          label: 'Remaining Lease (Adalian Days)',
          value: Math.round(Time.toGameDuration(remainingPeriod / 86400, crew?._timeAcceleration)).toLocaleString(),
          direction: 0
        }
      ];
    }
    if (currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID) {
      return [
        {
          label: `${isExtension ? 'Added ' : ''}Lease Length`,
          value: `${initialPeriod} day${initialPeriod === 1 ? '' : 's'}`,
          direction: 0,
        },
        {
          label: 'Notice Period',
          value: isExtension
            ? `${formatFixed(currentAgreement?.noticePeriod || 0, 1)} day${currentAgreement?.noticePeriod === 1 ? '' : 's'}`
            : `${formatFixed(currentPolicy?.policyDetails?.noticePeriod || 0, 1)} day${currentPolicy?.policyDetails?.noticePeriod === 1 ? '' : 's'}`,
          direction: 0,
        },
      ];
    }
    return [];
  }, [crew, currentAgreement, currentPolicy, initialPeriod, isExtension, isTermination, remainingPeriod]);

  const totalLeaseCost = useMemo(() => {
    const p = initialPeriod || 0;
    const r = currentPolicy?.policyDetails?.rate || 0;
    const precision = TOKEN_SCALE[TOKEN.SWAY] * 1e3; // TODO: check contracts for what should actually use here
    return Math.round(p * 24 * r * precision) / precision;
    ;
  }, [initialPeriod, currentPolicy]);

  const insufficientAssets = useMemo(
    () => safeBigInt(Math.ceil(isTermination ? refundableAmount : totalLeaseCost)) > swayBalance,
    [swayBalance, refundableAmount, totalLeaseCost, isTermination]
  );

  const [eligible, setEligible] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const updateContractEligibility = useCallback(async () => {
    if (!provider) return;
    if (!currentPolicy?.policyDetails?.contract) return;
    // In hybrid mode, server validates policies during action execution.
    // Optimistically allow all — server returns 400 if invalid.
    if (isHybrid()) { setEligible(true); return; }
    try {
      setEligibilityLoading(true);
      const response = await provider.callContract({
        contractAddress: currentPolicy?.policyDetails?.contract,
        entrypoint: 'accept',
        calldata: [
          { label: entity.label, id: entity.id },   // target
          permission, // permission
          { label: crew?.label, id: crew?.id },   // permitted
        ]
      });
      setEligible(response?.[0] === "0x1");
    } catch (e) {
      console.warn(e);
    }
    setEligibilityLoading(false);
  }, [crew?.id, crew?.label, currentPolicy?.policyDetails?.contract, entity, permission, provider]);

  useEffect(() => {
    updateContractEligibility()
  }, [updateContractEligibility]);

  const handleCopyAddress = useCallback(() => {
    createAlert({
      type: 'ClipboardAlert',
      data: { content: 'Contract address copied to clipboard.' },
      duration: 2000
    });
  }, [createAlert]);

  const handlePeriodChange = useCallback((e) => {
    if (e.currentTarget.value === '') return setInitialPeriod('');
    const parsed = numeral(e.currentTarget.value);
    if (!parsed) return setInitialPeriod(e.currentTarget.value);
    setInitialPeriod(parsed.value());
  });

  const handlePeriodBlur = useCallback((e) => {
    if (e.currentTarget.value === '') return setInitialPeriod('');
    const parsed = numeral(e.currentTarget.value);
    setInitialPeriod(numeral(Math.max(minTerm, Math.min(parsed.value(), maxTerm))).format('0.00'));
  }, [currentPolicy?.policyDetails?.initialTerm, maxTerm]);

  const onEnterAgreement = useCallback(() => {
    const recipient = controller?.Crew?.delegatedTo;
    // TODO: should these conversions be in useAgreementManager?
    const term = daysToSeconds(initialPeriod);
    console.log({ totalLeaseCost, x: totalLeaseCost * TOKEN_SCALE[TOKEN.SWAY] });
    const termPrice = Math.ceil(totalLeaseCost * TOKEN_SCALE[TOKEN.SWAY]);
    enterAgreement({ recipient, term, termPrice });
  }, [controller?.Crew?.delegatedTo, enterAgreement, initialPeriod, totalLeaseCost]);

  const onExtendAgreement = useCallback(() => {
    const recipient = controller?.Crew?.delegatedTo;
    // TODO: should these conversions be in useAgreementManager?
    const term = Math.round(daysToSeconds(initialPeriod));
    const termPrice = Math.round(totalLeaseCost * TOKEN_SCALE[TOKEN.SWAY]);
    extendAgreement({ recipient, term, termPrice });
  }, [controller?.Crew?.delegatedTo, extendAgreement, initialPeriod, totalLeaseCost]);

  const onTerminateAgreement = useCallback(() => {
    cancelAgreement({
      recipient: permitted?.Crew?.delegatedTo,
      refundAmount: Math.ceil(refundableAmount * TOKEN_SCALE[TOKEN.SWAY])
    })
  }, [cancelAgreement, permitted, refundableAmount]);

  const alertScheme = useMemo(() => {
    if (currentPolicy?.policyType === Permission.POLICY_IDS.CONTRACT) {
      if (!eligibilityLoading) return eligible ? 'success' : 'error';
    }
    return ''
  }, [currentPolicy, eligibilityLoading, eligible]);

  const actionDetails = useMemo(() => {
    const policyType = currentPolicy?.policyType;
    if (isTermination) {
      return {
        icon: currentAgreement?.noticePeriod > 0 ? <GiveNoticeIcon /> : <CancelAgreementIcon />,
        label: currentAgreement?.noticePeriod > 0 ? 'Give Notice' : 'Terminate Agreement',
        status: stage === actionStages.NOT_STARTED ? 'Owner Action' : undefined,
        goLabel: currentAgreement?.noticePeriod > 0 ? 'Give Notice' : 'Terminate',
        onGo: onTerminateAgreement
      };
    }
    if (isExtension) {
      return {
        icon: <ExtendAgreementIcon />,
        label: `Extend ${entity.label === Entity.IDS.LOT ? 'Lot' : 'Asset'} Agreement`,
        status: stage === actionStages.NOT_STARTED ? 'Prepaid Lease' : undefined,
        goLabel: 'Update Agreement',
        onGo: onExtendAgreement
      };
    }
    return {
      icon: entity.label === Entity.IDS.LOT ? <FormLotAgreementIcon /> : <FormAgreementIcon />,
      label: `Form ${entity.label === Entity.IDS.LOT ? 'Lot' : 'Asset'} Agreement`,
      status: stage === actionStages.NOT_STARTED
        ? (policyType === Permission.POLICY_IDS.PREPAID ? 'Prepaid Lease' : 'Custom Contract')
        : undefined,
      goLabel: 'Create Agreement',
      onGo: onEnterAgreement
    }
  }, [currentAgreement?.noticePeriod, currentPolicy?.policyType, entity, isExtension, isTermination, onEnterAgreement, onExtendAgreement, onTerminateAgreement, stage]);

  const disableGo = useMemo(() => {
    if (insufficientAssets) return true;
    if (isTermination && currentAgreement?._canGiveNoticeStart > blockTime) return true;
    if (initialPeriod === '' || initialPeriod <= 0) return true;
    return false;
  }, [blockTime, initialPeriod, insufficientAssets, isTermination, currentAgreement]);
  return (
    <>
      <ActionDialogHeader
        action={actionDetails}
        actionCrew={crew}
        location={location}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection style={{ alignItems: 'flex-start' }}>
          <FlexSectionBlock
            title="Permission Target"
            bodyStyle={{ height: 'auto', padding: 0 }}>

            {entity.label === Entity.IDS.BUILDING && (
              <BuildingInputBlock building={entity} style={{ width: '100%' }} />
            )}
            {entity.label === Entity.IDS.LOT && (
              <LotInputBlock lot={entity} style={{ width: '100%' }} />
            )}
            {entity.label === Entity.IDS.SHIP && (
              <ShipInputBlock ship={entity} style={{ width: '100%' }} />
            )}

            <div style={{ padding: '20px 10px' }}>
              <CrewIndicator crew={controller} label={entity?.label === Entity.IDS.LOT ? `Administrator` : undefined} />
            </div>
          </FlexSectionBlock>

          <FlexSectionSpacer />

          {isTermination && (
            <FlexSectionBlock
              title="Agreement Details"
              bodyStyle={{ height: 'auto', padding: '6px 12px' }}>

              <FormSection>
                <InputLabel>
                  <label>Notice Period</label>
                </InputLabel>
                <TextInputWrapper rightLabel="days">
                  <DisabledUncontrolledTextInput
                    disabled
                    value={(currentAgreement?.noticePeriod || 0)} />
                </TextInputWrapper>
              </FormSection>

              <FormSection>
                <InputLabel>
                  <label>Excess Prepaid</label>
                </InputLabel>
                <TextInputWrapper rightLabel="days">
                  <DisabledUncontrolledTextInput
                    disabled
                    style={refundableAmount > 0 ? { backgroundColor: '#300c0c', color: theme.colors.red, fontWeight: 'bold' } : {}}
                    value={secondsToMonths(refundablePeriod || 0)} />
                </TextInputWrapper>
              </FormSection>

              {refundablePeriod > 0 && (
                <FormSection>
                  <InputLabel>
                    <label>Price</label>
                  </InputLabel>
                  <TextInputWrapper rightLabel="SWAY / month">
                    <DisabledUncontrolledTextInput
                      disabled
                      value={(currentAgreement?.rate || 0)} />
                  </TextInputWrapper>
                </FormSection>
              )}

            </FlexSectionBlock>
          )}

          {!isTermination && (isExtension || currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID) && (
            <FlexSectionBlock
              title={`${isExtension ? 'Extend' : 'Lease'} For`}
              bodyStyle={{ height: 'auto', padding: '6px 12px' }}>

              <FormSection>
                <InputLabel>
                  <label>{isExtension ? 'Added' : 'Leasing'} Period</label>
                </InputLabel>
                <TextInputWrapper rightLabel="days">
                  <UncontrolledTextInput
                    disabled={stage !== actionStages.NOT_STARTED}
                    min={currentPolicy?.policyDetails?.initialTerm}
                    max={maxTermFloored}
                    onBlur={handlePeriodBlur}
                    onChange={handlePeriodChange}
                    step={1}
                    type="number"
                    value={initialPeriod} />
                </TextInputWrapper>
                <InputSublabels>
                  {isExtension
                    ? <div>Min <b>{minTerm} day</b></div>
                    : <div>Min <b>{formatFixed(currentPolicy?.policyDetails?.initialTerm || 0, 2)} day{currentPolicy?.policyDetails?.initialTerm === 1 ? '' : 's'}</b></div>
                  }
                  <div>Max <b>{formatFixed(maxTermFloored, 1)} days</b></div>
                </InputSublabels>
              </FormSection>

              <FormSection>
                <InputLabel>
                  <label>Price</label>
                </InputLabel>
                <TextInputWrapper rightLabel="SWAY / day">
                  <DisabledUncontrolledTextInput
                    disabled
                    value={formatFixed((currentPolicy?.policyDetails?.rate || 0) * 24)} />
                </TextInputWrapper>
              </FormSection>

            </FlexSectionBlock>
          )}

          {!isTermination && !(isExtension || currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID) && (
            <FlexSectionBlock
              title="Details"
              bodyStyle={{ height: 'auto', padding: '6px 12px' }}>
              <ContractDesc>
                Custom Contracts are used by owners to share or delegate permissions in a flexible manner.
                They are written outside of the game client and may be viewed externally on{' '}
                <a href={`${appConfig.get('Url.starknetExplorer')}/contract/${currentPolicy?.policyDetails?.contract}`} target="_blank" rel="noreferrer">Starkscan</a>.
              </ContractDesc>

              <Clipboard
                component="span"
                data-clipboard-text={`${currentPolicy?.policyDetails?.contract}`}
                onClick={handleCopyAddress}>
                <Button>
                  <LinkIcon /> <span>Copy Contract Address</span>
                </Button>
              </Clipboard>
            </FlexSectionBlock>
          )}
        </FlexSection>

        <FlexSection style={{ alignItems: 'flex-start' }}>
          <FlexSectionInputBlock
            title="Agreement Details"
            bodyStyle={{ height: isTermination && refundablePeriod > 0 && currentAgreement?.rate > 0 ? 115 : 'auto', padding: 6 }}
            style={{ width: '100%' }}>
            <Alert scheme={alertScheme}>
              <div>
                {entity.label === Entity.IDS.LOT
                  ? <><LotControlIcon /> Lot Control (Exclusive)</>
                  : <><PermissionIcon /> {Permission.TYPES[permission].name}</>
                }
              </div>
              {isTermination
                ? (
                  <>
                    <Desc>
                      Start the Notice Period, after which the asset agreement expires.
                    </Desc>
                    {refundablePeriod > 0 && currentAgreement?.rate > 0 && (
                      <div style={{ padding: '0 10px' }}>
                        <div>
                          Excess Duration Refunded: <b>{' '}{secondsToMonths(refundablePeriod)} months</b>
                        </div>
                        <div style={{ position: 'relative', top: 4 }}>
                          <span style={{ position: 'relative', bottom: 4 }}>Total:</span>
                          <span style={{ color: 'white', display: 'inline-flex', fontSize: '32px', height: '32px', lineHeight: '32px' }}>
                            <SwayIcon /> <span>{formatFixed(refundableAmount)}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )
                : (
                  <>
                    {currentPolicy?.policyType === Permission.POLICY_IDS.CONTRACT && (
                      <div style={{ marginTop: 3 }}>
                        <div style={{ fontSize: '85%' }}>
                          {eligibilityLoading && `Checking eligibility...`}
                          {!eligibilityLoading && eligible && <><CheckIcon /> Crew check succeeded.</>}
                          {!eligibilityLoading && !eligible && <><CloseIcon /> Crew check failed. Refresh to check again.</>}
                        </div>
                        <div>
                          <Button
                            disabled={nativeBool(eligibilityLoading)}
                            loading={eligibilityLoading}
                            onClick={updateContractEligibility}
                            size="small">
                            <RefreshIcon /> <span>Refresh</span>
                          </Button>
                        </div>
                      </div>
                    )}
                    {currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID && (
                      <div>
                        <div>
                          {insufficientAssets
                            ? <InsufficientAssets>Insufficient Wallet Balance</InsufficientAssets>
                            : <>Granted For: <b>{' '}{initialPeriod} days</b></>
                          }
                        </div>
                        <div style={{ position: 'relative', top: 4 }}>
                          <span style={{ position: 'relative', bottom: 4 }}>Total:</span>
                          <span style={{ color: 'white', display: 'inline-flex', fontSize: '32px', height: '32px', lineHeight: '32px' }}>
                            <SwayIcon /> <span>{formatFixed(totalLeaseCost)}</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}

            </Alert>
          </FlexSectionInputBlock>
        </FlexSection>

        {crew?.id === permitted?.id && currentAgreement?.rate > 0 && !isExtension && remainingPeriod > 0 && (
          <FlexSection style={{ alignItems: 'center', color: theme.colors.error, justifyContent: 'center' }}>
            <span style={{ fontSize: '28px', textAlign: 'center', width: 60 }}><WarningIcon /></span>
            <span style={{ flex: '1 0 calc(100% - 60px)', fontSize: '90%' }}>
              My crew has an existing pre-paid agreement here with <b>{formatTimer(remainingPeriod, 2).toUpperCase()}</b> remaining.
              This new agreement will replace the previous and go into effect immediately without refund, credit, or delay.
            {/* 
              Crew has an existing agreement. Forming a new agreement will replace the existing one.
              There will be no credit or refund for the {formatTimer(remainingPeriod, 2)} that
              remains of your original pre-paid term.*/}
            </span>
          </FlexSection>
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={disableGo}
        goLabel={actionDetails.goLabel}
        onGo={actionDetails.onGo}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = ({ entity: entityId, permission, isExtension, agreementPath, ...props }) => {
  const { crewIsLoading } = useCrewContext();
  const { data: asset, isLoading: assetIsLoading } = useEntity(entityId?.label === Entity.IDS.LOT ? undefined : entityId);
  const { data: lot, isLoading: lotIsLoading } = useLot(entityId?.label === Entity.IDS.LOT ? entityId?.id : undefined);
  const entity = asset || lot;
  const entityIsLoading = assetIsLoading || lotIsLoading;

  const agreementManager = useAgreementManager(entity, permission, agreementPath);
  const stage = agreementManager.pendingChange ? actionStages.STARTING : actionStages.NOT_STARTED;

  // handle auto-closing on any status change
  const lastStatus = useRef();
  useEffect(() => {
    if (lastStatus.current && stage !== lastStatus.current) {
      props.onClose();
    }
    if (!lastStatus.current) {
      lastStatus.current = stage;
    }
  }, [stage, props]);

  useEffect(() => {
    if (!entityIsLoading && !entity) {
      props.onClose();
    }
  }, [entity, entityIsLoading, props]);

  return (
    <ActionDialogInner
      actionImage="Agreements"
      isLoading={reactBool(entityIsLoading || crewIsLoading)}
      stage={stage}>
      <FormAgreement
        entity={entity}
        agreementManager={agreementManager}
        permission={permission}
        isExtension={isExtension}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
