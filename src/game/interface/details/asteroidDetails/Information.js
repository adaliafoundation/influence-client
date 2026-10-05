import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Entity, Name } from '@influenceth/sdk';

import AddressLink from '~/components/AddressLink';
import AsteroidGraphic from './components/AsteroidGraphic';
import Button from '~/components/ButtonAlt';
import DataReadout from '~/components/DataReadout';
import MarketplaceLink from '~/components/MarketplaceLink';
import StaticForm from '~/components/StaticForm';
import Text from '~/components/Text';
import TextInput from '~/components/TextInput';
import {
  CheckCircleIcon,
  EccentricityIcon,
  EditIcon,
  InclinationIcon,
  OrbitalPeriodIcon,
  RadiusIcon,
  SemiMajorAxisIcon,
  SurfaceAreaIcon
} from '~/components/Icons';
import { AsteroidSwayPrice } from '~/components/SwayPrice';
import PurchaseButtonInner from '~/components/PurchaseButtonInner';
import { renderDummyAsteroid } from '~/game/scene/asteroid/helpers/utils';
import useBuyAsteroid from '~/hooks/actionManagers/useBuyAsteroid';
import useChangeName from '~/hooks/actionManagers/useChangeName';
import useControlAsteroid from '~/hooks/actionManagers/useControlAsteroid';
import useFundingFlow from '~/hooks/useFundingFlow';
import useNameAvailability from '~/hooks/useNameAvailability';
import usePriceConstants from '~/hooks/usePriceConstants';
import useSession from '~/hooks/useSession';
import useWebWorker from '~/hooks/useWebWorker';
import constants from '~/lib/constants';
import exportGLTF from '~/lib/graphics/exportGLTF';
import formatters from '~/lib/formatters';
import { asteroidPrice, TOKEN, TOKEN_FORMAT, TOKEN_SCALE } from '~/lib/priceUtils';
import { fireTrackingEvent, nativeBool, reactBool } from '~/lib/utils';
import EntityActivityLog from '../EntityActivityLog';
import usePriceHelper from '~/hooks/usePriceHelper';

const paneStackBreakpoint = 720;

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  height: 100%;
  padding-right: 4px;
  & > div {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  @media (max-width: ${paneStackBreakpoint}px) {
    display: block;
    height: auto;
    & > div {
      height: auto;
    }
  }
`;
const LeftPane = styled.div`
  flex: 0 0 540px;
  overflow: hidden;
  padding-top: 30px;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    flex: 1;
  }
`;
const RightPane = styled.div`
  flex: 1;
  margin-left: 30px;
  padding-top: 40px;
  & > div:first-child {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    flex: 1;
  }

  @media (max-width: ${p => paneStackBreakpoint}px) {
    margin-left: 0;
    & > div:first-child {
      flex: 0;
    }
  }
`;

const SectionHeader = styled.div`
  border-bottom: 1px solid ${p => p.theme.colors.borderBottom};
  color: white;
  font-size: 125%;
  padding-bottom: 4px;
`;

const SectionBody = styled.div`
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow: hidden;
  position: relative;
  @media (max-width: ${paneStackBreakpoint}px) {
    overflow: visible;
  }
`;

const GraphicSection = styled.div`
  flex: 1;
  min-height: 150px;
  @media (max-width: ${paneStackBreakpoint}px) {
    min-height: unset;
  }
`;
const GraphicWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
`;

const Attributes = styled.div`
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: -12px;
  & > div {
    align-items: center;
    display: flex;
    border-bottom: 1px solid ${p => p.theme.colors.borderBottomAlt};
    margin-bottom: 12px;
    max-width: 48%;
    padding: 6px 0;
    width: 360px;
    & > svg {
      color: ${p => p.theme.colors.main};
      font-size: 150%;
      margin-right: 10px;
    }
    & > label {
      flex: 1;
      white-space: nowrap;
    }
    & > span {
      color: white;
      white-space: nowrap;
    }
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    background: transparent;
  }
  @media (min-width: 800px) and (max-width: 1140px) {
    & > div {
      & > label { display: none; }
      & > span { flex: 1; text-align: center; }
    }
  }
  @media (min-width: ${paneStackBreakpoint + 1}px) and (max-width: 799px) {
    & > div {
      max-width: none;
      width: 100%;
    }
  }
  @media (max-width: 520px) {
    & > div {
      max-width: none;
      width: 100%;
    }
  }
`;

