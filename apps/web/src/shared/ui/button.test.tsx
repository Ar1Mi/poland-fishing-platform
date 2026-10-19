import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('is a 48 px primary button by default', () => {
    render(<Button>Zapisz</Button>);

    const button = screen.getByRole('button', { name: 'Zapisz' });
    expect(button).toHaveClass('h-12', 'bg-primary');
  });

  it('renders the accent variant with the accent colour', () => {
    render(<Button variant="accent">Kup zezwolenie</Button>);

    expect(screen.getByRole('button', { name: 'Kup zezwolenie' })).toHaveClass('bg-accent');
  });

  it('styles its child element instead of a button with asChild', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/">Start</a>
      </Button>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Start' })).toHaveClass('border-primary');
  });
});
