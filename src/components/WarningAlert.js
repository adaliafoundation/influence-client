import styled from 'styled-components';
import { hexToRGB } from '~/theme';

const WarningAlert = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors[p.severity === 'warning' ? 'orange' : 'red'])}, 0.2);
  color: ${p => p.theme.colors[p.severity === 'warning' ? 'orange' : 'red']};
  display: flex;
  flex-direction: row;
  margin-top: 10px;
  padding: 10px;
  width: 100%;
  & > div:first-child {
    font-size: 30px;
    margin-right: 12px;
  }
  & > div:last-child {
    font-size: 96%;
    & > i {
      color: white;
      font-style: normal;
    }
  }
  &:first-child {
    margin-top: 0;
  }
`;

export default WarningAlert;
