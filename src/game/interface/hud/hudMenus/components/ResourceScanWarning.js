import styled from 'styled-components';

import { WarningIcon } from '~/components/Icons';

const Warning = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.warning};
  display: flex;
  font-size: 13px;
  line-height: 1.4;
  padding: 8px 0 0 4px;

  & > svg {
    flex: 0 0 18px;
    font-size: 18px;
    margin-right: 8px;
  }
`;

const ResourceScanWarning = () => (
  <Warning>
    <WarningIcon />
    <span>Complete orbital scan to reveal resource distributions</span>
  </Warning>
);

export default ResourceScanWarning;
