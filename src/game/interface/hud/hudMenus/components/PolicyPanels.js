import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Address, Building, Entity, Permission } from '@influenceth/sdk';

import { InputBlock } from '~/components/filters/components';
import AddressLink from '~/components/AddressLink';
import Autocomplete from '~/components/Autocomplete';
import Button from '~/components/ButtonAlt';
import CollapsibleBlock from '~/components/CollapsibleBlock';
import EntityLink from '~/components/EntityLink';
import EntityName from '~/components/EntityName';
import IconButton from '~/components/IconButton';
import { CloseIcon, AgreementIcon, LotControlIcon, PermissionIcon, RadioCheckedIcon, RadioUncheckedIcon, SwayIcon, WarningIcon, CheckedIcon, UncheckedIcon } from '~/components/Icons';
import LiveTimer from '~/components/LiveTimer';
import UncontrolledTextArea from '~/components/TextAreaUncontrolled';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import usePolicyManager from '~/hooks/actionManagers/usePolicyManager';
import useCrewContext from '~/hooks/useCrewContext';
import useHydratedCrew from '~/hooks/useHydratedCrew';
import useLot from '~/hooks/useLot';
import useSession from '~/hooks/useSession';
import formatters from '~/lib/formatters';
import { formatFixed, isProcessingPermission, nativeBool, reactBool } from '~/lib/utils';
import theme from '~/theme';
import actionButtons from '../../actionButtons';
import useBlockTime from '~/hooks/useBlockTime';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { getAsteroidAuctionSettings } from '~/lib/leaseUtils';

const borderColor = `rgba(255, 255, 255, 0.15)`;
const maxPolicyDurationDays = Permission.MAX_POLICY_DURATION / 86400;
const normalizePolicyDetails = (policyType, details = {}) => {
  if (Number(policyType) === Permission.POLICY_IDS.PREPAID) {
    return {
      rate: Number(details.rate || 0),
      initialTerm: Number(details.initialTerm || 0),
      noticePeriod: Number(details.noticePeriod || 0),
    };
  }
  if (Number(policyType) === Permission.POLICY_IDS.CONTRACT) {
    return {
      contract: Address.toStandard(details.contract || details.address || ''),
    };
  }
  return {};
};
const policyDetailsAreEqual = (policyType, a, b) => {
  const normalizedA = normalizePolicyDetails(policyType, a);
  const normalizedB = normalizePolicyDetails(policyType, b);
  const keys = Array.from(new Set([
    ...Object.keys(normalizedA),
    ...Object.keys(normalizedB),
  ]));
  return keys.every((key) => normalizedA[key] === normalizedB[key]);
};
const DataBlock = styled.div``;
const Desc = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 14px;
  height: 38px;
  text-align: center;
`;

const EditBlock = styled.div`
  border-top: 1px solid ${borderColor};
  padding: 10px 0;
`;

const DataRow = styled.div`
  align-items: center;
  color: ${theme.colors.secondaryText};
  display: flex;
  font-size: 90%;
  justify-content: space-between;
  line-height: 1.7em;
  & > span {
    color: white;
  }
`;

const Section = styled.div`
  border-top: 1px solid ${borderColor};
  padding: 10px 0;
`;

const PolicySelector = styled.div`
  & > label {
    font-size: 13px;
    color: white;
    opacity: 0.5;
    margin: 0;
    display: block;
    padding: 2px 0 4px;
  }
  & > div {
    display: flex;
    flex-direction: row;
    padding: 2px 0 0;
  }
`;

const Policy = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  flex-direction: row;
  margin-top: 4px;
  font-size: 14px;
  & > svg {
    font-size: 130%;
    margin-right: 4px;
  }
  ${p => p.isSelected
    ? `
      & > svg:not(:first-child) {
        display: none;
      }
    `
    : `
      opacity: 0.5;
      & > svg { opacity: 0.3; }
      & > svg:first-child {
        display: none;
      }

      ${p.disabled
        ? `
          &:hover {
            color: ${p.theme.colors.error};
            opacity: 0.8;
          }
        `
        : `
          cursor: ${p.theme.cursors.active};
          &:hover {
            opacity: 0.8;
          }
        `}
    `
  }
`;

