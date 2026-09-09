'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Checkbox,
  Paper,
  TableCellProps,
  TextField,
  InputAdornment,
  Skeleton,
  TablePaginationProps,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemText,
} from '@mui/material';
import { Search, Inbox, X, Columns3 } from 'lucide-react';
import { EmptyState } from './EmptyState';

export type DataTableColumn<T> = {
  id: string;
  label: string;
  align?: TableCellProps['align'];
  width?: number | string;
  sortable?: boolean;
  /** Render the cell value. */
  render: (row: T) => ReactNode;
  /** Optional client sort comparator. */
  sortFn?: (a: T, b: T) => number;
  /** Value used for client search; defaults to `String(value)`. */
  searchValue?: (row: T) => string;
  /**
   * Whether the column can be hidden via the column-visibility menu.
   * Defaults to `true`. At least one column always stays visible.
   */
  hideable?: boolean;
};

export type SortState = { columnId: string; direction: 'asc' | 'desc' } | null;
export type SortChange = { columnId: string; direction: 'asc' | 'desc' };

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  /** Selection state (controlled). */
  selected?: Set<string | number>;
  onSelectionChange?: (selected: Set<string | number>) => void;
  selectable?: boolean;
  /** Visible, accessible heading for the table (sr-only caption). */
  caption?: string;
  /**
   * Enable client-side search/sort/pagination (interim convenience, ADR-0008).
   * Production collections should use the server-mode callbacks instead.
   */
  enableClientView?: boolean;
  /** Client-only: which column ids participate in the search box. */
  searchKeys?: string[];
  /** Server-controlled search text. */
  search?: string;
  onSearchChange?: (search: string) => void;
  searchPlaceholder?: string;
  /** Optional additional toolbar content rendered next to the search box. */
  toolbar?: ReactNode;
  /** Server-controlled sort. */
  sort?: SortState;
  onSortChange?: (sort: SortChange) => void;
  rowCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  onRowClick?: (row: T) => void;
  bulkActions?: ReactNode;
  /** Render an end (left-aligned in RTL) actions cell per row. */
  actions?: (row: T) => ReactNode;
  /** Visible heading for the actions column. Defaults to `عملیات`. */
  actionsLabel?: string;
};

const ROWS_PER_PAGE_OPTIONS = [5, 10, 25, 50];

