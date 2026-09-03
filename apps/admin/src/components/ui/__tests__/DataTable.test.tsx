import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from '../DataTable';

type TestRow = { id: number; name: string; status: string };

const columns: DataTableColumn<TestRow>[] = [
  { id: 'name', label: 'نام', render: (row) => row.name, sortable: true, sortFn: (a, b) => a.name.localeCompare(b.name, 'fa') },
  { id: 'status', label: 'وضعیت', render: (row) => row.status },
];

const rows: TestRow[] = [
  { id: 1, name: 'محصول اول', status: 'فعال' },
  { id: 2, name: 'محصول دوم', status: 'غیرفعال' },
  { id: 3, name: 'محصول سوم', status: 'فعال' },
];

function renderClientTable(props: Partial<React.ComponentProps<typeof DataTable<TestRow>>> = {}) {
  return render(
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      enableClientView
      searchKeys={['name']}
      caption="لیست محصولات"
      {...props}
    />,
  );
}

describe('DataTable', () => {
  it('renders table with rows', () => {
    renderClientTable();
    expect(screen.getByText('نام')).toBeInTheDocument();
    expect(screen.getByText('وضعیت')).toBeInTheDocument();
    expect(screen.getByText('محصول اول')).toBeInTheDocument();
    expect(screen.getByText('محصول دوم')).toBeInTheDocument();
    expect(screen.getByText('محصول سوم')).toBeInTheDocument();
  });

  it('renders caption for screen readers', () => {
    renderClientTable();
    expect(screen.getByText('لیست محصولات')).toBeInTheDocument();
  });

  it('shows search box when searchKeys provided', () => {
    renderClientTable();
    expect(screen.getByRole('textbox', { name: 'جستجو' })).toBeInTheDocument();
  });

  it('filters rows based on search input', () => {
    renderClientTable();

    const searchInput = screen.getByRole('textbox', { name: 'جستجو' });
    fireEvent.change(searchInput, { target: { value: 'دوم' } });

    expect(screen.queryByText('محصول اول')).not.toBeInTheDocument();
    expect(screen.getByText('محصول دوم')).toBeInTheDocument();
    expect(screen.queryByText('محصول سوم')).not.toBeInTheDocument();
  });

  it('clears search when clear button is clicked', () => {
    renderClientTable();

    const searchInput = screen.getByRole('textbox', { name: 'جستجو' });
    fireEvent.change(searchInput, { target: { value: 'دوم' } });
    expect(screen.queryByText('محصول اول')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'پاک کردن جستجو' }));
    expect(searchInput).toHaveValue('');
    expect(screen.getByText('محصول اول')).toBeInTheDocument();
  });

  it('shows sort label for sortable columns', () => {
    renderClientTable();
    expect(screen.getByRole('button', { name: /نام/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /وضعیت/ })).not.toBeInTheDocument();
  });

  it('sorts rows when sort label is clicked', () => {
    renderClientTable();

    const sortButton = screen.getByRole('button', { name: /نام/ });
    fireEvent.click(sortButton);

    const product1 = screen.getByText('محصول اول').closest('tr') as HTMLElement;
    const product2 = screen.getByText('محصول دوم').closest('tr') as HTMLElement;
    const product3 = screen.getByText('محصول سوم').closest('tr') as HTMLElement;

    expect(product1.compareDocumentPosition(product2)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(product2.compareDocumentPosition(product3)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('shows loading skeleton', () => {
    renderClientTable({ loading: true });
    // Skeleton rows are rendered, but actual data is not
    expect(screen.queryByText('محصول اول')).not.toBeInTheDocument();
    expect(screen.queryByText('محصول دوم')).not.toBeInTheDocument();
    expect(screen.queryByText('محصول سوم')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    renderClientTable({ loading: false, error: 'خطا در اتصال' });
    expect(screen.getByText('خطا در بارگیری داده‌ها')).toBeInTheDocument();
    expect(screen.getByText('خطا در اتصال')).toBeInTheDocument();
  });

  it('shows empty state when no rows', () => {
    renderClientTable({ rows: [] });
    expect(screen.getByText('موردی یافت نشد')).toBeInTheDocument();
  });

  it('shows empty state with custom title', () => {
    renderClientTable({ rows: [], emptyTitle: 'داده‌ای وجود ندارد' });
    expect(screen.getByText('داده‌ای وجود ندارد')).toBeInTheDocument();
  });

  it('supports row selection', () => {
    const onSelectionChange = vi.fn();
    renderClientTable({ selectable: true, selected: new Set(), onSelectionChange });

    const checkboxes = screen.getAllByRole('checkbox');
    // checkboxes[0] = select all, checkboxes[1..3] = row checkboxes
    fireEvent.click(checkboxes[1]);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([1]));
  });

  it('select all toggles all visible rows', () => {
    const onSelectionChange = vi.fn();
    renderClientTable({ selectable: true, selected: new Set(), onSelectionChange });

    const selectAll = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAll);

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([1, 2, 3]));
  });

  it('shows pagination', () => {
    renderClientTable();
    expect(screen.getByText('ردیف در صفحه')).toBeInTheDocument();
  });

  it('does not show search box when searchKeys is empty and no onSearchChange', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} enableClientView searchKeys={[]} />);
    expect(screen.queryByRole('textbox', { name: 'جستجو' })).not.toBeInTheDocument();
  });

  it('per-row checkbox has row-specific aria-label', () => {
    renderClientTable({ selectable: true, selected: new Set(), onSelectionChange: vi.fn() });
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all"
    expect(checkboxes[0]).toHaveAttribute('aria-label', 'انتخاب همه ردیف‌ها');
    // Row checkboxes
    expect(checkboxes[1]).toHaveAttribute('aria-label');
    expect(checkboxes[1].getAttribute('aria-label')).toContain('1');
  });
});
