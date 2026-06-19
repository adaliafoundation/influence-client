import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import { TriangleDownIcon, TriangleUpIcon } from './Icons';

import { itemColors } from '~/lib/actionItem';
import { useCallback, useMemo, useState } from 'react';
import { reactBool } from '~/lib/utils';

const minColumnWidth = 190;
const rowHeight = 40;
const virtualizeThresholdDefault = 80;
const virtualizedHeightDefault = 480;

const align = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end'
};

const DataTable = styled.table.attrs({
  cellSpacing: 0,
  cellPadding: 0
})`
  border-collapse: collapse;
  width: calc(100% - 18px);
  td, th {
    background: black;
    color: #AAA;
    & > div {
      align-items: center;
      justify-content: flex-start;
      display: flex;
      height: 100%;
      padding: 0 16px;
      position: relative;
      white-space: nowrap;
      width: 100%;
    }
  }
  td {
    font-size: 15px;
  }
`;
const DataTableHead = styled.thead``;
const DataTableBody = styled.tbody``;
const DataTableRow = styled.tr`
  ${p => p.onClick && `cursor: ${p.theme.cursors.active};`}
  ${p => p.status
    ? `
      td {
        background: rgba(${itemColors[p.status]}, 0.12);
        i {
          color: rgb(${itemColors[p.status]});
        }
      }
      &:hover {
        td {
          background: rgba(${itemColors[p.status]}, 0.16);
        }
      }
    `
    : (
      p.isSelected
        ? `
          td {
            background: rgba(${p.selectedColorRGB || p.theme.colors.mainRGB}, 0.3);
          }
        `
        : `
          &:hover {
            td {
              background: rgba(${p.selectedColorRGB || p.theme.colors.mainRGB}, 0.1);
            }
          }
        `
    )
  }
`;

const SortIcon = styled.span`
  font-size: 14px;
  position: absolute;
  right: 6px;
  transition: opacity 250ms ease, transform 250ms ease;
`;

const iconColumnWidth = 45;
const DataTableHeadCell = styled.th`
  height: 40px;
  ${p => p.isIconColumn && `width: ${iconColumnWidth}px;`}
  position: sticky;
  top: 0;
  z-index: 1;
  & > div {
    ${p => p.align && `justify-content: ${align[p.align]} !important;`}
    background: transparent;
    border-bottom: 1px solid #444;
    ${p => p.isIconColumn
      ? `
        color: #444;
        padding: 0 !important;
        width: ${iconColumnWidth}px !important;
      `
      : `
        min-width: ${p.noMinWidth ? 0 : minColumnWidth}px;
      `
    }

    ${p => p.sortable && `
      cursor: ${p.theme.cursors.active};
      ${p.sorted && `
        background: rgba(${p.theme.colors.mainRGB}, 0.5);
        color: white;
      `}
      ${SortIcon} {
        opacity: ${p.sorted ? 1 : 0};
      }

      &:hover {
        ${SortIcon} {
          ${p.sorted
            ? `
              opacity: 0.75;
              transform: rotate(180deg);
            `
            : `
              opacity: 0.5;
            `
          }
        }
      }
    `}

    & > svg {
      font-size: 24px;
      ${p => !p.isIconColumn && `margin-right: 6px;`}
    }
  }
`;
const DataTableCell = styled.td`
  border-bottom: 1px solid #171717;
  height: 40px;
  ${p => p.isIconColumn && `width: 45px;`}
  ${p => p.sorted && `color: white !important;`}
  ${p => p.expandableContent && `background: rgba(255, 255, 255, 0.15) !important;`}
  & > div {
    ${p => p.align && `justify-content: ${align[p.align]} !important;`}
    ${p => p.sorted && `background: rgba(255, 255, 255, 0.1);`}
    ${p => p.isIconColumn
      ? `
        padding: 0 !important;
        width: 100% !important;
      `
      : `
        min-width: ${p.noMinWidth ? 0 : minColumnWidth}px;
      `
    }
  }
`;
const CellInner = styled.div`
  ${p => p.wrap && `white-space: normal !important;`}
`;

const VirtualDataTable = styled.div`
  background: black;
  color: #AAA;
  font-size: 15px;
  width: calc(100% - 18px);
`;

const VirtualRowLayout = styled.div`
  display: flex;
  min-width: 100%;
`;

const virtualColumnStyle = (p) => p.isIconColumn
  ? `
    flex: 0 0 ${iconColumnWidth}px;
    width: ${iconColumnWidth}px;
  `
  : `
    flex: 1 0 ${p.noMinWidth ? 0 : minColumnWidth}px;
    min-width: ${p.noMinWidth ? 0 : minColumnWidth}px;
  `;

const VirtualDataTableHead = styled(VirtualRowLayout)`
  height: ${rowHeight}px;
  position: sticky;
  top: 0;
  z-index: 1;
`;

