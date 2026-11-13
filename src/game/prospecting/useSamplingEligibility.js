import { useCallback } from 'react';
import { Entity, Lot, Prospecting } from '@influenceth/sdk';
import useLot from '~/hooks/useLot';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { samplingDisabledReason } from './samplingEligibility';

export default function useSamplingEligibility({ active, asteroidId, originIndex, selected }) {
  const originId = active && originIndex ? Lot.toId(asteroidId, originIndex) : undefined;
  const targetId = active && selected ? Lot.toId(asteroidId, selected.lot) : undefined;
  const { data: origin, isLoading: originLoading } = useLot(originId);
  const { data: target, isLoading: targetLoading } = useLot(targetId);
  const { crew, crewCan, recheckAuthorization } = useCrewContext();
  const disabledReason = samplingDisabledReason({
    hasOriginPermission: !!origin && crewCan(Prospecting.ORIGIN_PERMISSION, origin),
    extractors: target?.building?.Extractors || [],
    loading: originLoading || targetLoading || !origin || !target
  });
  const recheck = useCallback(async () => {
    if (!origin || !targetId) return 'Choose a loaded section before sampling.';
    const permission = await recheckAuthorization('can', [crew, origin, Prospecting.ORIGIN_PERMISSION], [crew, origin]);
    if (permission.status !== 'allowed') return 'Permission to use the starting lot is required for another sample.';
    const target = Entity.formatEntity({ id: targetId, label: Entity.IDS.LOT });
    const buildings = await api.getEntities({ label: Entity.IDS.BUILDING,
      match: { 'Location.locations.uuid': target.uuid } });
    return samplingDisabledReason({ hasOriginPermission: true,
      extractors: buildings.flatMap((building) => building.Extractors || []), loading: false });
  }, [origin, targetId, crew, recheckAuthorization]);
  return { disabledReason, recheck };
}
