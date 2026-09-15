import { useMemo } from 'react';
import styled from 'styled-components';

import { SwayIcon } from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useReferrals from '~/hooks/useReferrals';

const Wrapper = styled.div`
  padding: 0 16px 10px;

  & > h3 {
    color: #888;
    font-size: 15px;
    font-weight: normal;
    margin-bottom: 8px;
    & > b {
      color: white;
      font-weight: normal;
    }
  }
  & > label {
    font-size: 32px;
    line-height: 32px;
  }
`;

const RecruitmentMenu = () => {
  const { data: referrals, isLoading } = useReferrals();

  const [referralsCount, referralsTotal] = useMemo(() => {
    const referred = new Set();
    let total = 0;
    (referrals || []).forEach((r) => {
      referred.add(r.buyer)
      total += r.price * 0.1;
    });
    return [
      Array.from(referred).length,
      total
    ];
  }, [referrals]);

  return (
    <Wrapper>
      {!isLoading && (
        <>
          <h3>Earned from <b>{(referralsCount || 0).toLocaleString()}</b> Referral{referralsCount === 1 ? '' : 's'}:</h3>
          <label><SwayIcon /> {(referralsTotal || 0).toLocaleString()}</label>
        </>
      )}
    </Wrapper>
  );
};

export default RecruitmentMenu;