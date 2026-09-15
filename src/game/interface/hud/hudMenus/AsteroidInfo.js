import { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Asteroid, Entity, Ship } from '@influenceth/sdk';

import AddressLink from '~/components/AddressLink';
import { AsteroidUserPrice } from '~/components/UserPrice';
import CrewIndicator from '~/components/CrewIndicator';
import { EccentricityIcon, InclinationIcon, LinkIcon, MagnifyingIcon, OrbitalPeriodIcon, RadiusIcon, ScanAsteroidIcon, SemiMajorAxisIcon, SurfaceAreaIcon, WalletIcon } from '~/components/Icons';
import formatters from '~/lib/formatters';
import { reactBool, reactPreline } from '~/lib/utils';
import useAsteroid from '~/hooks/useAsteroid';
import useStore from '~/hooks/useStore';
import { HudMenuCollapsibleSection, Scrollable, Tray } from './components/components';
import useAsteroidShips from '~/hooks/useAsteroidShips';
import useAsteroidLotData from '~/hooks/useAsteroidLotData';
import theme from '~/theme';
import useCrew from '~/hooks/useCrew';
import usePriceConstants from '~/hooks/usePriceConstants';
import Button from '~/components/ButtonAlt';
import AsteroidTitleArea from './components/AsteroidTitleArea';
import PolicyPanels from './components/PolicyPanels';
import useDescriptionAnnotation from '~/hooks/useDescriptionAnnotation';
import useIpfsContent from '~/hooks/useIpfsContent';
import { AsteroidSwayPrice } from '~/components/SwayPrice';
import { TOKEN_FORMAT } from '~/lib/priceUtils';

const Description = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 14px;
  line-height: 20px;

  max-height: 272px;
  overflow: hidden auto;
  word-break: break-word;
`;

const InfoRow = styled.div`
  align-items: center;
  border: solid rgba(255, 255, 255, 0.1);
  border-width: 0 0 1px;
  &:first-child {
    border-top-width: 1px;
  }
  display: flex;
  flex-direction: row;
  font-size: 14px;
  padding: 5px 0;
  width: 100%;

  & > svg {
    color: #999;
    font-size: 24px;
    margin-right: 10px;
  }
  & > label {
    color: #999;
    flex: 1;
  }
  & > span {
    color: white;
  }
`;

const AsteroidInfo = ({ onClose }) => {
  const asteroidId = useStore(s => s.asteroids.origin);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const dispatchZoomStatus = useStore(s => s.dispatchZoomStatusChanged);

  const { data: asteroid } = useAsteroid(asteroidId);
  const { data: annotation, isLoading: isAnnotationLoading } = useDescriptionAnnotation(asteroid);
  const { data: description, isLoading: isContentLoading } = useIpfsContent(annotation?.ipfs?.hash);
  const { data: ships } = useAsteroidShips(asteroidId);
  const { data: lotData } = useAsteroidLotData(asteroidId);
  const { data: administrator } = useCrew(asteroid?.Control?.controller?.id);
  const { data: priceConstants } = usePriceConstants();

  const shipsInOrbitTally = useMemo(() => {
    return (ships || []).filter((ship) => {
      return ship.Location.location.label === Entity.IDS.ASTEROID && ship.Ship.status === Ship.STATUSES.AVAILABLE;
    }).length;
  }, [ships]);

  const structuresTally = useMemo(() => {
    let structures = 0;
    if (lotData) {
      for (let i = 1; i < lotData.length; i++) {
        if (lotData[i] >> 4) structures++;
      }
    }
    return structures;
  }, [lotData]);

  const zoomIn = useCallback(() => {
    dispatchZoomStatus('zooming-in');
  }, []);


  if (!asteroid || isAnnotationLoading || isContentLoading) return null;
  return (
    <>
      <Scrollable hasTray={reactBool(zoomStatus === 'out')}>
        <AsteroidTitleArea asteroid={asteroid} />

        <HudMenuCollapsibleSection title="Attributes">
          <InfoRow>
            <ScanAsteroidIcon />
            <label>Spectral Type</label>
            <span>{formatters.spectralType(asteroid.Celestial.celestialType)}</span>
          </InfoRow>
          <InfoRow>
            <RadiusIcon />
            <label>Diameter</label>
            <span>{formatters.radius(2 * asteroid.Celestial.radius)}</span>
          </InfoRow>
          <InfoRow>
            <SurfaceAreaIcon />
            <label>Surface Area</label>
            <span>{formatters.surfaceArea(asteroid.Celestial.radius)}</span>
          </InfoRow>
          <InfoRow>
            <OrbitalPeriodIcon />
            <label>Orbital Period</label>
            <span>{formatters.period(asteroid.Orbit)}</span>
          </InfoRow>
          <InfoRow>
            <SemiMajorAxisIcon />
            <label>Semi-major Axis</label>
            <span>{formatters.axis(asteroid.Orbit.a)}</span>
          </InfoRow>
          <InfoRow>
            <InclinationIcon />
            <label>Inclination</label>
            <span>{formatters.inclination(asteroid.Orbit.inc)}</span>
          </InfoRow>
          <InfoRow>
            <EccentricityIcon />
            <label>Eccentricity</label>
            <span>{asteroid.Orbit.ecc}</span>
          </InfoRow>
          {priceConstants && !asteroid.Nft?.owner && (
            <InfoRow>
              <WalletIcon />
              <label>Price</label>
              <span>
                <AsteroidSwayPrice
                  lots={Asteroid.getSurfaceArea(undefined, asteroid.Celestial.radius)}
                  format={TOKEN_FORMAT.SHORT} />
              </span>
            </InfoRow>
          )}
        </HudMenuCollapsibleSection>

        {asteroid.Nft?.owner && (
          <HudMenuCollapsibleSection title="Administration" collapsed>
            <CrewIndicator cardWidth={54} crew={administrator} label="Administrator" noCrewText="Not Set" />

            <InfoRow style={{ borderBottom: 0 }}>
              <label>Lots</label>
              <span>{(parseInt(formatters.surfaceArea(asteroid.Celestial.radius)) || 0).toLocaleString()}</span>
            </InfoRow>
            <InfoRow style={{ borderBottom: 0 }}>
              <label>Structures</label>
              <span>{(structuresTally || 0).toLocaleString()}</span>
            </InfoRow>
            <InfoRow>
              <label>Ships in Orbit</label>
              <span>{(shipsInOrbitTally || 0).toLocaleString()}</span>
            </InfoRow>
            <InfoRow>
              <WalletIcon />
              <label>Owner Information</label>
              <span>
                <AddressLink
                  address={asteroid.Nft?.owner}
                  chain={asteroid.Nft?.chain}
                  noUnderline
                  style={{ color: theme.colors.main }}>
                  Link <LinkIcon />
                </AddressLink>
              </span>
            </InfoRow>
          </HudMenuCollapsibleSection>
        )}

        {description && (
          <HudMenuCollapsibleSection titleText="Description">
            <Description>
              {reactPreline(description)}
            </Description>
          </HudMenuCollapsibleSection>
        )}

        <HudMenuCollapsibleSection title="Lot Policy" collapsed>
          <PolicyPanels entity={asteroid} />
        </HudMenuCollapsibleSection>

      </Scrollable>
      
      {zoomStatus === 'out' && (
        <Tray>
          <Button onClick={zoomIn}>
            <MagnifyingIcon style={{ marginRight: 8 }} /> Zoom to Asteroid
          </Button>
        </Tray>
      )}

    </>
  );
};

export default AsteroidInfo;