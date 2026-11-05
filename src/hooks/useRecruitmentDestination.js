import { features } from '~/appConfig/features';
import useCrewContext from '~/hooks/useCrewContext';
import usePendingCrewmatePurchases from '~/hooks/usePendingCrewmatePurchases';
import useSession from '~/hooks/useSession';

const useRecruitmentDestination = () => {
  const { walletCapabilities } = useSession();
  const { adalianRecruits } = useCrewContext();
  const pendingPurchases = usePendingCrewmatePurchases();
  if (pendingPurchases.enabled && pendingPurchases.isPending) return null;
  const hasCredit = adalianRecruits?.length > 0 || pendingPurchases.purchases.length > 0;
  return !hasCredit && !pendingPurchases.isError && features.stripe && walletCapabilities?.preferredForStarterPacks
    ? 'packs' : '/recruit/0';
};

export default useRecruitmentDestination;
