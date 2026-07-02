import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient,  } from '@tanstack/react-query';
import { Entity, Lot, Permission, Ship } from '@influenceth/sdk';

import useBlockTime from '~/hooks/useBlockTime';
import useEntity from '~/hooks/useEntity';
import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';
import { getActiveUseLotAgreement, getExpiredUseLotAgreement } from '~/lib/leaseUtils';


const useLotEntities = (lotId, entityLabel, isPreloaded) => {
  return useQuery({
    queryKey: entitiesCacheKey(entityLabel, { lotId }),
    queryFn: () => {
      const lotEntity = Entity.formatEntity({ id: lotId, label: Entity.IDS.LOT });
      return api.getEntities({ label: entityLabel, match: { 'Location.locations.uuid': lotEntity?.uuid } });
    },
    enabled: !!(lotId > 0 && entityLabel && isPreloaded)
  })
};

const useLot = (rawLotId) => {
  const lotId = Number(rawLotId);
  const blockTime = useBlockTime();
  const queryClient = useQueryClient();

  // console.log('lotId', typeof lotId, lotId, lotId ? Entity.formatEntity({ id: lotId, label: Entity.IDS.LOT }) : null)
  const lotEntity = useMemo(() => lotId ? Entity.formatEntity({ id: lotId, label: Entity.IDS.LOT }) : null, [lotId]);
  // console.log('lotId', { lotId, lotEntity });

  const { data: lot, isLoading: lotIsLoading, dataUpdatedAt: lUpdatedAt } = useEntity(lotId ? { id: lotId, label: Entity.IDS.LOT } : undefined);
  // console.log({ lot: lot.PrepaidAgreements?.length })

  // prepop all the entities on the lot in the cache (so can do in a single query)
  const { data: lotDataPrepopped, isLoading: lotDataIsLoading } = useQuery({
    queryKey: ['lotEntitiesPrepopulation', lotId],
    queryFn: async () => {
      if (!lotId) console.error('useLot has bad lotId');

      // populate from single query... set query data
      const lotEntities = (await api.getEntities({
        match: { 'Location.locations.uuid': lotEntity.uuid },
        label: [Entity.IDS.BUILDING, Entity.IDS.DEPOSIT, Entity.IDS.SHIP],
      })) || [];

      // update queryClient for individual entities, so that when lot data invalidated, they are refetched
      // TODO: not sure why we would do this here if we are not doing everywhere with an 'entities' key?
      lotEntities.forEach((e) => {
        queryClient.setQueryData([ 'entity', e.label, e.id ], e);
      });

      [Entity.IDS.BUILDING, Entity.IDS.DEPOSIT, Entity.IDS.SHIP].forEach((label) => {
        queryClient.setQueryData(
          entitiesCacheKey(label, { lotId }),
          lotEntities.filter((e) => e.label === label)
        );
      })

      return true;
    },
    enabled: !!lotEntity?.uuid
  });

  // (presuming this is already loaded so doesn't cause any overhead)
  const { data: asteroid, isLoading: asteroidLoading } = useEntity(lotId ? { label: Entity.IDS.ASTEROID, id: Number(Lot.toPosition(lotId)?.asteroidId) } : undefined);

  // we try to prepop all the below in a single call above so the
  // below queries only get refreshed invididually when invalidated
  const { data: buildings, isLoading: buildingsLoading, dataUpdatedAt: bUpdatedAt } = useLotEntities(lotId, Entity.IDS.BUILDING, !!lotDataPrepopped);
  const { data: deposits, isLoading: depositsLoading, dataUpdatedAt: dUpdatedAt } = useLotEntities(lotId, Entity.IDS.DEPOSIT, !!lotDataPrepopped);
  const { data: ships, isLoading: shipsLoading, dataUpdatedAt: sUpdatedAt} = useLotEntities(lotId, Entity.IDS.SHIP, !!lotDataPrepopped);

  const isLoading = lotEntity?.uuid && (lotIsLoading || lotDataIsLoading || asteroidLoading || buildingsLoading || depositsLoading || shipsLoading);
  const objArrDataUpdatedAt = Math.max(bUpdatedAt, dUpdatedAt, lUpdatedAt, sUpdatedAt);
  const data = useMemo(() => {
    if (isLoading || !lotEntity?.uuid) return undefined;

    const { asteroidId, lotIndex } = Lot.toPosition(lotId) || {};
    // TODO: do we need Whitelist*Agreements here?
    const prepaidAgreements = lot?.PrepaidAgreements || [];
    const activePrepaidAgreement = getActiveUseLotAgreement(prepaidAgreements, blockTime);
    const expiredPrepaidAgreement = getExpiredUseLotAgreement(prepaidAgreements, blockTime);
    const agreement = activePrepaidAgreement || (lot?.ContractAgreements || []).find((a) => a.permission === Permission.IDS.USE_LOT);
    const building = (buildings || []).find((e) => e.Building.status > 0);
    const depositsToShow = (deposits || []).filter((e) => e.Deposit.status > 0);// && !(e.Deposit.status === Deposit.STATUSES.USED && e.Deposit.remainingYield === 0));
    const shipsToShow = (ships || []).filter((s) => [Ship.STATUSES.UNDER_CONSTRUCTION, Ship.STATUSES.AVAILABLE].includes(s.Ship.status));
    const surfaceShip = !building && shipsToShow.find((e) => e.Ship.status === Ship.STATUSES.AVAILABLE && e.Location.location.label === Entity.IDS.LOT);

    return {
      ...lotEntity,
      ...lot,
      Location: {
        location: { label: Entity.IDS.ASTEROID, id: asteroidId },
        locations: [
          lotEntity,
          { label: Entity.IDS.ASTEROID, id: asteroidId },
        ]
      },
      building,
      deposits: depositsToShow,
      ships: shipsToShow,
      surfaceShip,
      _activeUseLotAgreement: activePrepaidAgreement,
      _expiredUseLotAgreement: expiredPrepaidAgreement,

      Control: agreement?.permitted?.id
        ? {
          controller: { id: agreement.permitted.id, label: Entity.IDS.CREW },
          _superController: asteroid?.control,
          _isExplicit: true,
        }
        : {
          ...asteroid?.Control,
          _superController: asteroid?.control
        },
      ContractPolicies: asteroid?.ContractPolicies,
      PrepaidAgreementAuctionSet: asteroid?.PrepaidAgreementAuctionSet,
      PrepaidPolicies: (asteroid?.PrepaidPolicies || []).map((p) => {
        // for simplicity, apply AP's special lot rating here so don't have to apply it everywhere else
        if (p.permission === Permission.IDS.USE_LOT && asteroid.id === 1) {
          return {
            ...p,
            rate: Math.floor(Permission.getAdaliaPrimeLotRate(p, lotIndex))
          }
        }
        return p;
      }),
      // 'ContractAgreement', 'PrepaidAgreement' should be on lot record
      // unclear what happens to 'WhitelistAgreement' or PublicPolicies
    };
  }, [lotEntity?.uuid, isLoading, asteroid, blockTime, buildings, deposits, ships, objArrDataUpdatedAt]);

  return useMemo(() => ({ data, isLoading }), [data, isLoading]);
};

export default useLot;
