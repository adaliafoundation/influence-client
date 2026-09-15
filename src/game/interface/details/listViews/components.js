import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Tooltip } from 'react-tooltip';

import { LocationIcon, PermissionIcon } from '~/components/Icons';
import { useLotLink } from '~/components/LotLink';
import { useShipLink } from '~/components/ShipLink';

const StyledIconLink = styled.span`
  color: white;
  cursor: ${p => p.theme.cursors.active};
  display: inline-block;
  font-size: 20px;
  line-height: 16px;
  margin-right: 2px;
  opacity: 1;
  transition: color 250ms ease, opacity 250ms ease;
  &:hover {
    color: ${p => p.theme.colors.main};
    opacity: 0.5;
  }
`;

export const MarketplacePermissionsIcon = ({ permissions = {}, ...props }) => {
  return (
    <span
      data-tooltip-place="top-start"
      data-tooltip-html={`
        <div style="width: 200px">
        <div style= "display: flex; height: 20px; margin-tp: 4px; margin-bottom: 2px; border-bottom:1px solid rgba(255, 255, 255, 0.25)">Marketplace Permissions</div>
          ${permissions.map((key, value) => `
            <div style="display: flex; margin-top: 4px">
              <div style="color: #a0a0a0; flex-grow: 1">${key}</div>
              <div style="color: ${(value) ? 'green' : 'red'}">${value ? 'Permitted' : 'Restricted'}</div>
            </div>
          `).join('\n')}
        </div>
      `}
      {...props}>
      <PermissionIcon />
    </span>
  );
};

export const IconLink = ({ children, onClick, tooltip, ...props }) => {
  useHistory();
  return (
    <StyledIconLink
      data-tooltip-id="listViewTooltip"
      data-tooltip-content={tooltip}
      data-tooltip-place="left"
      onClick={onClick}
      {...props}>
      {children}
    </StyledIconLink>
  );
};

export const LocationLink = ({ asteroidId, lotId, resourceId, zoomToLot, ...props }) => {
  const history = useHistory();
  const _onClick = useLotLink({ asteroidId, lotId, resourceId, zoomToLot });
  return (
    <IconLink
      tooltip={`View ${lotId ? 'Lot' : 'Asteroid'}`}
      onClick={() => {
        if (_onClick) {
          history.push('/');
          _onClick();
        }
      }}
      {...props}>
      <LocationIcon />
    </IconLink>
  )
};

export const ShipLocationLink = ({ shipId, ...props }) => {
  const history = useHistory();
  const _onClick = useShipLink({ shipId, zoomToShip: true });
  return (
    <IconLink
      tooltip={'View Ship'}
      onClick={() => {
        history.push('/');
        _onClick();
      }}
      {...props}>
      <LocationIcon />
    </IconLink>
  )
};