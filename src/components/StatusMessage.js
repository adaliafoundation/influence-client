import styled from 'styled-components';

const Wrapper = styled.div`
  background: ${p => p.theme.colors.contentHighlight};
  border: 1px solid ${p => p.theme.colors[p.$tone]};
  border-left-width: 3px;
  padding: 12px 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  & > strong {
    color: ${p => p.theme.colors[p.$tone]};
    display: block;
    margin-bottom: 4px;
  }
`;

const StatusMessage = ({ children, title, tone = 'main', ...props }) => (
  <Wrapper $tone={tone} {...props}>
    {title && <strong>{title}</strong>}
    {children}
  </Wrapper>
);

export default StatusMessage;
