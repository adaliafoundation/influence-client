import styled from 'styled-components';
import { CheckboxButton } from './filters/components';
import { CheckedIcon, UncheckedIcon } from './Icons';

const AcknowledgementRow = styled.div`
  align-items: center;
  color: #ddd;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex: 0 1 auto;
  font-size: 12px;
  gap: 8px;
  line-height: 1.3;
  margin: 0;
  max-width: 980px;

  & ${CheckboxButton} {
    color: ${p => p.$checked ? p.theme.colors.main : '#aaa'};
    flex: 0 0 auto;
    margin-right: 0;
    opacity: ${p => p.$checked ? 1 : 0.65};
  }
`;

const AcknowledgementCheckbox = ({ checked, onChange, children }) => (
  <AcknowledgementRow
    $checked={checked}
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onChange(!checked);
      }
    }}
    role="checkbox"
    tabIndex={0}>
    <CheckboxButton as="span" checked={checked} aria-hidden="true">
      {checked ? <CheckedIcon /> : <UncheckedIcon />}
    </CheckboxButton>
    {children}
  </AcknowledgementRow>
);

export default AcknowledgementCheckbox;