const ModelButton = styled(Button)`
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const HighlightOwnership = styled.div`
  font-size: 115%;
  font-weight: bold;
  color: ${p => p.warning ? p.theme.colors.warning : p.theme.colors.main};
  margin-top: 0.25em;
  margin-bottom: 1.25em;
`;

const ButtonRow = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  & > button {
    flex: 1;
    max-width: 250px;
    white-space: nowrap;
    &:not(:first-child) {
      margin-left: 6px;
    }
  }
`;

// TODO: componentize this (shared w/ crewmatedetails)
const breakpoint = 1375;
const LogHeader = styled.ul``;
const Log = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  & ul {
    display: flex;
    flex-direction: column;
    list-style-type: none;
    margin: 0;
    padding: 5px 0;
  }
  & ${LogHeader} {
    @media (max-width: ${breakpoint}px) {
      display: none;
    }
  }

  & > div {
    border-top: 1px solid ${p => p.theme.colors.borderBottomAlt};
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    & ul {
      margin-right: -5px;
      padding-top: 16px;
      @media (max-width: ${breakpoint}px) {
        margin-right: 0;
      }
    }

    @media (max-width: ${breakpoint}px) {
      border-top: none;
      height: auto;
      max-height: calc(100vh - 200px);
    }
  }

  @media (max-width: ${breakpoint}px) {
    display: block;
    margin: 0 -10px;
  }
`;

const NameForm = styled.div`
  display: flex;
  & input {
    margin-right: 10px;
  }
`;

const SmHidden = styled.span`
  display: inline;
  @media (max-width: 1300px) {
    display: none;
  }