const VirtualDataTableHeadCell = styled.div`
  ${virtualColumnStyle}
  align-items: center;
  background: black;
  border-bottom: 1px solid #444;
  color: #AAA;
  display: flex;
  height: ${rowHeight}px;
  justify-content: ${p => align[p.align] || 'flex-start'};
  padding: 0 ${p => p.isIconColumn ? 0 : 16}px;
  position: relative;
  white-space: nowrap;
  ${p => p.isIconColumn && `
    color: #444;
    justify-content: center;
  `}
  ${p => p.sortable && `
    cursor: ${p.theme.cursors.active};
    ${p.sorted && `
      background: rgba(${p.theme.colors.mainRGB}, 0.5);
      color: white;
    `}
    ${SortIcon} {
      opacity: ${p.sorted ? 1 : 0};
    }

    &:hover {
      ${SortIcon} {
        ${p.sorted
          ? `
            opacity: 0.75;
            transform: rotate(180deg);
          `
          : `
            opacity: 0.5;
          `
        }
      }
    }
  `}
  & > svg {
    font-size: 24px;
    ${p => !p.isIconColumn && `margin-right: 6px;`}
  }
`;

const VirtualDataTableCell = styled.div`
  ${virtualColumnStyle}
  align-items: center;
  background: black;
  border-bottom: 1px solid #171717;
  color: #AAA;
  display: flex;
  height: ${rowHeight}px;
  justify-content: ${p => align[p.align] || 'flex-start'};
  padding: 0 ${p => p.isIconColumn ? 0 : 16}px;
  position: relative;
  white-space: nowrap;
  ${p => p.sorted && `
    color: white !important;
    background: rgba(255, 255, 255, 0.1);
  `}
  ${p => p.isIconColumn && `
    justify-content: center;
  `}
`;

const VirtualDataTableRow = styled(VirtualRowLayout)`
  height: ${rowHeight}px;
  ${p => p.onClick && `cursor: ${p.theme.cursors.active};`}
  ${p => p.status
    ? `
      ${VirtualDataTableCell} {
        background: rgba(${itemColors[p.status]}, 0.12);
        i {
          color: rgb(${itemColors[p.status]});
        }
      }
      &:hover {
        ${VirtualDataTableCell} {
          background: rgba(${itemColors[p.status]}, 0.16);
        }
      }
    `
    : (
      p.isSelected
        ? `
          ${VirtualDataTableCell} {
            background: rgba(${p.selectedColorRGB || p.theme.colors.mainRGB}, 0.3);
          }
        `
        : `
          &:hover {
            ${VirtualDataTableCell} {
              background: rgba(${p.selectedColorRGB || p.theme.colors.mainRGB}, 0.1);
            }
          }
        `
    )
  }
`;

const VirtualListWrapper = styled.div`
  .data-table-virtual-list {
    overflow-x: hidden !important;
  }
`;

const getEmptyObj = () => ({});

const getVisibleColumns = (columns) => columns.filter((c) => !c.skip);
const hasExpandableColumn = (columns) => columns.some((c) => c.key === '_expandable' && !c.skip);

const ExpandableDataTableRow = ({ columns, getRowProps, row, sortDirection, sortField, visibleColumns }) => {
  const [expanded, setExpanded] = useState(false);

  const expandableContent = useMemo(() => {
    const getContent = columns.find((c) => c.key === '_expandable')?.selector;
    if (getContent) return getContent(row);
    return null;
  }, [columns, row]);

  const onClickExpandable = useCallback(() => {
    if (expandableContent) setExpanded((e) => !e);
  }, [expandableContent]);

  const rowProps = useMemo(() => {
    return (getRowProps ? getRowProps(row) : null) || {};
  }, [getRowProps, row]);

  return (
    <>
      <DataTableRow
        {...rowProps}
        ref={rowProps.setRef}
        clickable={rowProps?.onClick || !!expandableContent}
        isSelected={reactBool(rowProps?.isSelected || expanded)}
        onClick={expandableContent ? onClickExpandable : rowProps?.onClick}>
        {visibleColumns.map((c) => (
          <DataTableCell
            key={c.key}
            align={c.alignBody || c.align}
            isIconColumn={c.isIconColumn || !c.label}
            noMinWidth={c.noMinWidth}
            sorted={sortField && sortField === c.sortField ? sortDirection : ''}
            style={c.bodyStyle || {}}>
            <CellInner wrap={reactBool(!!c.wrap)}>
              {c.selector(row, { expanded, ...rowProps })}
            </CellInner>
          </DataTableCell>
        ))}
      </DataTableRow>
      {expanded && expandableContent && (
        <DataTableRow isSelected>
          <DataTableCell expandableContent colSpan={visibleColumns.length}>
            {expandableContent}
          </DataTableCell>
        </DataTableRow>
      )}
    </>
  );
}

