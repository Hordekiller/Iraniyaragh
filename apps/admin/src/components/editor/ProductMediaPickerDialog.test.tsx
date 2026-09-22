import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminProductMediaPickerItem } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import {
  ProductMediaPickerDialog,
  useProductMediaPicker,
} from './ProductMediaPickerDialog';
import type { MediaPickerItem } from '@/lib/editor/media-picker';

const listProductMediaPickerMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/catalog/media-api', () => ({
  listProductMediaPicker: listProductMediaPickerMock,
}));

const readyItems: AdminProductMediaPickerItem[] = [
  {
    id: 'm1',
    url: 'https://media.example/products/p1/r/r-1200.webp',
    alt: 'قفل اصلی',
    caption: 'نمای بالا',
    width: 1200,
    height: 900,
  },
  {
    id: 'm2',
    url: 'https://media.example/products/p1/r/r-800.jpg',
    alt: '',
    caption: null,
    width: 800,
    height: 600,
  },
];

const forbidden = () =>
  new ApiClientError({
    code: 'FORBIDDEN',
    message: 'Forbidden',
    requestId: 'r1',
    statusCode: 403,
  });

const renderDialog = (overrides: Partial<Parameters<typeof ProductMediaPickerDialog>[0]> = {}) => {
  const props = {
    open: true,
    productId: 'p1',
    onInsert: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<ProductMediaPickerDialog {...props} />);
  return props;
};

describe('ProductMediaPickerDialog', () => {
  afterEach(() => listProductMediaPickerMock.mockReset());

  it('renders nothing and skips the request while closed', async () => {
    renderDialog({ open: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listProductMediaPickerMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a loading progress until the picker projection resolves', () => {
    listProductMediaPickerMock.mockReturnValue(new Promise(() => undefined));
    renderDialog();
    expect(screen.getByTestId('media-picker-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('media-picker-grid')).toBeNull();
  });

  it('lists READY images in a single top-level dialog using only the public projection urls', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('media-picker-grid')).toBeInTheDocument());

    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    const options = screen.getAllByTestId('media-picker-option');
    expect(options).toHaveLength(2);
    const sources = options
      .flatMap((option) => Array.from(option.querySelectorAll('img')))
      .map((image) => image.getAttribute('src'));
    expect(sources).toEqual(readyItems.map((item) => item.url));
    expect(screen.getAllByText('نمای بالا')).toHaveLength(1);
  });

  it('never renders a private or presigned url', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    renderDialog();
    await waitFor(() => expect(screen.getByTestId('media-picker-grid')).toBeInTheDocument());

    const sources = screen
      .getAllByTestId('media-picker-option')
      .flatMap((option) => Array.from(option.querySelectorAll('img')))
      .map((image) => image.getAttribute('src') ?? '');
    expect(sources).toHaveLength(readyItems.length);
    for (const source of sources) {
      expect(source.startsWith('https://media.example/')).toBe(true);
      expect(source).not.toMatch(/X-Amz-Algorithm|X-Amz-Signature|X-Amz-Credential/i);
      expect(source).not.toMatch(/\bsignature\b|\bpresign\b/i);
    }
  });

  it('inserts the clicked media item with its picker contract fields', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    const onInsert = vi.fn();
    renderDialog({ onInsert });

    await waitFor(() => expect(screen.getAllByTestId('media-picker-option')).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId('media-picker-option')[0]!);

    expect(onInsert).toHaveBeenCalledWith(readyItems[0]);
  });

  it('cancels via the actions button', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    await waitFor(() => expect(screen.getByTestId('media-picker-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('explains the missing catalog.media.read permission on a 403 response', async () => {
    listProductMediaPickerMock.mockRejectedValue(forbidden());
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('media-picker-error')).toBeInTheDocument());
    expect(screen.getByText(/catalog\.media\.read/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument();
  });

  it('shows an error state and recovers on retry', async () => {
    listProductMediaPickerMock
      .mockRejectedValueOnce(new ApiClientError({ code: 'INTERNAL_ERROR', message: 'خطای سامانه', requestId: 'r2', statusCode: 500 }))
      .mockResolvedValueOnce(readyItems);
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('media-picker-error')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    await waitFor(() => expect(screen.getByTestId('media-picker-grid')).toBeInTheDocument());
    expect(listProductMediaPickerMock).toHaveBeenCalledTimes(2);
  });

  it('reports an empty state when the product has no ready images', async () => {
    listProductMediaPickerMock.mockResolvedValue([]);
    renderDialog();

    await waitFor(() => expect(screen.getByTestId('media-picker-empty')).toBeInTheDocument());
    expect(screen.getByText('تصویری برای انتخاب وجود ندارد')).toBeInTheDocument();
    expect(screen.queryByTestId('media-picker-grid')).toBeNull();
  });
});

describe('useProductMediaPicker', () => {
  const Harness = ({
    productId,
    onInsert,
    onCancel,
  }: {
    productId?: string;
    onInsert: (item: MediaPickerItem) => void;
    onCancel: () => void;
  }) => {
    const { handle, host } = useProductMediaPicker(productId);
    return (
      <div>
        {host}
        <button onClick={() => handle?.open({ onInsert, onCancel })}>open</button>
      </div>
    );
  };

  afterEach(() => listProductMediaPickerMock.mockReset());

  it('yields no handle and no host without a product id', () => {
    const { result } = renderHook(() => useProductMediaPicker(undefined));
    expect(result.current.handle).toBeUndefined();
    expect(result.current.host).toBeNull();
  });

  it('opens the real product media dialog through the handle and inserts the chosen item', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    const onInsert = vi.fn();
    render(
      <Harness productId="p1" onInsert={onInsert} onCancel={() => undefined} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByTestId('product-media-picker-dialog')).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByTestId('media-picker-option')).toHaveLength(2));
    fireEvent.click(screen.getAllByTestId('media-picker-option')[0]!);

    expect(onInsert).toHaveBeenCalledWith(readyItems[0]);
    await waitFor(() =>
      expect(screen.queryByTestId('product-media-picker-dialog')).not.toBeInTheDocument(),
    );
  });

  it('forwards cancel through the handle and closes the dialog without inserting', async () => {
    listProductMediaPickerMock.mockResolvedValue(readyItems);
    const onCancel = vi.fn();
    render(
      <Harness productId="p1" onInsert={() => undefined} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() => expect(screen.getByTestId('media-picker-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByTestId('product-media-picker-dialog')).not.toBeInTheDocument(),
    );
  });
});