const PrepaidInputBlock = styled(InputBlock)`
  & label {
    color: ${p => p.$invalid ? p.theme.colors.error : 'white'};
  }
  & > div {
    display: flex;
    flex-direction: row;
    width: 100%;
    & > input {
      ${p => p.$invalid ? `border-color: ${p.theme.colors.error};` : ''}
      width: 110px;
    }
    & > span {
      font-size: 90%;
    }
  }
`;
const PrepaidHelpText = styled.div`
  color: ${p => p.$invalid ? p.theme.colors.error : theme.colors.secondaryText};
  font-size: 12px;
  line-height: 1.4;
  margin-top: 6px;
`;

const Toggle = styled.div``;
const PayAsYouGoLabel = styled.div`
  margin-top: 4px;
  align-items: flex-end;
  display: flex;
  ${Toggle} {
    align-items: center;
    color: #CCC;
    cursor: ${p => p.theme.cursors.active};
    display: flex;
    opacity: 0.7;
    & > svg {
      font-size: 130%;
      color: ${p => p.on ? p.theme.colors.main : 'white'};
    }
    & > span {
      margin-left: 4px;
    }
    &:hover {
      opacity: 1;
    }
  }
`;

const Allowlist = styled.div`
  margin-top: 6px;
  max-height: 250px;
  overflow: hidden auto;
`;

const AllowCrew = styled.div`
  align-items: center;
  color: white;
  display: flex;
  font-size: 95%;
  padding: 0 0 0 6px;
  & > label {
    flex: 1;
  }
  & > span { font-size: 90%; opacity: 0.6; }
  & > button { font-size: 14px; margin: 0 0 0 4px; }
`;

const PermSummary = styled.div`
  align-items: center;
  color: ${p => p.success ? p.theme.colors.success : p.theme.colors.main};
  display: flex;
  font-size: 15px;
  padding-bottom: 15px;
  & > svg {
    flex: 0 0 24px;
    font-size: 24px;
    margin-right: 8px;
  }
  & a {
    color: inherit;
  }
`;

const PermSummaryWarning = styled(PermSummary)`
  color: ${p => p.theme.colors.error};
`;

const getPolicyColor = (policyType) => {
  switch (Number(policyType)) {
    case Permission.POLICY_IDS.PRIVATE: return theme.colors.lightRed;
    case Permission.POLICY_IDS.PUBLIC: return theme.colors.green;
    case Permission.POLICY_IDS.PREPAID: return theme.colors.success;
    case Permission.POLICY_IDS.CONTRACT: return theme.colors.lightPurple;
    default: return '#666666';
  }
}

const getStatusColor = (status) => {
  switch (status) {
    case 'controller':
    case 'granted': return theme.colors.success;
    case 'available': return theme.colors.brightMain;
    case 'restricted': return theme.colors.red;
    case 'under notice': return theme.colors.orange;
    case 'unleasable': return theme.colors.secondaryText;
    case 'under contract': return theme.colors.main;
    default: return '#666666';
  }
}

