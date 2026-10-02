import { ThemeProvider } from 'styled-components';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import DataTable from './DataTable';

jest.mock('./Icons', () => ({ TriangleDownIcon: () => null, TriangleUpIcon: () => null }));
jest.mock('~/lib/actionItem', () => ({ itemColors: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: value => value ? 'true' : undefined }), { virtual: true });

test('virtualized rows update selection and sorting without remounting their contents', () => {
  const mount = jest.fn();
  const unmount = jest.fn();
  function Content({ id, selected }) {
    useEffect(() => { mount(id); return () => unmount(id); }, [id]);
    return <span>{id}: {selected ? 'selected' : 'idle'}</span>;
  }
  const rows = Array.from({ length: 5000 }, (_, id) => ({ id }));
  const columns = [{ key: 'id', label: 'ID', selector: (row, props) => <Content id={row.id} selected={props.isSelected} /> }];
  const wrapper = ({ children }) => <ThemeProvider theme={{ colors: { mainRGB: "0, 100, 200" }, cursors: { active: "pointer" } }}>{children}</ThemeProvider>;
  const view = render(<DataTable data={rows} columns={columns} keyField="id" getRowProps={() => ({ isSelected: false })} />, { wrapper });
  const initialMounts = mount.mock.calls.length;
  expect(initialMounts).toBeGreaterThan(0);
  expect(initialMounts).toBeLessThan(40);
  view.rerender(<DataTable data={rows} columns={columns} keyField="id" sortField="id" sortDirection="desc" getRowProps={row => ({ isSelected: row.id === 0 })} />);
  expect(screen.getByText('0: selected')).toBeTruthy();
  expect(mount).toHaveBeenCalledTimes(initialMounts);
  expect(unmount).not.toHaveBeenCalled();
  view.unmount();
  expect(unmount).toHaveBeenCalledTimes(initialMounts);
});
