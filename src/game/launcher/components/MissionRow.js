import styled from 'styled-components';
import { ForwardIcon, SwayIcon } from '~/components/Icons';
import { getLicensedAssetUrl } from '~/lib/assetUtils';
import { getMissionStatus } from '~/lib/missionPresentation';
import MissionStatus from './MissionStatus';
import { Eyebrow, Reward, SurfaceButton } from './MissionStyles';

const Row = styled(SurfaceButton)`
  align-items: center;
  display: grid;
  grid-template-columns: 30px 100px 1fr auto 28px 16px;
  gap: 18px;
  min-height: 92px;
  padding: 10px 18px;
  background: ${p => p.$active ? '#12232e' : '#0c1218'};
  border-color: ${p => p.$active ? '#3c657c' : '#202d37'};
  & h3 { font-size: 16px; font-weight: 400; margin: 0; }
  @media (max-width: 1100px) {
    grid-template-columns: 22px 70px 1fr auto 24px;
    gap: 10px;
    padding: 10px;
    & > svg:last-child { display: none; }
  }
`;
const Thumb = styled.div`
  height: 64px;
  background: url(${p => p.$image}) center / cover;
  opacity: ${p => p.$locked ? 0.35 : 0.85};
  filter: ${p => p.$locked ? 'grayscale(0.8)' : 'none'};
`;
const RowTitle = styled.div`
  opacity: ${p => p.$locked ? 0.5 : 1};
  & small { display: block; color: #8a9ca9; font-size: 11px; margin-top: 7px; letter-spacing: 0.04em; }
`;
// Campaign and standalone missions share the same row presentation.
const MissionRow = ({ mission, pending, eligible, presentation, image, detail, onClick }) => {
  const status = getMissionStatus(mission, pending, eligible, presentation);
  const locked = status.key === 'locked';
  return <li>
    <Row $active={['active', 'available', 'claimable'].includes(status.key)} onClick={onClick} aria-label={`${mission.title}: ${status.label}`}>
      <Eyebrow style={{ opacity: locked ? 0.4 : 1 }}>{String(mission.id + 1).padStart(2, '0')}</Eyebrow>
      <Thumb $image={getLicensedAssetUrl(image)} $locked={locked} />
      <RowTitle $locked={locked}><h3>{mission.title}</h3>
        {status.key === 'active' && <small>{detail || status.label}</small>}
        {status.key === 'claimable' && <small>Reward available</small>}
      </RowTitle>
      <Reward style={{ opacity: locked || mission.claimed ? 0.45 : 1 }}><SwayIcon /> {mission.reward.toLocaleString()}</Reward>
      <MissionStatus status={status} />
      <ForwardIcon />
    </Row>
  </li>;
};
export default MissionRow;