const PolicyPanel = ({ editable = false, entity, permission }) => {
  const { accountAddress } = useSession();
  const { crew } = useCrewContext();
  const simulationEnabled = useSimulationEnabled();
  const {
    currentPolicy,
    updateAllowlists,
    updateAuctionSettings,
    updatePolicy,
    updatePolicyAndAuctionSettings,
    allowlistChangePending,
    auctionSettingsChangePending,
    policyChangePending
  } = usePolicyManager(entity, permission);
  const {
    policyType: originalPolicyType,
    policyDetails: originalPolicyDetails,
    allowlist: originalAllowlist,
    accountAllowlist: originalAccountAllowlist,
    agreements = [],  // TODO: ...?
  } = currentPolicy || {};

  const [policyType, setPolicyType] = useState(Number(originalPolicyType));
  const [details, setDetails] = useState(originalPolicyDetails);
  const [accountAllowlist, setAccountAllowlist] = useState(originalAccountAllowlist || []);
  const originalAuctionSettings = useMemo(
    () => getAsteroidAuctionSettings(entity),
    [entity?.PrepaidAgreementAuctionSet]
  );
  const [auctionDetails, setAuctionDetails] = useState({
    mode: originalAuctionSettings.mode,
    gracePeriod: originalAuctionSettings.gracePeriod / 86400,
  });
  const [allowlist, setAllowlist] = useState(originalAllowlist || []);
  const showAuctionSettings = entity?.label === Entity.IDS.ASTEROID && permission === Permission.IDS.USE_LOT;

  /**
   * Editing
   */
  const [allowlistDirty, setAllowlistDirty] = useState(false);
  const [editing, setEditing] = useState();

  const saving = editing === 'allowlist' ? allowlistChangePending : (policyChangePending || auctionSettingsChangePending);

  // reset if object is changed
  useEffect(() => {
    setPolicyType(Number(originalPolicyType));
    setDetails(originalPolicyDetails);
    setAuctionDetails({
      mode: originalAuctionSettings.mode,
      gracePeriod: originalAuctionSettings.gracePeriod / 86400,
    });
  }, [editing, originalPolicyType, originalPolicyDetails, originalAuctionSettings]);

  useEffect(() => {
    setAllowlist(originalAllowlist || []);
    setAccountAllowlist(originalAccountAllowlist || []);
    setAllowlistDirty(false);
  }, [editing, originalAllowlist, originalAccountAllowlist]);

  const handleChange = useCallback((key) => (e) => {
    let newVal = e.currentTarget.value;
    if (key === 'rate') newVal /= 24;
    setDetails((v) => ({ ...v, [key]: newVal }));
  }, []);
  const handleAuctionChange = useCallback((key) => (e) => {
    let newVal = e.currentTarget.value;
    if (key === 'mode') newVal = Number(newVal);
    setAuctionDetails((v) => ({ ...v, [key]: newVal }));
  }, []);

  const isDirty = useMemo(() => {
    const auctionDirty = showAuctionSettings && (
      Number(auctionDetails.mode) !== Number(originalAuctionSettings.mode) ||
      Number(auctionDetails.gracePeriod || 0) !== Number(originalAuctionSettings.gracePeriod / 86400)
    );
    return Number(policyType) !== Number(originalPolicyType)
      || !policyDetailsAreEqual(policyType, details, originalPolicyDetails)
      || allowlistDirty
      || auctionDirty;
  }, [allowlistDirty, auctionDetails, details, originalAuctionSettings, originalPolicyDetails, originalPolicyType, policyType, showAuctionSettings]);

  const isIncomplete = useMemo(() => {
    if (showAuctionSettings && auctionDetails.gracePeriod < 0) return true;
    if (policyType === Permission.POLICY_IDS.PREPAID) {
      if (!(details.rate > 0 || (permission === Permission.IDS.USE_LOT && Number(details.rate) === 0))) return true;
      if (details.initialTerm <= 0 || details.noticePeriod < 0) return true;
      return parseFloat(details.initialTerm) + parseFloat(details.noticePeriod) > maxPolicyDurationDays;
    }
    if (policyType === Permission.POLICY_IDS.CONTRACT) {
      return !/^0x[0-9a-f]{60,}/i.test(details.contract); // looks loosely like an address
    }
    return false;
  }, [auctionDetails.gracePeriod, permission, policyType, details, showAuctionSettings]);

  const allowlistAdd = useCallback((crew) => {
    if (!crew) return;
    if (typeof crew === 'object') {
      setAllowlist((a) => [...a, crew].sort((a, b) => formatters.crewName(a).localeCompare(formatters.crewName(b))));
    }
    if (typeof crew === 'string') {
      if (!Address.toStandard(crew)) return;
      setAccountAllowlist((a) => Array.from(new Set([...a, crew])).sort());
    }
    setAllowlistDirty(true);
  }, []);

  const allowlistRemove = useCallback((crew) => {
    if (typeof crew === 'object') {
      setAllowlist((a) => a.filter((c) => c.id !== crew.id));
    } else {
      setAccountAllowlist((a) => a.filter((c) => c !== crew));
    }
    setAllowlistDirty(true);
  }, []);

  const allowlistExclude = useCallback((c) => {
    return allowlist.find((a) => a.id === c.id || crew?.id === c.id);
  }, [allowlist])

  const cancelEdits = useCallback(() => {
    setEditing();
  }, []);

  const saveEdits = useCallback(() => {
    if (editing === 'allowlist') {
      updateAllowlists(allowlist, accountAllowlist);
    } else {
      const policyDirty = Number(policyType) !== Number(originalPolicyType)
        || !policyDetailsAreEqual(policyType, details, originalPolicyDetails);
      const auctionDirty = showAuctionSettings && (
        Number(auctionDetails.mode) !== Number(originalAuctionSettings.mode) ||
        Number(auctionDetails.gracePeriod || 0) !== Number(originalAuctionSettings.gracePeriod / 86400)
      );

      if (policyDirty && auctionDirty) {
        updatePolicyAndAuctionSettings(policyType, details, auctionDetails);
        return;
      }
      if (policyDirty) updatePolicy(policyType, details);
      if (showAuctionSettings) {
        if (auctionDirty) updateAuctionSettings(auctionDetails);
      }
    }
  }, [
    accountAllowlist,
    allowlist,
    auctionDetails,
    details,
    editing,
    originalAuctionSettings,
    originalPolicyDetails,
    originalPolicyType,
    policyType,
    showAuctionSettings,
    updateAllowlists,
    updateAuctionSettings,
    updatePolicy,
    updatePolicyAndAuctionSettings,
  ]);

  const toggleEditing = useCallback((which) => {
    setEditing(which);
  }, []);

  /**
   * Viewing
   */

  const onAllowlist = useMemo(
    () => (
      currentPolicy?.allowlist?.find((c) => c.id === crew?.id)
      || currentPolicy?.accountAllowlist?.find((c) => Address.areEqual(accountAddress, c))
    ),
    [accountAddress, crew, currentPolicy]
  );

  const jitStatus = useMemo(() => {
    // if exclusive, everyone cares if under notice
    if (Permission.TYPES[permission].isExclusive) {
      if (currentPolicy?.agreements?.[0]?.noticeTime > 0) return 'under notice';
      if (currentPolicy?.crewStatus === 'available' && permission === Permission.IDS.USE_LOT) {
        if (entity?.Control?.controller?.id) {
          if ((entity.building || entity?.surfaceShip)?.Control?.controller?.id === entity.Control.controller.id) return 'unleasable';
        }
      }

    // else, only the crew cares
    } else if (currentPolicy?.crewStatus === 'granted') {
      const noticeGiven = (currentPolicy?.agreements || []).find((a) => (
        ((crew?.Crew.delegatedTo && a.permitted === crew?.Crew.delegatedTo) || (a.permitted?.id === crew?.id))
        && a.noticeTime > 0
      ));
      if (noticeGiven) return 'under notice';
    }

    return null;
  }, [currentPolicy?.crewStatus, entity]);

  const config = useMemo(() => {
    if (editing === 'allowlist') {
      return {
        name: 'Allowlist',
        color: `${theme.colors.brightMain}`,
        description: `The permission is granted to individually listed crews or all crews of any listed wallets.`,
      };
    }
    const crewStatus = jitStatus || currentPolicy?.crewStatus;
    return {
      ...Permission.POLICY_TYPES[policyType],
      crewStatus,
      color: editable ? getPolicyColor(policyType) : getStatusColor(crewStatus),
    };
  }, [currentPolicy, editable, editing, jitStatus, policyType]);

  const [isPayAsYouGo, setIsPayAsYouGo] = useState(isProcessingPermission(permission) && (
    originalPolicyType !== Permission.POLICY_IDS.PREPAID || (
      originalPolicyDetails?.initialTerm === 0 && originalPolicyDetails?.noticePeriod === 0
    )
  ));
  const toggleIsPayAsYouGo = useCallback(() => {
    setIsPayAsYouGo((v) => {
      const newVal = !v;
      if (newVal) {
        setDetails((v) => ({ ...v, initialTerm: 0, noticePeriod: 0 }));
      }
      return newVal;
    });
  }, []);
  const prepaidInitialTermInvalid = Number(details.initialTerm || 0) <= 0;
  const prepaidPeriodInvalid = Number(details.initialTerm || 0) + Number(details.noticePeriod || 0) > maxPolicyDurationDays;

  return (
    <CollapsibleBlock
      collapsibleProps={{
        style: {
          padding: '0 5px'
        }
      }}
      onClose={editing ? () => { toggleEditing() } : null}
      outerStyle={{ marginBottom: 8 }}
      title={permission === Permission.IDS.USE_LOT ? <><LotControlIcon /> Lot Control</> : <><PermissionIcon /> {Permission.TYPES[permission]?.name}</>}
      titleAction={() => (
        <span style={{ color: config.color }}>
          {editable
            ? (config.nameShort || config.name)
            : (permission === Permission.IDS.USE_LOT && entity?.label === Entity.IDS.ASTEROID && entity?.Control?.controller?.id === crew?.id
                ? 'Administrator'
                : config.crewStatus
            )
          }
        </span>
      )}>
      {editing && (
        <>
          <Section>
            <Desc style={{ color: config.color }}>{config.description}</Desc>
          </Section>

          {editing === 'allowlist' && (
            <Section>
              <Autocomplete
                allowCustomInput
                assetType="crews"
                disabled={nativeBool(saving)}
                excludeFunc={allowlistExclude}
                onSelect={allowlistAdd}
                placeholder="Search Crew or Paste Wallet Address"
                width={300}
              />
              <Allowlist>
                {(accountAllowlist || []).map((a) => (
                  <AllowCrew key={a}>
                    <label><AddressLink address={a} doNotReplaceYou truncate /></label>
                    <span>Wallet</span>
                    <IconButton
                      borderless
                      disabled={nativeBool(saving)}
                      onClick={() => allowlistRemove(a)}>
                      <CloseIcon />
                    </IconButton>
                  </AllowCrew>
                ))}
                {(allowlist || []).map((a) => (
                  <AllowCrew key={a.id}>
                    <label>{a?.Crew ? formatters.crewName(a) : <EntityName {...a} />}</label>
                    <span>Crew #{a.id.toLocaleString()}</span>
                    <IconButton
                      borderless
                      disabled={nativeBool(saving)}
                      onClick={() => allowlistRemove(a)}>
                      <CloseIcon />
                    </IconButton>
                  </AllowCrew>
                ))}
              </Allowlist>
            </Section>
          )}

          {editing === 'policy' && (
            <>
              <Section>
                <PolicySelector>
                  <label>Policy Type</label>
                  <Policy
                    onClick={saving ? null : () => setPolicyType(Permission.POLICY_IDS.PRIVATE)}
                    isSelected={policyType === Permission.POLICY_IDS.PRIVATE}>
                    <RadioCheckedIcon /><RadioUncheckedIcon /> {Permission.POLICY_TYPES[Permission.POLICY_IDS.PRIVATE].name}
                  </Policy>
                  <Policy
                    onClick={saving ? null : () => setPolicyType(Permission.POLICY_IDS.PREPAID)}
                    isSelected={policyType === Permission.POLICY_IDS.PREPAID}>
                    <RadioCheckedIcon /><RadioUncheckedIcon /> {Permission.POLICY_TYPES[Permission.POLICY_IDS.PREPAID].name}
                  </Policy>
                  <Policy
                    onClick={(saving || entity?.label === Entity.IDS.ASTEROID) ? null : () => setPolicyType(Permission.POLICY_IDS.PUBLIC)}
                    disabled={nativeBool(entity?.label === Entity.IDS.ASTEROID)}
                    isSelected={policyType === Permission.POLICY_IDS.PUBLIC}>
                    <RadioCheckedIcon /><RadioUncheckedIcon /> {Permission.POLICY_TYPES[Permission.POLICY_IDS.PUBLIC].name}
                  </Policy>
                  <Policy
                    onClick={saving ? null : () => setPolicyType(Permission.POLICY_IDS.CONTRACT)}
                    isSelected={policyType === Permission.POLICY_IDS.CONTRACT}>
                    <RadioCheckedIcon /><RadioUncheckedIcon /> {Permission.POLICY_TYPES[Permission.POLICY_IDS.CONTRACT].name}
                  </Policy>
                </PolicySelector>
              </Section>
              {policyType === Permission.POLICY_IDS.PREPAID && (
                <Section>
                  <PrepaidInputBlock>
                    <label>Price</label>
                    <PayAsYouGoLabel on={reactBool(isPayAsYouGo)}>
                      {isProcessingPermission(permission) && (
                        <Toggle onClick={toggleIsPayAsYouGo}>
                          {isPayAsYouGo ? <CheckedIcon /> : <UncheckedIcon />}
                          <span>Pay as You Go</span>
                        </Toggle>
                      )}
                    </PayAsYouGoLabel>
                    <div>
                      <UncontrolledTextInput
                        disabled={nativeBool(saving)}
                        min={0}
                        onChange={handleChange('rate')}
                        step={1}
                        type="number"
                        value={`${details.rate * 24}`} />
                      <span>SWAY / day</span>
                    </div>
                  </PrepaidInputBlock>
                  
                  {!isPayAsYouGo && (
                    <>
                      <PrepaidInputBlock $invalid={prepaidInitialTermInvalid}>
                        <label>Minimum Period</label>
                        <div>
                          <UncontrolledTextInput
                            disabled={nativeBool(saving)}
                            min={0}
                            onChange={handleChange('initialTerm')}
                            step={1}
                            type="number"
                            value={`${details.initialTerm}`} />
                          <span>days</span>
                        </div>
                      </PrepaidInputBlock>
                      <PrepaidInputBlock>
                        <label>Notice Period</label>
                        <div>
                          <UncontrolledTextInput
                            disabled={nativeBool(saving)}
                            min={0}
                            onChange={handleChange('noticePeriod')}
                            step={1}
                            type="number"
                            value={`${details.noticePeriod}`} />
                          <span>days</span>
                        </div>
                      </PrepaidInputBlock>
                      <PrepaidHelpText $invalid={prepaidPeriodInvalid}>
                        Maximum total period (minimum + notice period) must be {maxPolicyDurationDays} days or less.
                      </PrepaidHelpText>
                    </>
                  )}
                </Section>
              )}
              {policyType === Permission.POLICY_IDS.CONTRACT && (
                <Section>
                  <InputBlock>
                    <label>Contract Address</label>
                    <div>
                      <UncontrolledTextArea
                        disabled={nativeBool(saving)}
                        onChange={handleChange('contract')}
                        placeholder="Copy & Paste the Custom Contract Address"
                        style={{ height: 80 }}
                        value={details.contract || ''} />
                    </div>
                  </InputBlock>
                </Section>
              )}
              {showAuctionSettings && (
                <Section>
                  <PolicySelector>
                    <label>Expired Building-Lot Auctions</label>
                    <Policy
                      onClick={saving ? null : () => setAuctionDetails((v) => ({ ...v, mode: Permission.AUCTION_MODES.MANUAL }))}
                      isSelected={Number(auctionDetails.mode) === Permission.AUCTION_MODES.MANUAL}>
                      <RadioCheckedIcon /><RadioUncheckedIcon /> Manual
                    </Policy>
                    <Policy
                      onClick={saving ? null : () => setAuctionDetails((v) => ({ ...v, mode: Permission.AUCTION_MODES.AUTO }))}
                      isSelected={Number(auctionDetails.mode) === Permission.AUCTION_MODES.AUTO}>
                      <RadioCheckedIcon /><RadioUncheckedIcon /> Automatic
                    </Policy>
                  </PolicySelector>
                  <PrepaidInputBlock>
                    <label>Auction Grace Period</label>
                    <div>
                      <UncontrolledTextInput
                        disabled={nativeBool(saving)}
                        min={0}
                        onChange={handleAuctionChange('gracePeriod')}
                        step={1}
                        type="number"
                        value={`${auctionDetails.gracePeriod}`} />
                      <span>days</span>
                    </div>
                  </PrepaidInputBlock>
                </Section>
              )}
            </>
          )}
          <Section style={{ paddingBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                disabled={nativeBool(saving)}
                onClick={() => cancelEdits()}
                size="small">Cancel</Button>
              <Button
                disabled={nativeBool(!isDirty || isIncomplete || saving)}
                loading={saving}
                isTransaction
                onClick={() => saveEdits()}
                size="small"
                style={{ marginLeft: 6 }}>Update</Button>
            </div>
          </Section>
        </>
      )}
      {!editing && (
        <>
          <Section>
            <DataBlock>
              <DataRow><label>Policy Type</label><span>{config.name}</span></DataRow>
              {policyType === Permission.POLICY_IDS.PREPAID && (
                <>
                  <DataRow>
                    <label>Price per Day (IRL)</label>
                    {permission === Permission.IDS.USE_LOT && entity?.label === Entity.IDS.ASTEROID && entity?.id === 1
                      ? <span><SwayIcon /> Variable by Lot</span>
                      : <span><SwayIcon /> {formatFixed(originalPolicyDetails?.rate * 24 || 0)}</span>
                    }
                  </DataRow>
                  {isProcessingPermission(permission) && originalPolicyDetails?.initialTerm === 0 && originalPolicyDetails?.noticePeriod === 0
                    ? (
                      <DataRow><label>Pay As You Go</label><span>Enabled</span></DataRow>
                    )
                    : (
                      <>
                        <DataRow><label>Minimum Period</label><span>{formatFixed(originalPolicyDetails?.initialTerm, 3)} day (IRL)</span></DataRow>
                        <DataRow><label>Notice Period</label><span>{formatFixed(originalPolicyDetails?.noticePeriod, 3)} day (IRL)</span></DataRow>
                      </>
                    )}
                </>
              )}
              {showAuctionSettings && (
                <>
                  <DataRow>
                    <label>Expired Building Lots</label>
                    <span>{originalAuctionSettings.mode === Permission.AUCTION_MODES.AUTO ? 'Automatic Auction' : 'Manual Auction'}</span>
                  </DataRow>
                  <DataRow>
                    <label>Auction Grace Period</label>
                    <span>{formatFixed(originalAuctionSettings.gracePeriod / 86400, 2)} day (IRL)</span>
                  </DataRow>
                </>
              )}
              {([Permission.POLICY_IDS.CONTRACT, Permission.POLICY_IDS.PREPAID].includes(policyType)) && (
                <div style={{ paddingTop: 15 }}>
                  {!(entity?.label === Entity.IDS.ASTEROID && permission === Permission.IDS.USE_LOT) && (
                    <>
                      <actionButtons.FormAgreement.Component
                        _disabled={
                          Permission.TYPES[permission].isExclusive &&
                          (jitStatus === 'unleasable' || agreements?.length > 0) &&
                          entity?.Control?.controller?.id !== crew?.id
                        }
                        entity={entity}
                        permission={permission} />

                      {/* TODO: enable list view at an asteroid level... will need to pull all agreements from
                      elasticsearch since entity will be asteroid (and *agreements won't be populated) */}
                      <actionButtons.ViewAgreements.Component
                        _disabled={!agreements?.length}
                        entity={entity}
                        permission={permission}
                        tally={agreements?.length || 0} />
                    </>
                  )}
                </div>
              )}
            </DataBlock>
          </Section>

          {editable && (
            <EditBlock>
              <Button
                disabled={reactBool(simulationEnabled)}
                size="small"
                onClick={() => toggleEditing('policy')}>Edit Permission Policy</Button>
            </EditBlock>
          )}

          {permission !== Permission.IDS.USE_LOT && (
            <>
              {editable && (
                <Section style={{ borderTop: 0, marginTop: 5 }}>
                  <DataBlock style={{ paddingBottom: 5 }}>
                    <DataRow>
                      <label>Allowlist</label>
                      <span>
                        {(allowlist?.length || 0).toLocaleString()} Crew{allowlist?.length === 1 ? '' : 's'}
                        {accountAllowlist?.length > 0 && (
                          <> | {(accountAllowlist?.length || 0).toLocaleString()} Wallet{accountAllowlist?.length === 1 ? '' : 's'}</>
                        )}
                      </span>
                    </DataRow>
                  </DataBlock>
                  <EditBlock>
                    <Button
                      disabled={reactBool(simulationEnabled)}
                      size="small" 
                      onClick={() => toggleEditing('allowlist')}>Edit Allowlist</Button>
                  </EditBlock>
                </Section>
              )}

              {!editable && (
                <Section style={{ paddingBottom: 0 }}>
                  <DataBlock>
                    <DataRow>
                      <label>Allowlist</label>
                      <span style={{ color: onAllowlist ? theme.colors.success : theme.colors.secondaryText }}>{onAllowlist ? 'Allowed' : 'Not on List'}</span>
                    </DataRow>
                  </DataBlock>
                </Section>
              )}
            </>
          )}
        </>
      )}
    </CollapsibleBlock>
  )
};

const PolicyPanels = ({ editable, entity }) => {
  const blockTime = useBlockTime();
  const { accountAddress } = useSession();
  const { crew } = useCrewContext();
  const { data: lot } = useLot(entity?.label === Entity.IDS.BUILDING ? entity.Location.location.id : null);
  const { isAtRisk } = useConstructionManager(lot?.id);
  const { data: entityController } = useHydratedCrew(entity?.Control?.controller?.id);

  const permPolicies = useMemo(
    () => entity ? Permission.getPolicyDetails(entity, crew, blockTime) : {},
    [accountAddress, blockTime, crew, entity]
  );

  // show lot warning if building controller does not have lot permission
  const showLotWarning = useMemo(() => {
    if (!lot || !entityController) return false;
    const lotPerm = Permission.getPolicyDetails(lot, entityController, blockTime)[Permission.IDS.USE_LOT];
    return !(
      lotPerm?.crewStatus === 'controller' ||
      lotPerm?.crewStatus === 'granted' ||
      lotPerm?.crewStatus === 'under contract'
    );
  }, [blockTime, entity, entityController, lot]);

  const buildingOrSite = useMemo(() => lot?.building?.Building?.status < Building.CONSTRUCTION_STATUSES.OPERATIONAL ? 'Construction Site' : 'Building', [lot]);

  const showStagingWarning = useMemo(() => {
    if (isAtRisk) {
      return 2;
    } else if (lot && lot.building && lot.building.Building?.status < Building.CONSTRUCTION_STATUSES.UNDER_CONSTRUCTION) {
      return 1;
    }
    return 0;
  }, [lot]);

  // find out if any others have access to this asset via any perm
  const othersHaveAgreementsOnThisAsset = useMemo(() => {
    return !!Object.keys(permPolicies).find((permission) => {
      const { agreements, allowlist, accountAllowlist } = permPolicies[permission];
      if ((agreements || []).find((a) => a?.permitted?.id !== crew?.id)) return true;
      if ((allowlist || []).find((a) => a?.permitted?.id !== crew?.id)) return true;
      if ((accountAllowlist || []).find((a) => a?.permitted !== crew?.delegatedTo)) return true;
      return false;
    });
  }, [permPolicies]);

  return (
    <div>
      {showLotWarning && <PermSummaryWarning style={{ paddingBottom: 10 }}><WarningIcon /><span>Lot not controlled. {buildingOrSite} is vulnerable to <EntityLink {...(lot?.Control?.controller || {})} />.</span></PermSummaryWarning>}
      {showStagingWarning === 2 && <PermSummaryWarning><WarningIcon /><span>Staging Time expired. Construction Site is vulnerable to any crew.</span></PermSummaryWarning>}
      {showStagingWarning === 1 && <PermSummary><WarningIcon /><span><LiveTimer target={lot?.building?.Building?.plannedAt + Building.GRACE_PERIOD} maxPrecision={2} /> Staging Time Remaining</span></PermSummary>}

      {othersHaveAgreementsOnThisAsset && (
        <PermSummary>
          <AgreementIcon />
          Asset has active agreements with other crews.
        </PermSummary>
      )}

      {Object.keys(permPolicies).map((permission) => (
        <PolicyPanel
          key={permission}
          editable={reactBool(editable)}
          entity={entity}
          permission={Number(permission)} />
      ))}
    </div>
  );
};

export default PolicyPanels;