function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyTitle = 'موردی یافت نشد',
  emptyDescription,
  emptyIcon,
  selected,
  onSelectionChange,
  selectable = false,
  caption,
  enableClientView = false,
  searchKeys = [],
  search: controlledSearch,
  onSearchChange,
  searchPlaceholder = 'جستجو...',
  toolbar,
  sort,
  onSortChange,
  rowCount,
  page,
  pageSize,
  onPageChange,
  onRowClick,
  bulkActions,
  actions,
  actionsLabel = 'عملیات',
}: DataTableProps<T>) {
  const inputId = useId();
  const [clientSort, setClientSort] = useState<SortState>(null);
  const [clientPage, setClientPage] = useState(0);
  const [clientPageSize, setClientPageSize] = useState(10);
  const [clientSearch, setClientSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null);

  const hideableColumns = useMemo(
    () => columns.filter((col) => col.hideable !== false),
    [columns],
  );
  const columnsKey = useMemo(() => columns.map((col) => col.id).join('|'), [columns]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(
    () => new Set(hideableColumns.map((col) => col.id)),
  );

  // Keep visibility in sync when the column set changes upstream.
  useEffect(() => {
    const next = new Set<string>();
    for (const col of hideableColumns) {
      if (visibleColumnIds.has(col.id)) next.add(col.id);
    }
    if (next.size === 0 || next.size < hideableColumns.length) {
      setVisibleColumnIds(new Set(hideableColumns.map((col) => col.id)));
      return;
    }
    setVisibleColumnIds(next);
  }, [columnsKey]);

  const toggleColumn = (id: string) => {
    setVisibleColumnIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        // Keep at least one column visible.
        if (next.size === 1) return current;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const visibleColumns = useMemo(
    () => columns.filter((col) => visibleColumnIds.has(col.id)),
    [columns, visibleColumnIds],
  );

  const hasColumnMenu = hideableColumns.length > 0;
  const totalColSpan = visibleColumns.length + (selectable ? 1 : 0) + (actions ? 1 : 0);

  const isServer = !enableClientView;
  const showSearch = enableClientView
    ? searchKeys.length > 0
    : typeof onSearchChange === 'function';

  const debouncedServerSearch = useRef(
    onSearchChange ? debounce(onSearchChange, 300) : undefined,
  ).current;

  const lastControlledSearch = useRef(controlledSearch);
  useEffect(() => {
    if (controlledSearch === lastControlledSearch.current) return;
    lastControlledSearch.current = controlledSearch;
    if (typeof controlledSearch === 'string') {
      setSearchInput(controlledSearch);
      if (enableClientView) setClientSearch(controlledSearch);
    }
  }, [controlledSearch, enableClientView]);

  // --- client-side view transformation (interim, ADR-0008) ---
  const clientFiltered = useMemo(() => {
    if (!enableClientView) return rows;
    const q = clientSearch.trim().toLocaleLowerCase('fa');
    if (!q) return rows;
    const activeCols = columns.filter((c) => c.id === 'search' || searchKeys.includes(c.id));
    const keys = activeCols.length > 0 ? activeCols : columns;
    return rows.filter((row) =>
      keys.some((col) => {
        const value = col.searchValue
          ? col.searchValue(row)
          : (row as Record<string, unknown>)[col.id];
        const s = value == null ? '' : String(value);
        return s.toLocaleLowerCase('fa').includes(q);
      }),
    );
  }, [rows, clientSearch, enableClientView, columns, searchKeys]);

  const clientSorted = useMemo(() => {
    if (!enableClientView || !clientSort) return clientFiltered;
    const col = columns.find((c) => c.id === clientSort.columnId);
    if (!col?.sortFn) return clientFiltered;
    const fn = col.sortFn;
    return [...clientFiltered].sort((a, b) =>
      clientSort.direction === 'asc' ? fn(a, b) : -fn(a, b),
    );
  }, [clientFiltered, clientSort, enableClientView, columns]);

  const clientPaged = useMemo(() => {
    if (!enableClientView) return clientSorted;
    const start = clientPage * clientPageSize;
    return clientSorted.slice(start, start + clientPageSize);
  }, [clientSorted, enableClientView, clientPage, clientPageSize]);

  const clientCount = enableClientView ? clientSorted.length : (rowCount ?? 0);
  const effectivePage = isServer ? (page ?? 0) : clientPage;
  const effectivePageSize = isServer ? (pageSize ?? 10) : clientPageSize;
  const visibleRows = isServer ? rows : clientPaged;

  const activeColumnId = isServer ? (sort?.columnId ?? '') : (clientSort?.columnId ?? '');
  const activeDirection = (isServer ? sort?.direction : clientSort?.direction) ?? 'asc';

  const allVisibleKeys = visibleRows.map(rowKey);
  const allVisibleSelected = selectable
    ? allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected?.has(k))
    : false;
  const someVisibleSelected = selectable
    ? allVisibleKeys.some((k) => selected?.has(k))
    : false;

  const handleSearchInput = (value: string) => {
    setSearchInput(value);
    if (enableClientView) {
      setClientSearch(value);
      setClientPage(0);
    } else {
      debouncedServerSearch?.(value);
    }
  };

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.sortable) return;
    const isDesc = activeColumnId === col.id && activeDirection === 'asc';
    const next: SortChange = { columnId: col.id, direction: isDesc ? 'desc' : 'asc' };
    if (isServer) {
      onSortChange?.(next);
    } else {
      setClientSort(next);
      setClientPage(0);
    }
  };

  const handleSelectRow = (key: string | number, checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selected ?? []);
    if (checked) next.add(key);
    else next.delete(key);
    onSelectionChange(next);
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    const next = new Set(selected ?? []);
    allVisibleKeys.forEach((k) => (checked ? next.add(k) : next.delete(k)));
    onSelectionChange(next);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    if (isServer) onPageChange?.(newPage, effectivePageSize);
    else setClientPage(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextSize = parseInt(e.target.value, 10);
    if (isServer) onPageChange?.(0, nextSize);
    else {
      setClientPageSize(nextSize);
      setClientPage(0);
    }
  };

  const paginationProps: TablePaginationProps = {
    component: 'div',
    count: clientCount,
    page: effectivePage,
    onPageChange: handlePageChange,
    rowsPerPage: effectivePageSize,
    onRowsPerPageChange: handleRowsPerPageChange,
    rowsPerPageOptions: ROWS_PER_PAGE_OPTIONS,
  };

  return (
    <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', bgcolor: 'background.paper' }}>
      {(selectable && selected && selected.size > 0) || toolbar || showSearch || hasColumnMenu ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
            {showSearch ? (
              <TextField
                id={inputId}
                size="small"
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                inputProps={{ 'aria-label': 'جستجو' }}
                sx={{ minWidth: 220, maxWidth: 360 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={18} />
                    </InputAdornment>
                  ),
                  endAdornment: searchInput ? (
                    <InputAdornment position="end">
                      <Box
                        component="button"
                        type="button"
                        aria-label="پاک کردن جستجو"
                        onClick={() => handleSearchInput('')}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          bgcolor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'text.secondary',
                          p: 0.25,
                        }}
                      >
                        <X size={16} />
                      </Box>
                    </InputAdornment>
                  ) : null,
                }}
              />
            ) : null}
            {toolbar}
          </Box>
          {hasColumnMenu ? (
            <>
              <Tooltip title="نمایش یا پنهان کردن ستون‌ها">
                <IconButton
                  size="small"
                  onClick={(e) => setColumnMenuAnchor(e.currentTarget)}
                  aria-label="مدیریت ستون‌ها"
                  sx={{ border: '1px solid', borderColor: 'divider', color: 'text.secondary' }}
                >
                  <Columns3 size={17} />
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={columnMenuAnchor}
                open={Boolean(columnMenuAnchor)}
                onClose={() => setColumnMenuAnchor(null)}
              >
                {hideableColumns.map((col) => {
                  const visible = visibleColumnIds.has(col.id);
                  const only = visible && visibleColumnIds.size === 1;
                  return (
                    <MenuItem
                      key={col.id}
                      dense
                      disabled={only}
                      onClick={() => {
                        toggleColumn(col.id);
                        setColumnMenuAnchor(null);
                      }}
                      sx={{ '&.Mui-disabled': { opacity: 0.5 } }}
                    >
                      <Checkbox size="small" checked={visible} />
                      <ListItemText>{col.label}</ListItemText>
                    </MenuItem>
                  );
                })}
              </Menu>
            </>
          ) : null}
          {selected && selected.size > 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{selected.size} مورد انتخاب شد</Box>
              {bulkActions ? <Box sx={{ display: 'flex', gap: 1 }}>{bulkActions}</Box> : null}
            </Box>
          ) : null}
        </Box>
      ) : null}

      <TableContainer sx={{ maxHeight: 520 }}>
        <Table stickyHeader size="small" sx={{ minWidth: 720 }}>
          <Box
            component="caption"
            sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
          >
            {caption ?? 'جدول داده'}
          </Box>
          <TableHead>
            <TableRow>
              {selectable ? (
                <TableCell padding="checkbox" sx={{ width: 44 }}>
                  <Checkbox
                    size="small"
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    checked={allVisibleSelected}
                    disabled={loading || allVisibleKeys.length === 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    inputProps={{ 'aria-label': 'انتخاب همه ردیف‌ها' }}
                  />
                </TableCell>
              ) : null}
              {visibleColumns.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align}
                  sx={{ width: col.width, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {col.sortable ? (
                    <TableSortLabel
                      active={activeColumnId === col.id}
                      direction={activeColumnId === col.id ? activeDirection : 'asc'}
                      onClick={() => handleSort(col)}
                    >
                      {col.label}
                    </TableSortLabel>
                  ) : (
                    col.label
                  )}
                </TableCell>
              ))}
              {actions ? (
                <TableCell align="left" sx={{ fontWeight: 700, whiteSpace: 'nowrap', width: 1 }}>
                  {actionsLabel}
                </TableCell>
              ) : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {selectable ? (
                    <TableCell padding="checkbox">
                      <Skeleton variant="circular" width={20} height={20} />
                    </TableCell>
                  ) : null}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.id} align={col.align}>
                      <Skeleton width="85%" height={20} />
                    </TableCell>
                  ))}
                  {actions ? (
                    <TableCell>
                      <Skeleton width={60} height={20} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={totalColSpan}>
                  <EmptyState
                    icon={emptyIcon ?? <Inbox size={28} />}
                    title="خطا در بارگیری داده‌ها"
                    description={error}
                  />
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalColSpan}>
                  <EmptyState
                    icon={emptyIcon ?? <Inbox size={28} />}
                    title={emptyTitle}
                    description={emptyDescription}
                  />
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => {
                const key = rowKey(row);
                const isSelected = selected?.has(key) ?? false;
                const firstCell = visibleColumns[0]?.render(row);
                const firstColLabel =
                  typeof firstCell === 'string' ? firstCell : (visibleColumns[0]?.label ?? '');
                return (
                  <TableRow
                    key={key}
                    hover
                    selected={isSelected}
                    onClick={() => onRowClick?.(row)}
                    sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    {selectable ? (
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(key, e.target.checked)}
                          inputProps={{ 'aria-label': `انتخاب ردیف ${String(key)} (${firstColLabel})` }}
                        />
                      </TableCell>
                    ) : null}
                    {visibleColumns.map((col) => (
                      <TableCell key={col.id} align={col.align}>
                        {col.render(row)}
                      </TableCell>
                    ))}
                    {actions ? (
                      <TableCell align="left" sx={{ width: 1, whiteSpace: 'nowrap' }}>
                        {actions(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination {...paginationProps} labelRowsPerPage="ردیف در صفحه" />
    </Paper>
  );
}
