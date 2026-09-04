import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FeedbackProvider, useFeedback } from '../FeedbackProvider';
import Button from '@mui/material/Button';

function TestButton({ onClick }: { onClick: () => void }) {
  return <Button onClick={onClick}>show</Button>;
}

function TestConsumer() {
  const feedback = useFeedback();
  return (
    <TestButton onClick={() => feedback.success('عملیات موفق بود')} />
  );
}

describe('FeedbackProvider', () => {
  it('renders children', () => {
    render(
      <FeedbackProvider>
        <div>child content</div>
      </FeedbackProvider>,
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('shows a success snackbar when feedback.success is called', () => {
    render(
      <FeedbackProvider>
        <TestConsumer />
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('عملیات موفق بود')).toBeInTheDocument();
  });

  it('shows error feedback', () => {
    function ErrorButton() {
      const feedback = useFeedback();
      return <TestButton onClick={() => feedback.error('خطا رخ داد')} />;
    }

    render(
      <FeedbackProvider>
        <ErrorButton />
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('خطا رخ داد')).toBeInTheDocument();
  });

  it('dismisses snackbar when close button is clicked', () => {
    render(
      <FeedbackProvider>
        <TestConsumer />
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('عملیات موفق بود')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(screen.queryByText('عملیات موفق بود')).not.toBeInTheDocument();
  });

  it('queues multiple feedbacks', () => {
    function MultiButton() {
      const feedback = useFeedback();
      return (
        <>
          <TestButton onClick={() => feedback.success('اول')} />
          <Button onClick={() => feedback.error('دوم')}>show-error</Button>
        </>
      );
    }

    render(
      <FeedbackProvider>
        <MultiButton />
      </FeedbackProvider>,
    );

    fireEvent.click(screen.getByText('show'));
    expect(screen.getByText('اول')).toBeInTheDocument();

    fireEvent.click(screen.getByText('show-error'));
    // First message should still be visible (queued)
    expect(screen.getByText('اول')).toBeInTheDocument();

    // Dismiss first
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.getByText('دوم')).toBeInTheDocument();
  });
});
