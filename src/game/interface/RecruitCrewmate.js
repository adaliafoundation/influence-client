import { useCallback, useEffect } from 'react';
import { Redirect, useHistory, useParams } from 'react-router-dom';

import { appConfig } from '~/appConfig';
import SelectHabitatDialog from '~/components/SelectHabitatDialog';
import SelectUninitializedCrewmateDialog from '~/components/SelectUninitializedCrewmateDialog';
import CrewAssignmentCreate from '~/game/interface/details/crewAssignments/Create';
import CrewAssignment from '~/game/interface/details/crewAssignments/Assignment';
import useSession from '~/hooks/useSession';
import usePendingCrewmatePurchases from '~/hooks/usePendingCrewmatePurchases';

// /recruit/:crewId -- select location IF crew is 0
// /recruit/:crewId/:locationId -- select crewmate credit
// /recruit/:crewId/:locationId/:crewmateId -- crewmate assignment
// /recruit/:crewId/:locationId/:crewmateId/create -- crewmate creation
const RecruitCrewmate = () => {
  const { authenticated } = useSession();
  const history = useHistory();
  const { locationId, crewId, crewmateId, page } = useParams();
  const pendingPurchases = usePendingCrewmatePurchases();

  const onSelectAssignedHabitat = useCallback((locationId) => {
    history.push(`/recruit/0/${locationId}/`)
  }, []);

  const onRejectAssignedHabitat = useCallback(() => {
    history.push('/');
  }, []);

  const onSelectCrewmate = useCallback((crewmateId) => {
    history.push(`/recruit/${crewId}/${locationId}/${crewmateId}`);
  }, [crewId, locationId]);

  const onFinishAssignment = useCallback(() => {
    history.push(`/recruit/${crewId}/${locationId}/${crewmateId}/create`);
  }, [crewId, locationId, crewmateId]);

  useEffect(() => {
    if (!authenticated) history.push('/');
    // Select a random habitat out of the first 100
    const habitat = appConfig.get('App.deployment') === 'production' ? Math.ceil(Math.random() * 100) : 1;
    if (!locationId) history.push(`/recruit/${crewId}/${habitat}`);
  }, [authenticated, crewId, locationId]);

  // NOTE: as it is now, the useEffect line above checking !locationId will ensure this
  //  dialog is never rendered... remove this file if we truly want this deprecated
  if (locationId === undefined) {
    return <SelectHabitatDialog onAccept={onSelectAssignedHabitat} onReject={onRejectAssignedHabitat} />;
  }
  if (crewmateId === undefined) {
    if (pendingPurchases.enabled && pendingPurchases.isPending) return null;
    if (pendingPurchases.purchases.length > 0) {
      return <Redirect to={`/recruit/${crewId}/${locationId}/0/create`} />;
    }
    return <SelectUninitializedCrewmateDialog arvadiansDisallowed={Number(locationId) > 100} onSelect={onSelectCrewmate} />;
  }
  if (page === 'create') {
    return (
      <CrewAssignmentCreate
        crewId={Number(crewId)}
        crewmateId={Number(crewmateId)}
        locationId={Number(locationId)}
        backLocation={`/recruit/${crewId}/${locationId}/${crewmateId}`}
      />
    );
  }
  return (
    <CrewAssignment
      crewId={Number(crewId)}
      crewmateId={Number(crewmateId)}
      onFinish={onFinishAssignment} />
  );
};

export default RecruitCrewmate;
