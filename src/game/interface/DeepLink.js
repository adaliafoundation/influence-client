import { useHistory, useParams } from 'react-router-dom';

import { Entity } from '@influenceth/sdk';
import { useLotLink } from '~/components/LotLink';
import { useShipLink } from '~/components/ShipLink';
import useEntity from '~/hooks/useEntity';
import { useEffect } from 'react';
import useShip from '~/hooks/useShip';

export const LotDeepLink = () => {
  const history = useHistory();
  const { id } = useParams();
  const onLink = useLotLink({ lotId: id });

  useEffect(() => {
    history.replace('/'); // cleanup url
    if (id) {
      onLink();
    }
  }, [id, onLink]);

  return null;
};

export const ShipDeepLink = () => {
  const { id } = useParams();
  const history = useHistory();

  const { isLoading } = useShip({ label: Entity.IDS.SHIP, id }); // this is to ensure we wait until useShipLink is ready
  const onLink = useShipLink({ shipId: id, zoomToShip: true });

  useEffect(() => {
    if (isLoading) return;

    history.replace('/'); // cleanup url
    if (id) {
      onLink();
    }
  }, [id, isLoading, onLink]);

  return null;
};

export const BuildingDeepLink = () => {
  const { id } = useParams();
  const history = useHistory();
  const { data: building, isLoading } = useEntity({ label: Entity.IDS.BUILDING, id });
  const onLink = useLotLink({ lotId: building?.Location?.location?.id, zoomToLot: true });

  useEffect(() => {
    if (isLoading) return;

    history.replace('/'); // cleanup url
    if (building?.Location?.location?.id) {
      onLink();
    }
  }, [building?.Location?.location?.id, isLoading, onLink]);

  return null;
};