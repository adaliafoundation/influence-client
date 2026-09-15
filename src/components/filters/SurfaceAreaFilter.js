import { useCallback } from 'react';
import styled from 'styled-components';
import { Asteroid, Building, Crewmate, Permission, Product } from '@influenceth/sdk';

import Button from '~/components/ButtonPill';
import { AsteroidUserPrice } from '~/components/UserPrice';
import usePriceConstants from '~/hooks/usePriceConstants';
import { TOKEN_FORMAT } from '~/lib/priceUtils';
import RangeFilter from './RangeFilter';
import { nativeBool } from '~/lib/utils';
import { AsteroidSwayPrice } from '../SwayPrice';

const Extra = styled.div`
  & > label {
    font-size: 13px;
    opacity: 0.5;
  }
`;

const QuickSizeButtons = styled.div`
  margin-top: 4px;
  margin-bottom: 10px;
  & > div {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    & > button {
      flex: 0 0 calc(50% - 3px);
      justify-content: center;
      padding-left: 0;
      padding-right: 0;
      text-transform: none;
    }
  }
`;

const config = [
  {
    min: undefined,
    max: 314,
  },
  {
    min: 314,
    max: 5026
  },
  {
    min: 5026,
    max: 31415
  },
  {
    min: 31415,
    max: undefined,
  },
]

const SurfaceAreaFilter = (filterProps) => {
  const { data: priceConstants } = usePriceConstants();

  const onClick = useCallback(({ min, max }) => () => {
    const { fieldNames, onChange, searchFormatter } = filterProps;
    onChange({
      [fieldNames.min]: searchFormatter ? searchFormatter(min) : min,
      [fieldNames.max]: searchFormatter ? searchFormatter(max) : max,
    });
  }, [filterProps]);

  const surfaceAreaFieldNote = useCallback((value) => {
    return priceConstants && <AsteroidSwayPrice lots={value} format={TOKEN_FORMAT.SHORT} noLiquidityThreshold />;
  }, [priceConstants]);

  const isActive = useCallback(({ min, max }) => {
    const { filters, fieldNames } = filterProps;
    return (filters[fieldNames.min] === min && filters[fieldNames.max] === max);
  }, [filterProps]);

  return (
    <RangeFilter
      {...filterProps}
      fieldNote={surfaceAreaFieldNote}
      highlightFieldName="surfaceArea"
      inputWidth={240}
      title="Surface Area">
      <Extra>
        <label>Quick Size</label>
        <QuickSizeButtons>
          <div>
            <Button active={nativeBool(isActive(config[0]))} onClick={onClick(config[0])}>Small Asteroids</Button>
            <Button active={nativeBool(isActive(config[1]))} onClick={onClick(config[1])}>Medium Asteroids</Button>
          </div>
          <div>
            <Button active={nativeBool(isActive(config[2]))} onClick={onClick(config[2])}>Large Asteroids</Button>
            <Button active={nativeBool(isActive(config[3]))} onClick={onClick(config[3])}>Huge Asteroids</Button>
          </div>
        </QuickSizeButtons>
      </Extra>
    </RangeFilter>
  )
}

export default SurfaceAreaFilter;