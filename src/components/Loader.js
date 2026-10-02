import LoadingAnimation from 'react-spinners/PuffLoader';

const loadingStyle = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)'
};

const Loader = ({ overrides }) => (
  <LoadingAnimation
    color="white"
    cssOverride={loadingStyle}
    loading
    {...overrides} />
);

export default Loader;
