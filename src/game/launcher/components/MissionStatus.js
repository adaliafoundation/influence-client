import { CheckIcon, LockIcon, PlayIcon, SwayIcon, TargetIcon } from '~/components/Icons';
import InProgressIcon from '~/components/InProgressIcon';
import { Status } from './MissionStyles';

const MissionStatus = ({ status, explicit = false }) => {
  const Icon = { claimed: CheckIcon, completed: CheckIcon, claimable: SwayIcon, locked: LockIcon, available: PlayIcon, active: TargetIcon }[status.key];
  return (
    <Status $status={status.key} title={status.label} aria-label={explicit ? undefined : status.label}>
      {status.key === 'pending' ? <InProgressIcon height={6} /> : <Icon />}
      {explicit && <span>{status.label}</span>}
    </Status>
  );
};

export default MissionStatus;
