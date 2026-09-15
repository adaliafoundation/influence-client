import { useMemo } from 'react';
import { useHistory } from 'react-router';
import { Asteroid } from '@influenceth/sdk';

import { ScanAsteroidIcon, OrbitalScanIcon } from '~/components/Icons';
import useAsteroid from '~/hooks/useAsteroid';
import useScanManager from '~/hooks/actionManagers/useScanManager';

import ActionButton from './ActionButton';
import useCrewContext from '~/hooks/useCrewContext';

const isVisible = ({ accountCrewIds, asteroid, crew }) => {
  return asteroid && crew
    && accountCrewIds?.includes(asteroid.Control?.controller?.id)
    && asteroid.Celestial?.scanStatus < Asteroid.SCAN_STATUSES.RESOURCE_SCANNED;
};

const ScanAsteroid = ({ asteroid, _disabled }) => {
  const history = useHistory();
  const { scanStatus, scanType } = useScanManager(asteroid);
  const { crew, isLaunched } = useCrewContext();

  const { disabledReason, label, flags, handleClick } = useMemo(() => {
    let flags = {
      attention: undefined,
      disabled: _disabled,
      loading: undefined,
      finishTime: asteroid?.Celestial?.scanFinishTime
    };
    let disabledReason = _disabled ? 'loading...' : null;

    // resource scan requires crew to be on asteroid
    if (!isLaunched) {
      flags.disabled = true;
      disabledReason = 'not yet launched';
    }
    if (scanType === 'RESOURCE' && (!crew._location?.asteroidId || crew._location?.asteroidId !== asteroid?.id)) {
      flags.disabled = true;
      disabledReason = 'crew must be present';
    }
    else if (scanStatus === 'UNSCANNED' && !crew?._ready) {
      flags.disabled = true;
      disabledReason = 'crew busy';
    }

    switch (scanStatus) {
      default:
      case 'UNSCANNED':
        flags.attention = flags.disabled ? false : true;
        return {
          disabledReason,
          label: `Perform ${scanType === 'SURFACE' ? 'Long-Range' : 'Orbital'} Scan`,
          flags,
          handleClick: () => {
            // startAsteroidScan();
            history.push(`/asteroids/${asteroid.id}/resources`);
          },
        };
      case 'SCANNING':
        flags.loading = true;
        return {
          disabledReason,
          label: `Performing ${scanType === 'SURFACE' ? 'Long-Range' : 'Orbital'}...`,
          flags,
          handleClick: () => {
            history.push(`/asteroids/${asteroid.id}/resources`);
          }
        };
      case 'READY_TO_FINISH':
        flags.attention = flags.disabled ? false : true;
        return {
          disabledReason,
          label: 'Retrieve Scan Results',
          flags,
          handleClick: () => {
            // finalizeAsteroidScan();
            history.push(`/asteroids/${asteroid.id}/resources`);
          }
        };
      case 'FINISHING':
        flags.loading = true;
        return {
          disabledReason,
          label: 'Retrieving Scan Results...',
          flags,
          handleClick: () => {
            history.push(`/asteroids/${asteroid.id}/resources`);
          }
        };
    }
  }, [asteroid?.id, crew?._ready, isLaunched, scanStatus, _disabled]);

  return (
    <ActionButton
      label={`${label}`}
      labelAddendum={disabledReason}
      flags={flags}
      icon={scanType === 'SURFACE' ? <ScanAsteroidIcon /> : <OrbitalScanIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: ScanAsteroid, isVisible };

export default actionDefinition;
