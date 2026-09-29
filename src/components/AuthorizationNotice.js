import useCrewContext from '~/hooks/useCrewContext';
import Button from '~/components/Button';

const AuthorizationNotice = ({ authorization, deniedMessage = 'Access is restricted.' }) => {
  const { retryAuthorization } = useCrewContext();
  if (authorization?.status === 'allowed') return null;
  const unresolved = authorization?.status !== 'denied';
  return (
    <div role="status" style={{ padding: '8px 16px' }}>
      <span>{unresolved ? 'Checking access. If this persists, refresh the permission check.' : deniedMessage}</span>
      <Button size="small" onClick={retryAuthorization} style={{ marginLeft: 12 }}>Refresh access</Button>
    </div>
  );
};
export default AuthorizationNotice;
