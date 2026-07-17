import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Entity, Permission, Time } from '@influenceth/sdk';
import styled from 'styled-components';
import numeral from 'numeral';

import { appConfig } from '~/appConfig';
import { CheckIcon, CloseIcon, ExtendAgreementIcon, FormAgreementIcon, FormLotAgreementIcon, GiveNoticeIcon, LinkIcon, CancelAgreementIcon, LotControlIcon, PermissionIcon, RefreshIcon, SwayIcon, WarningOutlineIcon, WarningIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
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
import { copyTextToClipboard } from '~/lib/clipboard';
import {
  getEntityCrew,
  getLotLeaseAuctionStatus,
  getLotLeasePayment,
  isLeaseHolderOrBuildingController,
  toSway
} from '~/lib/leaseUtils';

const FormSection = styled.div`
  margin-top: 12px;
  &:first-child {
    margin-top: 0px;
  }
`;

const InputLabel = styled.div`
  align-items: center;
  color: ${p => p.$invalid ? p.theme.colors.error : '#888'};
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

const LeasePeriodTextInput = styled(UncontrolledTextInput)`
  ${p => p.$invalid ? `border-color: ${p.theme.colors.error};` : ''}
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

  const { currentAgreement, currentAgreementRaw, currentPolicy, cancelAgreement, enterAgreement, extendAgreement, pendingChange } = agreementManager;
  const { data: asteroid } = useAsteroid(locationsArrToObj(entity?.Location?.locations || []).asteroidId);
  const blockTime = useBlockTime();
  const { accountCrewIds, crew } = useCrewContext();
  const { data: swayBalance } = useSwayBalance();

  const location = useHydratedLocation(locationsArrToObj(entity?.Location?.locations || []));

  const { data: controller, isLoading: controllerIsLoading } = useCrew((entity?.label === Entity.IDS.LOT ? asteroid : entity)?.Control?.controller?.id);
  // NOTE: this flow is only relevant to prepaid and contract policy types now, so no account-permitted stuff here yet
  const { data: permitted } = useCrew(currentAgreement?.permitted?.id);
  const { data: buildingController, isLoading: buildingControllerIsLoading } = useCrew(entity?.building?.Control?.controller?.id);

  const isLotLease = entity?.label === Entity.IDS.LOT && permission === Permission.IDS.USE_LOT;
  const auctionStatus = useMemo(
    () => isLotLease ? getLotLeaseAuctionStatus({ asteroid, lot: entity, blockTime }) : null,
    [asteroid, blockTime, entity, isLotLease]
  );
  const isExpiredLeaseRenewal = useMemo(() => (
    isLotLease &&
    currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID &&
    !!auctionStatus?.expiredAgreement &&
    isLeaseHolderOrBuildingController({
      accountCrewIds,
      lot: entity,
      previousAgreement: auctionStatus.expiredAgreement
    })
  ), [accountCrewIds, auctionStatus?.expiredAgreement, currentPolicy?.policyType, entity, isLotLease]);
  const isAuctionPurchase = useMemo(() => (
    isLotLease &&
    currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID &&
    !!auctionStatus?.expiredAgreement &&
    !isExpiredLeaseRenewal
  ), [auctionStatus?.expiredAgreement, currentPolicy?.policyType, isExpiredLeaseRenewal, isLotLease]);
  const isLeaseExtension = isExtension || isExpiredLeaseRenewal;
  const paymentAgreement = isExpiredLeaseRenewal ? auctionStatus?.expiredAgreement : currentAgreementRaw;
  const auctionDetails = useMemo(() => {
    if (!isAuctionPurchase) return null;

    const gracePeriod = Number(auctionStatus?.settings?.gracePeriod || 0);
    const auctionElapsed = Number(auctionStatus?.auctionElapsed || 0);
    const descendingElapsed = Math.max(0, auctionElapsed - gracePeriod);
    const isAuctionComplete = descendingElapsed >= Permission.AUCTION_DESCENDING_PERIOD;
    const descendingRemaining = Math.max(0, Permission.AUCTION_DESCENDING_PERIOD - descendingElapsed);

    return {
      isGracePeriod: auctionElapsed < gracePeriod,
      isAuctionComplete,
      graceRemaining: Math.max(0, gracePeriod - auctionElapsed),
      descendingElapsed,
      descendingRemaining,
    };
  }, [auctionStatus?.auctionElapsed, auctionStatus?.settings?.gracePeriod, isAuctionPurchase]);

  const maxTerm = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (isLeaseExtension && paymentAgreement?.endTime > now) {
      return 365 - secondsToDays(Math.max(0, paymentAgreement?.endTime - paymentAgreement?.startTime));
    }
    return 365;
  }, [isLeaseExtension, paymentAgreement]);

  const maxTermFloored = useMemo(() => Math.floor(maxTerm * 10) / 10, [maxTerm]);

  const minTerm = useMemo(() => {
    return (isLeaseExtension) ? 1 : currentPolicy?.policyDetails?.initialTerm || 0
  }, [currentPolicy, isLeaseExtension]);

  const [initialPeriod, setInitialPeriod] = useState(
    (pendingChange?.vars?.term || pendingChange?.vars?.added_term)
      ? secondsToDays(pendingChange.vars.term || pendingChange.vars.added_term)
      : (isLeaseExtension ? Math.min(maxTermFloored, 30) : (currentPolicy?.policyDetails?.initialTerm || 0))
  );

  const remainingPeriod = useMemo(() => currentAgreement?.endTime - blockTime, [blockTime, currentAgreement?.endTime]);
  const refundablePeriod = useMemo(() => Math.max(0, remainingPeriod - monthsToSeconds(currentAgreement?.noticePeriod)), [currentAgreement?.noticePeriod, remainingPeriod]);
  const refundableAmount = useMemo(() => refundablePeriod * (currentAgreement?.rate_swayPerSec || 0), [currentAgreement?.rate_swayPerSec, refundablePeriod]);
  const auctionPayment = useMemo(() => {
    if (!isAuctionPurchase || !auctionStatus?.isAuctionAvailable) return null;
    const split = Permission.getAuctionPaymentSplit({
      auctionAmount: auctionStatus.auctionPrice,
      auctionLeaseLapseAmount: auctionStatus.auctionLeaseLapseAmount,
      hasBuildingController: !!entity?.building?.Control?.controller?.id
    });
    return {
      ...split,
      buildingControllerRecipient: buildingController?.Crew?.delegatedTo,
      controllerRecipient: controller?.Crew?.delegatedTo,
      previousTenant: getEntityCrew(auctionStatus.expiredAgreement?.permitted?.id),
    };
  }, [auctionStatus, buildingController?.Crew?.delegatedTo, controller?.Crew?.delegatedTo, entity?.building?.Control?.controller?.id, isAuctionPurchase]);

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
          label: `${isLeaseExtension ? 'Added ' : ''}Lease Length`,
          value: `${initialPeriod} day${initialPeriod === 1 ? '' : 's'}`,
        },
        {
          label: 'Notice Period',
          value: isLeaseExtension
            ? `${formatFixed(secondsToDays(paymentAgreement?.noticePeriod || 0), 1)} day${secondsToDays(paymentAgreement?.noticePeriod || 0) === 1 ? '' : 's'}`
            : `${formatFixed(currentPolicy?.policyDetails?.noticePeriod || 0, 1)} day${currentPolicy?.policyDetails?.noticePeriod === 1 ? '' : 's'}`,
        },
        ...(isAuctionPurchase ? [{
          label: auctionDetails?.isGracePeriod ? 'Grace Period Remaining' : 'Auction Elapsed',
          value: auctionDetails?.isGracePeriod
            ? formatTimer(auctionDetails.graceRemaining, 2)
            : formatTimer(auctionDetails?.descendingElapsed || 0, 2),
          isTimeStat: true,
        }, {
          label: 'Auction Remaining',
          value: auctionDetails?.isAuctionComplete ? '-' : formatTimer(auctionDetails?.descendingRemaining || 0, 2),
          isTimeStat: true,
        }, {
          label: 'Auction Payment',
          value: `${formatFixed(toSway(auctionStatus.auctionPrice), 2)} SWAY`,
        }, {
          label: 'Asteroid Arrears',
          value: `${formatFixed(toSway(auctionPayment?.toController || 0n), 2)} SWAY`,
        }, {
          label: 'Building Premium',
          value: `${formatFixed(toSway(auctionPayment?.toBuildingController || 0n), 2)} SWAY`,
        }] : []),
      ];
    }
    return [];
  }, [auctionDetails, auctionPayment, auctionStatus, crew, currentPolicy, initialPeriod, isAuctionPurchase, isLeaseExtension, isTermination, paymentAgreement, remainingPeriod]);

  const term = useMemo(() => Math.round(daysToSeconds(initialPeriod || 0)), [initialPeriod]);
  const termPrice = useMemo(() => {
    const rate = isLeaseExtension
      ? paymentAgreement?.rate
      : Math.floor((currentPolicy?.policyDetails?.rate || 0) * TOKEN_SCALE[TOKEN.SWAY]);
    return getLotLeasePayment({
      agreement: paymentAgreement,
      isExtension: isLeaseExtension,
      now: blockTime,
      rate,
      term
    });
  }, [blockTime, currentPolicy?.policyDetails?.rate, isLeaseExtension, paymentAgreement, term]);
  const displayedRatePerDay = useMemo(() => (
    isLeaseExtension && paymentAgreement?.rate !== undefined
      ? toSway(paymentAgreement.rate) * 24
      : (currentPolicy?.policyDetails?.rate || 0) * 24
  ), [currentPolicy?.policyDetails?.rate, isLeaseExtension, paymentAgreement?.rate]);
  const auctionCost = useMemo(() => (
    auctionPayment
      ? safeBigInt(auctionPayment.toController) + safeBigInt(auctionPayment.toBuildingController)
      : 0n
  ), [auctionPayment]);
  const auctionRecipientsLoading = isAuctionPurchase && auctionStatus?.isAuctionAvailable && (
    controllerIsLoading ||
    !controller?.Crew?.delegatedTo ||
    (
      auctionPayment?.toBuildingController > 0n &&
      (buildingControllerIsLoading || !buildingController?.Crew?.delegatedTo)
    )
  );
  const totalLeaseCost = useMemo(() => toSway(termPrice + auctionCost), [auctionCost, termPrice]);

  const insufficientAssets = useMemo(
    () => (isTermination ? safeBigInt(Math.ceil(refundableAmount)) : (termPrice + auctionCost)) > swayBalance,
    [swayBalance, refundableAmount, termPrice, auctionCost, isTermination]
  );

  const [eligible, setEligible] = useState(false);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const updateContractEligibility = useCallback(async () => {
    if (!provider) return;
    if (!currentPolicy?.policyDetails?.contract) return;
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

  const handleCopyAddress = useCallback(async () => {
    const copied = await copyTextToClipboard(currentPolicy?.policyDetails?.contract);
    createAlert({
      type: 'ClipboardAlert',
      data: { content: copied ? 'Contract address copied to clipboard.' : 'Unable to copy contract address.' },
      duration: 2000
    });
  }, [createAlert, currentPolicy?.policyDetails?.contract]);

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
  }, [maxTerm, minTerm]);

  const onEnterAgreement = useCallback(() => {
    const recipient = controller?.Crew?.delegatedTo;
    enterAgreement({ auctionPayment, recipient, term, termPrice });
  }, [auctionPayment, controller?.Crew?.delegatedTo, enterAgreement, term, termPrice]);

  const onExtendAgreement = useCallback(() => {
    const recipient = controller?.Crew?.delegatedTo;
    extendAgreement({ recipient, term, termPrice });
  }, [controller?.Crew?.delegatedTo, extendAgreement, term, termPrice]);

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
    if (isExpiredLeaseRenewal) {
      return {
        icon: <ExtendAgreementIcon />,
        label: 'Restore Expired Lot Lease',
        status: stage === actionStages.NOT_STARTED ? 'Prepaid Lease' : undefined,
        goLabel: 'Restore Lease',
        onGo: onExtendAgreement
      };
    }
    return {
      icon: entity.label === Entity.IDS.LOT ? <FormLotAgreementIcon /> : <FormAgreementIcon />,
      label: isAuctionPurchase ? 'Lease Auctioned Lot' : `Form ${entity.label === Entity.IDS.LOT ? 'Lot' : 'Asset'} Agreement`,
      status: stage === actionStages.NOT_STARTED
        ? (policyType === Permission.POLICY_IDS.PREPAID ? 'Prepaid Lease' : 'Custom Contract')
        : undefined,
      goLabel: isAuctionPurchase ? 'Lease Lot' : 'Create Agreement',
      onGo: onEnterAgreement
    }
  }, [currentAgreement?.noticePeriod, currentPolicy?.policyType, entity, isAuctionPurchase, isExpiredLeaseRenewal, isExtension, isTermination, onEnterAgreement, onExtendAgreement, onTerminateAgreement, stage]);

  const disableGo = useMemo(() => {
    if (insufficientAssets) return true;
    if (isAuctionPurchase && !auctionStatus?.isAuctionAvailable) return true;
    if (auctionRecipientsLoading) return true;
    if (isTermination && currentAgreement?._canGiveNoticeStart > blockTime) return true;
    if (initialPeriod === '' || initialPeriod <= 0) return true;
    return false;
  }, [auctionRecipientsLoading, auctionStatus?.isAuctionAvailable, blockTime, initialPeriod, insufficientAssets, isAuctionPurchase, isTermination, currentAgreement]);
  const leasePeriodInvalid = !isTermination && (isLeaseExtension || currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID) && (initialPeriod === '' || initialPeriod <= 0);
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

          {!isTermination && (isLeaseExtension || currentPolicy?.policyType === Permission.POLICY_IDS.PREPAID) && (
            <FlexSectionBlock
              title={`${isLeaseExtension ? (isExpiredLeaseRenewal ? 'Restore' : 'Extend') : 'Lease'} For`}
              bodyStyle={{ height: 'auto', padding: '6px 12px' }}>

              <FormSection>
                <InputLabel $invalid={leasePeriodInvalid}>
                  <label>{isLeaseExtension ? 'Added' : 'Leasing'} Period</label>
                </InputLabel>
                <TextInputWrapper rightLabel="days">
                  <LeasePeriodTextInput
                    disabled={stage !== actionStages.NOT_STARTED}
                    $invalid={leasePeriodInvalid}
                    min={minTerm}
                    max={maxTermFloored}
                    onBlur={handlePeriodBlur}
                    onChange={handlePeriodChange}
                    step={1}
                    type="number"
                    value={initialPeriod} />
                </TextInputWrapper>
                <InputSublabels>
                  {isLeaseExtension
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
                    value={formatFixed(displayedRatePerDay)} />
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

              <Button onClick={handleCopyAddress}>
                <LinkIcon /> <span>Copy Contract Address</span>
              </Button>
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
                            : (
                              <>
                                {isExpiredLeaseRenewal
                                  ? <>Restored For: <b>{' '}{initialPeriod} days</b></>
                                  : <>Granted For: <b>{' '}{initialPeriod} days</b></>
                                }
                              </>
                            )
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
          splitAt={isAuctionPurchase ? 2 : undefined}
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
