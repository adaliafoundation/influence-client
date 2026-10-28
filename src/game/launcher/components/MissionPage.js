import styled from 'styled-components';
import { RewardsIcon } from '~/components/Icons';
import { Muted } from './MissionStyles';

const Page = styled.div`
  padding: 36px 75px 44px 75px;
  margin: auto;
  & h1 { font-weight: 400; font-size: 34px; margin: 10px 0; letter-spacing: 0.02em; }
  @media (max-width: 1100px) { padding: 36px 12px; }
`;
const Header = styled.header`
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 24px;
  & > svg { color: ${p => p.theme.colors.main}; width: 56px; height: 56px; flex-shrink: 0; opacity: 0.5; }
`;
export const MissionEmpty = styled.div`
  border: 1px solid #25323c;
  background: #0c1319;
  padding: 44px;
  text-align: center;
  min-height: 230px;
  position: relative;
  & h2 { font-size: 20px; font-weight: 400; }
  & button { margin: 20px auto 0; }
`;

const MissionPage = ({ title, description, children }) => (
  <Page><Header><RewardsIcon /><div><h1>{title}</h1><Muted>{description}</Muted></div></Header>{children}</Page>
);
export default MissionPage;
