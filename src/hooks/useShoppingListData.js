import { useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Asteroid, Crew, Crewmate, Entity, Lot, Permission } from '@influenceth/sdk';

import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useShoppingListOrders from '~/hooks/useShoppingListOrders';
import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useShoppingListData = (asteroidId, lotId, productIds, mode = 'buy') => {
  const {
    data: exchanges,
    isLoading: exchangesLoading,
    dataUpdatedAt: exchangesUpdatedAt,
    refetch: refetchExchanges
  } = useAsteroidBuildings(asteroidId, 'Exchange', mode === 'buy' ? Permission.IDS.BUY : Permission.IDS.SELL);

  const lastValue = useRef();
  const exchangesById = useMemo(() => new Map((exchanges || []).map(exchange => [Number(exchange.id), exchange])), [exchanges]);

  // Fee data depends on controlling crews, not exchange render timestamps.
  const crewIds = useMemo(() => [...new Set((exchanges || []).map(exchange => exchange.Control?.controller?.id).filter(Boolean))].sort((a, b) => a - b), [exchanges]);
  const { data: crewmates, isLoading: crewmatesLoading, isError: crewmatesError, dataUpdatedAt: crewmatesUpdatedAt, refetch: refetchCrewmates } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.CREWMATE, `controllers:${crewIds.join(',')}`),
    queryFn: () => api.getCrewmatesOfCrews(crewIds),
    enabled: crewIds.length > 0
  });
  const feesLoading = crewIds.length > 0 && crewmatesLoading;
  const feeEnforcements = useMemo(() => {
    if (crewmatesError) return undefined;
    const crews = {};
    for (const crewmate of crewmates || []) {
      const crewId = crewmate.Control?.controller?.id;
      if (crewId) (crews[crewId] ||= []).push(crewmate);
    }
    const bonuses = Object.fromEntries(Object.entries(crews).map(([crewId, members]) => [crewId,
      Crew.getAbilityBonus(Crewmate.ABILITY_IDS.MARKETPLACE_FEE_ENFORCEMENT, members).totalBonus
    ]));
    return Object.fromEntries((exchanges || []).map(exchange => [exchange.id, bonuses[exchange.Control?.controller?.id] || 1]));
  }, [crewmates, crewmatesError, exchanges]);

  const { data: orders, isLoading: ordersLoading, dataUpdatedAt: ordersUpdatedAt, refetch: refetchOrders } = useShoppingListOrders(asteroidId, productIds, mode);
  const dataUpdatedAt = Math.max(exchangesUpdatedAt || 0, crewmatesUpdatedAt || 0, ordersUpdatedAt || 0);
  const isLoading = exchangesLoading || feesLoading || ordersLoading;
  return useMemo(() => {
    const refetch = () => {
      refetchExchanges();
      refetchOrders();
      if (crewIds.length) refetchCrewmates();
    };

    if (isLoading) {
      return {
        data: lastValue.current,
        isLoading: true,
        dataUpdatedAt,
        refetch
      };
    }

    const finalData = {};
    if (feeEnforcements && exchanges && orders) {
      Object.keys(orders).forEach((productId) => {
        finalData[productId] = [];
        Object.keys(orders[productId]).forEach((buildingId) => {
          const o = orders[productId][buildingId];
          const marketplace = exchangesById.get(Number(buildingId));

          if (marketplace) {
            finalData[productId].push({
              ...o,
              marketplace,
              distance: lotId > 0 ? Asteroid.getLotDistance(asteroidId, Lot.toIndex(o.lotId), Lot.toIndex(lotId)) : 0,
              feeEnforcement: feeEnforcements[buildingId] || 1
            });
          }
        });
      });
      lastValue.current = finalData;
    }

    return {
      data: finalData,
      dataUpdatedAt,
      isLoading: false,
      refetch
    };
  }, [asteroidId, lotId, isLoading, feeEnforcements, exchanges, exchangesById, dataUpdatedAt, orders, refetchExchanges, refetchOrders, refetchCrewmates, crewIds.length]);
};

export default useShoppingListData;