import { features } from '~/appConfig/features';
import { useEffect, useMemo, useRef } from 'react';

import AsteroidsHeroImage from '~/assets/images/sales/asteroids_hero.png';
import CrewmatesHeroImage from '~/assets/images/sales/crewmates_hero.png';
import SwayHeroImage from '~/assets/images/sales/sway_hero.jpg';
import StarterPackHeroImage from '~/assets/images/sales/starter_packs_hero.jpg';
import usePriceConstants from '~/hooks/usePriceConstants';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import PageLoader from '~/components/PageLoader';
import LauncherDialog from './components/LauncherDialog';
import AsteroidSKU from './store/AsteroidSKU';
import CrewmateSKU from './store/CrewmateSKU';
import FaucetSKU from './store/FaucetSKU';
import StarterPackSKU from './store/StarterPackSKU';
import SwaySKU from './store/SwaySKU';
import FundingStatusIndicator from './store/components/FundingStatusIndicator';
import SKULayout from './store/components/SKULayout';
import { appConfig } from '~/appConfig';

const storeAssets = {
  ...(features.stripe ? { packs: 'Starter Packs' } : {}),
  sway: 'Sway',
  crewmates: 'Crewmates',
  asteroids: 'Asteroids',
};
if (appConfig.get('Starknet.chainId') === '0x534e5f5345504f4c4941') {
  storeAssets.faucets = 'Faucets';
}

const coverImages = {
  asteroids: AsteroidsHeroImage,
  crewmates: CrewmatesHeroImage,
  packs: StarterPackHeroImage,
  sway: SwayHeroImage,
};

const STORE_BALANCE_REFRESH_MS = 60e3;

const Store = () => {
  const { crew } = useCrewContext();
  const { data: priceConstants, isLoading } = usePriceConstants();
  const { refetch: refetchBalances } = useWalletPurchasableBalances();
  const refetchBalancesRef = useRef(refetchBalances);

  const initialSubpage = useStore(s => s.launcherSubpage);
  const initiallyCollapsed = useStore(s => !!s.launcherDialogOptions?.menuCollapsed);

  useEffect(() => {
    refetchBalancesRef.current = refetchBalances;
  }, [refetchBalances]);

  useEffect(() => {
    refetchBalancesRef.current();
    const interval = setInterval(() => refetchBalancesRef.current(), STORE_BALANCE_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const initialSelection = useMemo(() => {
    const defaultSelection = crew ? 'sway' : (features.stripe ? 'packs' : 'crewmates');
    const selectionKey = Object.prototype.hasOwnProperty.call(storeAssets, initialSubpage) ? initialSubpage : defaultSelection;
    const linkedSelectionIndex = Object.keys(storeAssets).indexOf(selectionKey);
    return linkedSelectionIndex >= 0 ? linkedSelectionIndex : 0;
  }, [!crew, initialSubpage]);

  const panes = useMemo(() => {
    return Object.keys(storeAssets).map((asset) => ({
      label: storeAssets[asset],
      pane: (
        <div style={{ height: '100%' }}>
          <SKULayout coverImage={coverImages[asset]}>
            {asset === 'asteroids' && <AsteroidSKU />}
            {asset === 'crewmates' && <CrewmateSKU />}
            {asset === 'packs' && <StarterPackSKU />}
            {asset === 'sway' && <SwaySKU />}
            {asset === 'faucets' && <FaucetSKU />}
          </SKULayout>
        </div>
      ),
    }))
  }, []);

  if (isLoading && !priceConstants) return <PageLoader />;
  return (
    <LauncherDialog
      bottomLeftMenu={({ collapsed }) => <FundingStatusIndicator collapsed={collapsed} />}
      initiallyCollapsed={initiallyCollapsed}
      panes={panes}
      preselect={initialSelection} />
  );
};

export default Store;
