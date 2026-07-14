import { useEffect, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { PuffLoader } from 'react-spinners';
import { Tooltip } from 'react-tooltip';
import { Lot } from '@influenceth/sdk';

import modalHeaders from '~/assets/images/modal_headers';
import ClipCorner from '~/components/ClipCorner';
import useAsteroid from '~/hooks/useAsteroid';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import actionStage from '~/lib/actionStages';
import { reactBool } from '~/lib/utils';
import theme, { hexToRGB } from '~/theme';
import AssembleShip from './actionDialogs/AssembleShip';
import ClaimArrivalReward from './actionDialogs/ClaimArrivalReward';
import ClaimPrepareReward from './actionDialogs/ClaimPrepareReward';
import Construct from './actionDialogs/Construct';
import ControlAsteroid from './actionDialogs/ControlAsteroid';
import ControlShip from './actionDialogs/ControlShip';
import EmergencyModeCollect from './actionDialogs/EmergencyModeCollect';
import EmergencyModeToggle from './actionDialogs/EmergencyModeToggle';
import EjectCrew from './actionDialogs/EjectCrew';
import Extract from './actionDialogs/Extract';
import FeedCrew from './actionDialogs/FeedCrew';
import FormAgreement from './actionDialogs/FormAgreement';
import NewCoreSample from './actionDialogs/NewCoreSample';
import Deconstruct from './actionDialogs/Deconstruct';
import DelegateCrew from './actionDialogs/DelegateCrew';
import ImproveCoreSample from './actionDialogs/ImproveCoreSample';
import JettisonCargo from './actionDialogs/JettisonCargo';
import LandShip from './actionDialogs/LandShip';
import LaunchShip from './actionDialogs/LaunchShip';
import ManageCrew from './actionDialogs/ManageCrew';
import MarketplaceOrder from './actionDialogs/MarketplaceOrder';
import PlanBuilding from './actionDialogs/PlanBuilding';
import Process from './actionDialogs/Process';
import PurchaseEntity from './actionDialogs/PurchaseEntity';
import RepoBuilding from './actionDialogs/RepoBuilding';
import SetCourse from './actionDialogs/SetCourse';
import SellingList from './actionDialogs/SellingList';
import ShoppingList from './actionDialogs/ShoppingList';
import StationCrew from './actionDialogs/StationCrew';
import StartLotLeaseAuction from './actionDialogs/StartLotLeaseAuction';
import SurfaceTransfer from './actionDialogs/SurfaceTransfer';
import TransferAgreement from './actionDialogs/TransferAgreement';
import TransferToSite from './actionDialogs/TransferToSite';
import UnplanBuilding from './actionDialogs/UnplanBuilding';
const cornerSize = 20;

const fadeIn = keyframes`
  0% { opacity: 0; }
  100% { opacity: 1; }
`;

const Backdrop = styled.div`
  animation: ${fadeIn} 200ms linear 1;
  pointer-events: auto;
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  background-color: rgba(30, 30, 35, 0.5);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadingContainer = styled.div`
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  min-height: 200px;
  min-width: 300px;
  width: 100%;
`;

const ModalCushion = styled.div`
  background: rgba(50, 50, 50, 0.5);
  box-sizing: border-box;
  ${p => p.theme.clipCorner(cornerSize + 4)};
  max-height: 95vh;
  max-width: 90vw;
  overflow: hidden;
  padding: 5px;
`;

const Modal = styled.div`
  background: ${p => p.background};
  border: 1px solid ${p => p.borderColor};
  ${p => p.theme.clipCorner(cornerSize)};
  position: relative;
`;

const ModalInner = styled.div`
  color: white;
  display: flex;
  max-height: ${p => p.isLoading ? `200px` : `calc(95vh - 12px)`};
  max-width: ${p => p.isLoading ? `300px` : `calc(90vw - 12px)`};
  overflow: hidden;
  transition: max-width 250ms ease, max-height 250ms ease;
`;

const txHex = theme.colors.lightPurple;
const txRGB = hexToRGB(txHex);
export const theming = {
  [actionStage.NOT_STARTED]: {
    background: 'black',
    borderColor: '#3a3a3a',
    // cushion: 'rgba(50, 50, 50, 0.5)',
    headerBackground: `rgba(${theme.colors.mainRGB}, 0.15)`,
    highlight: '#999',
    label: 'Set Up',
  },
  [actionStage.STARTING]: {
    background: '#0e0e17',
    borderColor: '#262766',
    // cushion: `rgba(${txRGB}, 0.25)`,
    headerBackground: `rgba(${txRGB}, 0.12)`,
    highlight: txHex,
    label: 'Pending',
  },
  [actionStage.SCHEDULED]: {
    background: '#0c1218',
    borderColor: '#023467',
    // cushion: `rgba(${theme.colors.mainRGB}, 0.5)`,
    headerBackground: `rgba(${hexToRGB(theme.colors.sequenceDark)}, 0.3)`,
    highlight: theme.colors.sequence,
    label: 'Scheduled',
  },
  [actionStage.IN_PROGRESS]: {
    background: '#0d1417',
    borderColor: '#183947',
    // cushion: `rgba(${theme.colors.mainRGB}, 0.5)`,
    headerBackground: `rgba(${theme.colors.mainRGB}, 0.3)`,
    highlight: theme.colors.main,
    label: 'In Progress',
  },
  [actionStage.READY_TO_COMPLETE]: {
    background: '#081816',
    borderColor: '#124c47',
    // cushion: `rgba(${theme.colors.successRGB}, 0.5)`,
    headerBackground: `rgba(${theme.colors.successRGB}, 0.22)`,
    highlight: theme.colors.success,
    label: 'Ready',
  }
};
theming[actionStage.COMPLETING] = { ...theming[actionStage.STARTING] };
theming[actionStage.COMPLETED] = { ...theming[actionStage.READY_TO_COMPLETE] };
theming[actionStage.COMPLETED].label = 'Results';


export const useAsteroidAndLot = (props = {}) => {
  const lotId = useStore(s => props.lotId || s.asteroids.lot);
  const lotAsteroidId = useMemo(() => Lot.toPosition(lotId)?.asteroidId, [lotId]);

  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(props.asteroidId || lotAsteroidId);
  const { data: lot, isLoading: lotIsLoading } = useLot(lotId);

  // close dialog if cannot load asteroid and lot
  useEffect(() => {
    if (!asteroid || !lot) {
      if (!asteroidIsLoading && !lotIsLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, asteroidIsLoading, lotIsLoading]);

  return {
    asteroid,
    lot,
    isLoading: asteroidIsLoading || lotIsLoading
  }
};

const ActionImage = styled.div`
  background: url("${p => p.src}") center center no-repeat;
  background-size: cover;
  height: 250px;
  left: 0;
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 0;
`;

const ActionMain = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  position: relative;
  z-index: 1;
`;

// TODO: transition in
export const ActionDialogInner = ({ actionImage, children, isLoading, stage }) => (
  <Modal {...theming[stage]}>
    <ModalInner isLoading={reactBool(isLoading)}>
      {isLoading && <LoadingContainer><PuffLoader color="white" /></LoadingContainer>}
      {!isLoading && (
        <>
          {actionImage && modalHeaders[actionImage] && <ActionImage src={modalHeaders[actionImage]} />}
          <ActionMain>
            {children}
          </ActionMain>
        </>
      )}
    </ModalInner>
    <Tooltip id="actionDialogTooltip" place="left" />
    <ClipCorner dimension={cornerSize} color={theming[stage]?.borderColor} />
  </Modal>
);

const ActionDialog = ({ type, params }) => {
  const setAction = useStore(s => s.dispatchActionDialog);

  const allProps = useMemo(() => ({
    ...params,
    onSetAction: setAction,
    onClose: () => setAction(),
  }), [params, setAction]);

  useEffect(() => {
    const onKeyUp = (e) => {
      if (e.key === 'Escape') setAction();
    };
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keyup', onKeyUp);
    }
  }, []);

  return (
    <Backdrop>
      <ModalCushion>
        {type === 'ASSEMBLE_SHIP' && <AssembleShip {...allProps} />}
        {type === 'CLAIM_ARRIVAL_REWARD' && <ClaimArrivalReward {...allProps} />}
        {type === 'CLAIM_PREPARE_REWARD' && <ClaimPrepareReward {...allProps} />}
        {type === 'CONTROL_ASTEROID' && <ControlAsteroid {...allProps} />}
        {type === 'CONTROL_SHIP' && <ControlShip {...allProps} />}
        {type === 'PLAN_BUILDING' && <PlanBuilding {...allProps} />}
        {type === 'UNPLAN_BUILDING' && <UnplanBuilding {...allProps} />}
        {type === 'CONSTRUCT' && <Construct {...allProps} />}
        {type === 'DECONSTRUCT' && <Deconstruct {...allProps} />}
        {type === 'DELEGATE_CREW' && <DelegateCrew {...allProps} />}
        {type === 'EJECT_CREW' && <EjectCrew {...allProps} />}
        {type === 'EJECT_GUEST_CREW' && <EjectCrew {...allProps} guests />}
        {type === 'EMERGENCY_MODE_COLLECT' && <EmergencyModeCollect {...allProps} />}
        {type === 'EMERGENCY_MODE_TOGGLE' && <EmergencyModeToggle {...allProps} />}
        {type === 'END_AGREEMENT' && <FormAgreement {...allProps} isTermination />}
        {type === 'EXTRACT_RESOURCE' && <Extract {...allProps} />}
        {type === 'FEED_CREW' && <FeedCrew {...allProps} />}
        {type === 'FORM_AGREEMENT' && <FormAgreement {...allProps} />}
        {type === 'EXTEND_AGREEMENT' && <FormAgreement {...allProps} isExtension />}
        {type === 'JETTISON_CARGO' && <JettisonCargo {...allProps} />}
        {type === 'LAND_SHIP' && <LandShip {...allProps} />}
        {type === 'LAUNCH_SHIP' && <LaunchShip {...allProps} />}
        {type === 'IMPROVE_CORE_SAMPLE' && <ImproveCoreSample {...allProps} />}
        {type === 'NEW_CORE_SAMPLE' && <NewCoreSample {...allProps} />}
        {type === 'MANAGE_CREW' && <ManageCrew {...allProps} />}
        {type === 'NEW_CREW' && <ManageCrew {...allProps} newCrew />}
        {type === 'MARKETPLACE_ORDER' && <MarketplaceOrder {...allProps} />}
        {type === 'PROCESS' && <Process {...allProps} />}
        {type === 'PURCHASE_ENTITY' && <PurchaseEntity {...allProps} />}
        {type === 'REPO_BUILDING' && <RepoBuilding {...allProps} />}
        {type === 'SET_COURSE' && <SetCourse {...allProps} />}
        {type === 'SELLING_LIST' && <SellingList {...allProps} />}
        {type === 'SHOPPING_LIST' && <ShoppingList {...allProps} />}
        {type === 'START_LOT_LEASE_AUCTION' && <StartLotLeaseAuction {...allProps} />}
        {type === 'STATION_CREW' && <StationCrew {...allProps} />}
        {type === 'STATION_CREW_AS_GUESTS' && <StationCrew {...allProps} guests />}
        {type === 'SURFACE_TRANSFER' && <SurfaceTransfer {...allProps} />}
        {type === 'TRANSFER_AGREEMENT' && <TransferAgreement {...allProps} />}
        {type === 'TRANSFER_TO_SITE' && <TransferToSite {...allProps} />}
      </ModalCushion>
    </Backdrop>
  );
}

const ActionDialogWrapper = () => {
  const actionDialog = useStore(s => s.actionDialog);
  // const actionDialog = { params: { origin: { id: 755, label: 6 }, originSlot: 2 }, type: 'JETTISON_CARGO' }; // (for debugging)
  return actionDialog?.type ? <ActionDialog {...actionDialog} /> : null;
};

export default ActionDialogWrapper;
