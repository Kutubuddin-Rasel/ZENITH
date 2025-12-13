import { render, screen } from '@testing-library/react';
import Hero from '../Hero';

// Mock Next/Link since it's used in the component
jest.mock('next/link', () => {
    const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => {
        return <a href={href}>{children}</a>;
    };
    MockLink.displayName = 'MockLink';
    return MockLink;
});

describe('Hero Component', () => {
    it('renders the main heading', () => {
        render(<Hero />);
        expect(screen.getByText(/Ship projects/i)).toBeInTheDocument();
        expect(screen.getByText(/2x faster/i)).toBeInTheDocument();
    });

    it('renders the CTA button', () => {
        render(<Hero />);
        // There are two "Create Workspace" buttons (one in hero, one in nav if included, but Hero is isolated here)
        // Actually Hero has one "Create Workspace" button.
        const buttons = screen.getAllByText(/Create Workspace/i);
        expect(buttons.length).toBeGreaterThan(0);
    });
});
