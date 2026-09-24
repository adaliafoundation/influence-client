import { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import Button from '~/components/ButtonAlt';
import { CrewmateIcon } from '~/components/Icons';
import usePendingCrewmatePurchases from '~/hooks/usePendingCrewmatePurchases';
import useStore from '~/hooks/useStore';
import { useControlledAlert } from './Alerts';

const PendingCrewmatePurchases = () => {
  const { purchases } = usePendingCrewmatePurchases();
  const { create, destroy } = useControlledAlert();
  const history = useHistory();
  const { pathname } = useLocation();
  const dispatchLauncherPage = useStore((s) => s.dispatchLauncherPage);
  const recruiting = pathname.startsWith('/recruit/');
  const count = purchases.length;

  useEffect(() => {
    if (!count || recruiting) return;
    const id = create({
      icon: <CrewmateIcon />,
      content: (
        <div>
          You have {count} paid crewmate {count === 1 ? 'purchase' : 'purchases'} ready to customize.
          Open a crew stationed in a Habitat and select an empty slot to finish recruitment.
          <Button style={{ marginTop: 10 }} onClick={() => { dispatchLauncherPage(); history.push('/crew'); }}>
            Finish crewmate recruitment
          </Button>
        </div>
      )
    });
    return () => destroy(id);
  }, [count, create, destroy, dispatchLauncherPage, history, recruiting]);

  return null;
};

export default PendingCrewmatePurchases;
