import { useIsFetching } from '@tanstack/react-query'
import LoadingAnimation from 'react-spinners/BarLoader';

import theme from '~/theme';

const loadingCss = {
  display: 'block'
};

const QueryLoader = () => {
  const isFetching = useIsFetching();
  return isFetching
    ? (
      <div style={{ left: 0, pointerEvents: 'none', position: 'fixed', right: 0, top: 0, zIndex: 10000 }}>
        <LoadingAnimation color={theme.colors.main} cssOverride={loadingCss} height={2} width="100%" />
      </div>
    )
    : null;
}

export default QueryLoader;