`;

const AsteroidInformation = ({ abundances, asteroid, isManager, isOwner }) => {
  const { accountAddress, authenticated } = useSession();
  const isNameValid = useNameAvailability({ label: Entity.IDS.ASTEROID });
  const { buyAsteroid, checkForLimit, buying } = useBuyAsteroid(Number(asteroid.id));
  const { controlAsteroid, takingControl } = useControlAsteroid(Number(asteroid.id));
  const { changeName, changingName } = useChangeName({ id: Number(asteroid.id), label: Entity.IDS.ASTEROID });
  const { data: priceConstants } = usePriceConstants();
  const priceHelper = usePriceHelper();
  const { fundingPrompt, onVerifyFunds } = useFundingFlow();
  const webWorkerPool = useWebWorker();

  const [exportingModel, setExportingModel] = useState(false);
  const [newName, setNewName] = useState('');
  const [openNameChangeForm, setOpenNameChangeForm] = useState(false);

  const viewingAs = useMemo(() => ({ id: Number(asteroid?.id), label: Entity.IDS.ASTEROID }), [asteroid?.id]);

  const download3dModel = useCallback(() => {
    if (exportingModel || !asteroid) return;
    setExportingModel(true);
    renderDummyAsteroid(asteroid, constants.MODEL_EXPORT_RESOLUTION, webWorkerPool, (asteroidModel, dispose) => {
      exportGLTF(asteroidModel, `asteroid_${asteroid.id}`, () => {
        try {
          dispose();
        } catch (e) { console.warn(e); }
        setExportingModel(false);
      });
    });
  }, [asteroid, exportingModel, webWorkerPool]);

  // on asteroid change, reset name input field on asteroid change
  useEffect(() => {
    setNewName('');
    setOpenNameChangeForm(false);
  }, [asteroid.Name?.name]);

  const attemptUpdateAsteroidName = useCallback(async () => {
    if (await isNameValid(newName, asteroid?.id)) {
      return changeName(newName);
    }
  }, [changeName, isNameValid, newName, asteroid?.id]);

  const price = useMemo(() => {
    if (!asteroid || !priceConstants) return 0;
    const lots = Asteroid.getSurfaceArea(undefined, asteroid.Celestial.radius);
    return asteroidPrice(lots, priceConstants);
  }, [asteroid, priceConstants]);

  const usdcPrice = useMemo(() => {
    return priceHelper
      .from(price || 0n, priceConstants.ASTEROID_PURCHASE_TOKEN || TOKEN.USDC)
      .to(TOKEN.USDC) / TOKEN_SCALE[TOKEN.USDC];
  }, [price, priceConstants?.ASTEROID_PURCHASE_TOKEN, priceHelper]);

  const onBuyAsteroid = useCallback(async () => {
    const limited = await checkForLimit();
    if (limited) return;

    const submission = buyAsteroid();
    fireTrackingEvent('purchase', {
      category: 'purchase',
      currency: 'USD',
      externalId: accountAddress,
      value: usdcPrice,
      items: [{
        item_name: 'asteroid'
      }]
    });
    return submission;
  }, [accountAddress, buyAsteroid, checkForLimit, usdcPrice]);

  const attemptBuyAsteroid = useCallback(() => {
    if (!price || !priceConstants?.ASTEROID_PURCHASE_TOKEN) return;
    return onVerifyFunds(
      priceHelper.from(price, priceConstants.ASTEROID_PURCHASE_TOKEN),
      onBuyAsteroid
    );
  }, [onBuyAsteroid, onVerifyFunds, price, priceConstants, priceHelper]);

  return (
    <Wrapper>
      <LeftPane>
        <DataReadout style={{ fontSize: '18px', padding: '0 0 5px' }} label="Asteroid ID#">{asteroid.id}</DataReadout>
        <DataReadout style={{ fontSize: '18px', padding: '0 0 5px' }} label="Owner">
          <AddressLink address={asteroid.Nft?.owner} chain={asteroid.Nft?.chain} />
        </DataReadout>
        <GraphicSection>
          <GraphicWrapper>
            <AsteroidGraphic
              abundances={abundances}
              asteroid={asteroid}
              noColor={asteroid.Celestial.scanStatus < Asteroid.SCAN_STATUSES.SURFACE_SCANNED}
              noGradient />
          </GraphicWrapper>
        </GraphicSection>

        <SectionBody>
          <Attributes>
            <div>
              <OrbitalPeriodIcon />
              <label>Orbital Period</label>
              <span>{formatters.period(asteroid.Orbit)}</span>
            </div>
            <div>
              <InclinationIcon />
              <label>Inclination</label>
              <span>{formatters.inclination(asteroid.Orbit.inc)}</span>
            </div>
            <div>
              <SemiMajorAxisIcon />
              <label>Semi-Major Axis</label>
              <span>{formatters.axis(asteroid.Orbit.a)}</span>
            </div>
            <div>
              <EccentricityIcon />
              <label>Eccentricity</label>
              <span>{asteroid.Orbit.ecc}</span>
            </div>
            <div>
              <RadiusIcon />
              <label>Diameter</label>
              <span>{formatters.radius(asteroid.Celestial.radius * 2)}</span>
            </div>
            <div>
              <SurfaceAreaIcon />
              <label>Surface Area</label>
              <span>{formatters.surfaceArea(asteroid.Celestial.radius)}</span>
            </div>
          </Attributes>
        </SectionBody>
      </LeftPane>

      <RightPane>
        <div>
          <SectionHeader>Asteroid Log</SectionHeader>
          <SectionBody>
            <EntityActivityLog entity={asteroid} viewingAs={viewingAs} />
          </SectionBody>
        </div>

        <div>
          <SectionHeader>Management</SectionHeader>
          <SectionBody>
            {isOwner && !isManager && <HighlightOwnership warning>You own this Asteroid, but your crew does not currently manage it.</HighlightOwnership>}
            {isManager && <HighlightOwnership>Your crew manages this Asteroid.</HighlightOwnership>}
            <ButtonRow>
              {isManager && (
                <>
                  <StaticForm
                    css={{
                      bottom: 1,
                      height: openNameChangeForm ? 'calc(100% - 10px)' : 0,
                      left: 0,
                      opacity: openNameChangeForm ? 1 : 0,
                      position: 'absolute',
                      width: openNameChangeForm ? '100%' : 0,
                      transition: 'height 300ms ease, opacity 300ms ease, width 300ms ease',
                      zIndex: 1
                    }}
                    onClose={() => setOpenNameChangeForm(false)}
                    title={<><EditIcon /><span>Change Name</span></>}
                    loading={reactBool(changingName)}>
                    <Text>Names must be unique, and can only include letters, numbers, and single spaces.</Text>
                    <NameForm>
                      <TextInput
                        disabled={nativeBool(changingName)}
                        initialValue=""
                        minlength={Name.TYPES[Entity.IDS.ASTEROID].min}
                        maxlength={Name.TYPES[Entity.IDS.ASTEROID].max}
                        pattern={Name.getTypeRegex(Entity.IDS.ASTEROID)}
                        onChange={(v) => setNewName(v)} />
                      <Button
                        isTransaction
                        size="bigicon"
                        aria-label="Submit name change"
                        loading={changingName}
                        data-tooltip-content="Submit"
                        data-tooltip-id="globalTooltip"
                        disabled={nativeBool(changingName)}
                        onClick={attemptUpdateAsteroidName}>
                        <CheckCircleIcon />
                      </Button>
                    </NameForm>
                  </StaticForm>
                  <Button
                    disabled={nativeBool(changingName)}
                    isTransaction
                    loading={reactBool(changingName)}
                    onClick={() => setOpenNameChangeForm(true)}>
                    Re-Name
                  </Button>
                </>
              )}

              {isOwner && !isManager && (
                <Button
                  disabled={nativeBool(takingControl)}
                  isTransaction
                  loading={reactBool(takingControl)}
                  onClick={controlAsteroid}>
                  Manage Asteroid
                </Button>
              )}

              {isOwner && (
                <ModelButton
                  disabled={nativeBool(exportingModel)}
                  loading={reactBool(exportingModel)}
                  onClick={download3dModel}>
                  <><SmHidden>Download{' '}</SmHidden><span>3D Model</span></>
                </ModelButton>
              )}

              {priceConstants && !asteroid.Nft?.owner && (
                <>
                  <Button
                    data-tooltip-content="Purchase development rights"
                    data-tooltip-id="globalTooltip"
                    disabled={nativeBool(!authenticated || buying)}
                    isTransaction
                    loading={reactBool(buying)}
                    onClick={attemptBuyAsteroid}>
                    <PurchaseButtonInner>
                      Purchase
                      <span>
                        <AsteroidSwayPrice
                          lots={Asteroid.getSurfaceArea(undefined, asteroid.Celestial.radius)}
                          format={TOKEN_FORMAT.SHORT} />
                      </span>
                    </PurchaseButtonInner>
                  </Button>
                  {fundingPrompt}
                </>
              )}
              {asteroid.Nft?.owner && (
                <MarketplaceLink
                  chain={asteroid.Nft?.chain}
                  assetType="asteroid"
                  id={asteroid.id}>
                  {(onClick, setRefEl) => (
                    <Button setRef={setRefEl} onClick={onClick}>
                      {isOwner ? <><span>List</span><SmHidden>{' '}for Sale</SmHidden></> : 'Purchase'}
                    </Button>
                  )}
                </MarketplaceLink>
              )}
            </ButtonRow>
          </SectionBody>
        </div>
      </RightPane>
    </Wrapper>
  );
};

export default AsteroidInformation;