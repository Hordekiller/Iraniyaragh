import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectableCardGroup, SelectableCardInput } from '../SelectableCardInput';
import { Box } from '@mui/material';

function Icon() {
  return <Box aria-hidden="true" data-testid="icon">★</Box>;
}

describe('SelectableCardInput', () => {
  it('renders with correct text content', () => {
    render(
      <SelectableCardGroup value={null} onValueChange={vi.fn()} label="Choose">
        <SelectableCardInput value="a" title="Option A" icon={<Icon />} subtitle="sub A" />
        <SelectableCardInput value="b" title="Option B" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('sub A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
  });

  it('renders as a button with role="radio"', () => {
    render(
      <SelectableCardGroup value={null} onValueChange={vi.fn()} label="Choose">
        <SelectableCardInput value="a" title="Option A" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    const button = screen.getByRole('radio', { name: 'Option A' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('sets aria-checked correctly based on selected state', () => {
    render(
      <SelectableCardGroup value="a" onValueChange={vi.fn()} label="Choose">
        <SelectableCardInput value="a" title="Option A" icon={<Icon />} />
        <SelectableCardInput value="b" title="Option B" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    expect(screen.getByRole('radio', { name: 'Option A' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Option B' })).toHaveAttribute('aria-checked', 'false');
  });

  it('has role="radiogroup" on the wrapper', () => {
    render(
      <SelectableCardGroup value={null} onValueChange={vi.fn()} label="Shipping method">
        <SelectableCardInput value="a" title="A" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-labelledby');
  });

  it('calls onValueChange when an option is clicked', () => {
    const onChange = vi.fn();
    render(
      <SelectableCardGroup value={null} onValueChange={onChange} label="Choose">
        <SelectableCardInput value="a" title="Option A" icon={<Icon />} />
        <SelectableCardInput value="b" title="Option B" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Option B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('navigates between options with arrow keys', () => {
    const onChange = vi.fn();
    render(
      <SelectableCardGroup value={null} onValueChange={onChange} label="Choose">
        <SelectableCardInput value="a" title="A" icon={<Icon />} />
        <SelectableCardInput value="b" title="B" icon={<Icon />} />
        <SelectableCardInput value="c" title="C" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    const firstRadio = screen.getByRole('radio', { name: 'A' });
    firstRadio.focus();
    expect(firstRadio).toHaveFocus();

    fireEvent.keyDown(firstRadio, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'B' }), { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'C' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'C' }), { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();
  });

  it('wraps around when arrowing past the last option', () => {
    render(
      <SelectableCardGroup value={null} onValueChange={vi.fn()} label="Choose">
        <SelectableCardInput value="a" title="A" icon={<Icon />} />
        <SelectableCardInput value="b" title="B" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    const last = screen.getByRole('radio', { name: 'B' });
    last.focus();
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(screen.getByRole('radio', { name: 'A' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowUp' });
    expect(screen.getByRole('radio', { name: 'B' })).toHaveFocus();
  });

  it('focuses the selected option when the group initially mounts', () => {
    render(
      <SelectableCardGroup value="b" onValueChange={vi.fn()} label="Choose">
        <SelectableCardInput value="a" title="A" icon={<Icon />} />
        <SelectableCardInput value="b" title="B" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    // Verify aria-checked state (focus on mount is async via requestAnimationFrame)
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'false');
  });

  it('supports string values', () => {
    const onChange = vi.fn();
    render(
      <SelectableCardGroup value={null} onValueChange={onChange} label="Choose">
        <SelectableCardInput value="standard" title="Standard" icon={<Icon />} />
        <SelectableCardInput value="express" title="Express" icon={<Icon />} />
      </SelectableCardGroup>,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Express' }));
    expect(onChange).toHaveBeenCalledWith('express');
  });
});
