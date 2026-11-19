const React = require('react');
const { render } = require('@testing-library/react');
const { ThemeProvider } = require('styled-components');

jest.mock('../contexts/ActionSubmissionContext', () => ({
  useActionSubmission: () => null
}));
jest.mock('../hooks/useTransactionSubmission', () => ({
  __esModule: true,
  default: () => ({ busy: false, run: callback => callback() })
}));
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));
jest.mock('~/components/Badge', () => ({
  __esModule: true,
  default: () => null
}), { virtual: true });
jest.mock('~/components/PurchaseButtonInner', () => ({
  __esModule: true,
  default: require('styled-components').default.div``
}), { virtual: true });
jest.mock('~/contexts/ChainTransactionContext', () => ({
  __esModule: true,
  default: require('react').createContext({})
}), { virtual: true });
jest.mock('~/hooks/useStore', () => ({
  __esModule: true,
  default: () => () => {}
}), { virtual: true });
jest.mock('~/theme', () => ({
  __esModule: true,
  default: {
    colors: {
      brightMain: '#ffffff',
      darkMain: '#000000',
      disabledButton: '#333333',
      disabledText: '#777777',
      main: '#ffffff',
      txButton: '#00ff00'
    },
    cursors: { active: 'pointer', default: 'default' }
  },
  getContrastText: () => '#ffffff',
  hexToRGB: () => '0, 0, 0'
}), { virtual: true });
jest.mock('./ButtonLoadingBar', () => () => null);

const Button = require('./ButtonAlt').default;
const theme = require('~/theme').default;

const renderButton = props => render(
  <ThemeProvider theme={theme}>
    <Button disabled isTransaction {...props}>Limit Buy</Button>
  </ThemeProvider>
);

test('uses supplied disabled tooltip text on the disabled transaction button', () => {
  const { container, getByRole } = renderButton({ disabledTooltipText: 'Disabled: order already exists' });
  const button = getByRole('button', { name: 'Limit Buy' });
  const tooltip = container.querySelector('[data-tooltip-content]');

  expect(button).toBeDisabled();
  expect(tooltip).toHaveAttribute('data-tooltip-content', 'Disabled: order already exists');
  expect(tooltip.getAttribute('data-tooltip-id')).toMatch(/^alt_button_tooltip_/);
});

test('does not add a disabled tooltip when no custom reason is supplied', () => {
  const { container } = renderButton({});

  expect(container.querySelector('[data-tooltip-content]')).toBeNull();
});

test('keeps the waiting tooltip as the default while a transaction is busy', () => {
  const { container } = renderButton({ loading: true });

  expect(container.querySelector('[data-tooltip-content]')).toHaveAttribute(
    'data-tooltip-content',
    'Waiting for action confirmation…'
  );
});
