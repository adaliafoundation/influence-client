import BarLoader from 'react-spinners/BarLoader';
import theme from '~/theme';

const ButtonLoadingBar = ({ color = theme.colors.txButton, top = 3 }) => (
  <BarLoader
    aria-hidden="true"
    color={color}
    height={1}
    cssOverride={{ left: 0, right: 0, top, width: '100%', position: 'absolute', pointerEvents: 'none' }} />
);

export default ButtonLoadingBar;
