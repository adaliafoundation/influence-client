import { useEffect } from 'react';
import { render } from '@testing-library/react';
import withOpenDialog from './withOpenDialog';

test('closed selectors do not run their data hooks and closing cleans up subscriptions', () => {
  const renderContent = jest.fn();
  const subscribe = jest.fn();
  const unsubscribe = jest.fn();
  function Content() {
    renderContent();
    useEffect(() => { subscribe(); return unsubscribe; }, []);
    return <div>Inventory choices</div>;
  }
  const Dialog = withOpenDialog(Content);
  const view = render(<Dialog open={false} />);
  expect(renderContent).not.toHaveBeenCalled();
  view.rerender(<Dialog open />);
  expect(subscribe).toHaveBeenCalledTimes(1);
  view.rerender(<Dialog open={false} />);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  const renders = renderContent.mock.calls.length;
  view.rerender(<Dialog open={false} unrelatedUpdate={1} />);
  expect(renderContent).toHaveBeenCalledTimes(renders);
  view.rerender(<Dialog open />);
  expect(subscribe).toHaveBeenCalledTimes(2);
});
