import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import BarLoader from 'react-spinners/BarLoader';
import GenericDialog from './GenericDialog';
import { isMaintenanceActive, subscribeMaintenance } from '../lib/maintenance';

const MaintenanceDialog = () => {
  const active = useSyncExternalStore(subscribeMaintenance, isMaintenanceActive);
  const queryClient = useQueryClient();

  useEffect(() => subscribeMaintenance(() => {
    if (!isMaintenanceActive()) queryClient.invalidateQueries();
  }), [queryClient]);

  if (!active) return null;
  return (
    <GenericDialog title="Daily Maintenance" hideActions blocking role="dialog" aria-modal="true" aria-label="Daily Maintenance">
      <article>
        <p>The server is currently undergoing daily maintenance. Please leave Influence open and it will reconnect automatically upon completion.</p>
        <BarLoader
          color="white"
          width="100%"
          cssOverride={{ marginTop: 32, marginBottom: 16 }}
          aria-label="Waiting for maintenance to complete" />
      </article>
    </GenericDialog>
  );
};

export default MaintenanceDialog;