const DataTableHeader = ({ onClickColumn, sortDirection, sortField, visibleColumns }) => (
  <DataTableHead>
    <DataTableRow>
      {visibleColumns.map((c) => (
        <DataTableHeadCell
          key={c.key}
          align={c.alignHeader || c.align}
          isIconColumn={c.isIconColumn || !c.label}
          noMinWidth={c.noMinWidth}
          onClick={onClickColumn ? onClickColumn(c.sortField, c.sortOptions) : undefined}
          sortable={!!c.sortField}
          sorted={sortField && sortField === c.sortField ? sortDirection : ''}
          style={c.headStyle || {}}>
          <div>
            {c.sortField && (
              <SortIcon>
                {sortField === c.sortField && sortDirection === 'asc'
                  ? <TriangleDownIcon />
                  : <TriangleUpIcon />
                }
              </SortIcon>
            )}
            {c.label ? c.label : c.icon}
          </div>
        </DataTableHeadCell>
      ))}
    </DataTableRow>
  </DataTableHead>
);

const VirtualDataTableHeader = ({ onClickColumn, sortDirection, sortField, visibleColumns }) => (
  <VirtualDataTableHead>
    {visibleColumns.map((c) => (
      <VirtualDataTableHeadCell
        key={c.key}
        align={c.alignHeader || c.align}
        isIconColumn={c.isIconColumn || !c.label}
        noMinWidth={c.noMinWidth}
        onClick={onClickColumn ? onClickColumn(c.sortField, c.sortOptions) : undefined}
        sortable={!!c.sortField}
        sorted={sortField && sortField === c.sortField ? sortDirection : ''}
        style={c.headStyle || {}}>
        {c.sortField && (
          <SortIcon>
            {sortField === c.sortField && sortDirection === 'asc'
              ? <TriangleDownIcon />
              : <TriangleUpIcon />
            }
          </SortIcon>
        )}
        {c.label ? c.label : c.icon}
      </VirtualDataTableHeadCell>
    ))}
  </VirtualDataTableHead>
);

const VirtualDataTableRowRenderer = ({
  data,
  getRowProps,
  sortDirection,
  sortField,
  visibleColumns
}) => ({ index, style }) => {
  const row = data[index];
  const rowProps = (getRowProps ? getRowProps(row) : null) || {};

  return (
    <VirtualDataTableRow
      {...rowProps}
      ref={rowProps.setRef}
      isSelected={reactBool(rowProps?.isSelected)}
      onClick={rowProps?.onClick}
      style={style}>
      {visibleColumns.map((c) => (
        <VirtualDataTableCell
          key={c.key}
          align={c.alignBody || c.align}
          isIconColumn={c.isIconColumn || !c.label}
          noMinWidth={c.noMinWidth}
          sorted={sortField && sortField === c.sortField ? sortDirection : ''}
          style={c.bodyStyle || {}}>
          <CellInner wrap={reactBool(!!c.wrap)}>
            {c.selector(row, { expanded: false, ...rowProps })}
          </CellInner>
        </VirtualDataTableCell>
      ))}
    </VirtualDataTableRow>
  );
};

const DataTableComponent = ({
  columns,
  data,
  getRowProps = getEmptyObj,
  keyField,
  onClickColumn,
  sortField,
  sortDirection,
  sortOptions,
  virtualized,
  virtualizeThreshold = virtualizeThresholdDefault,
  virtualizedHeight = virtualizedHeightDefault
}) => {
  const tableData = data || [];
  const visibleColumns = useMemo(() => getVisibleColumns(columns), [columns]);
  const canVirtualize = !hasExpandableColumn(columns);
  const shouldVirtualize = canVirtualize
    && virtualized !== false
    && (virtualized === true || tableData.length > virtualizeThreshold);

  if (shouldVirtualize) {
    const listHeight = Math.min(virtualizedHeight, tableData.length * rowHeight);

    return (
      <VirtualDataTable>
        <VirtualDataTableHeader
          onClickColumn={onClickColumn}
          sortDirection={sortDirection}
          sortField={sortField}
          visibleColumns={visibleColumns} />
        <VirtualListWrapper>
          <FixedSizeList
            className="data-table-virtual-list"
            height={listHeight}
            itemCount={tableData.length}
            itemKey={(index) => keyField ? tableData[index]?.[keyField] : index}
            itemSize={rowHeight}
            overscanCount={8}
            width="100%">
            {VirtualDataTableRowRenderer({
              data: tableData,
              getRowProps,
              sortDirection,
              sortField,
              visibleColumns
            })}
          </FixedSizeList>
        </VirtualListWrapper>
      </VirtualDataTable>
    );
  }

  return (
    <DataTable>
      <DataTableHeader
        onClickColumn={onClickColumn}
        sortDirection={sortDirection}
        sortField={sortField}
        visibleColumns={visibleColumns} />
      <DataTableBody>
        {tableData.map((row, i) => (
          <ExpandableDataTableRow
            key={keyField ? row[keyField] : i}
            columns={columns}
            row={row}
            getRowProps={getRowProps}
            sortDirection={sortDirection}
            sortField={sortField}
            visibleColumns={visibleColumns} />
        ))}
      </DataTableBody>
    </DataTable>
  );
};

export default DataTableComponent;
