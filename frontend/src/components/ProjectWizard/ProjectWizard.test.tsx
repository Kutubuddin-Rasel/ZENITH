import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectWizard from './ProjectWizard';

// Mock the router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(() => 'mock-token'),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
global.fetch = jest.fn();

describe('ProjectWizard', () => {
  const mockOnClose = jest.fn();
  const mockOnProjectCreated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'project_name',
            question: 'What would you like to call your project?',
            type: 'text',
            required: true,
            order: 1,
            category: 'basic',
          },
          {
            id: 'team_size',
            question: 'How many people will be working on this project?',
            type: 'select',
            options: [
              { value: '1', label: 'Just me (1 person)' },
              { value: '2-5', label: 'Small team (2-5 people)' },
            ],
            required: true,
            order: 2,
            category: 'team',
          },
        ],
      }),
    });
  });

  it('renders wizard when open', () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    expect(screen.getByText('Project Setup Wizard')).toBeInTheDocument();
    expect(screen.getByText("Let's create the perfect project for your needs")).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ProjectWizard
        isOpen={false}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    expect(screen.queryByText('Project Setup Wizard')).not.toBeInTheDocument();
  });

  it('loads wizard questions on open', async () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/project-wizard/questions', {
        headers: {
          'Authorization': 'Bearer mock-token',
        },
      });
    });
  });

  it('shows progress bar with timer', async () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnProjectCreated}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
      expect(screen.getByText('0:00')).toBeInTheDocument();
    });
  });

  it('handles question answers correctly', async () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('What would you like to call your project?')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Enter your answer...');
    fireEvent.change(input, { target: { value: 'Test Project' } });

    expect(input).toHaveValue('Test Project');
  });

  it('shows template selection after questions', async () => {
    // Mock template recommendations
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'project_name',
              question: 'What would you like to call your project?',
              type: 'text',
              required: true,
              order: 1,
              category: 'basic',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            recommendations: [
              {
                template: {
                  id: 'template-1',
                  name: 'Software Development',
                  description: 'Complete agile workflow',
                  category: 'software_development',
                  methodology: 'agile',
                  icon: 'code',
                  color: '#3B82F6',
                  usageCount: 10,
                },
                score: 85,
                reasons: ['Perfect for software development'],
                confidence: 'high',
              },
            ],
            suggestedConfig: {},
          },
        }),
      });

    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    // Answer the question
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Enter your answer...');
      fireEvent.change(input, { target: { value: 'Test Project' } });
    });

    // Click next
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Should show template selection
    await waitFor(() => {
      expect(screen.getByText('Choose Your Project Template')).toBeInTheDocument();
    });
  });

  it('creates project when template is selected', async () => {
    // Mock the complete flow
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              id: 'project_name',
              question: 'What would you like to call your project?',
              type: 'text',
              required: true,
              order: 1,
              category: 'basic',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            recommendations: [
              {
                template: {
                  id: 'template-1',
                  name: 'Software Development',
                  description: 'Complete agile workflow',
                  category: 'software_development',
                  methodology: 'agile',
                  icon: 'code',
                  color: '#3B82F6',
                  usageCount: 10,
                },
                score: 85,
                reasons: ['Perfect for software development'],
                confidence: 'high',
              },
            ],
            suggestedConfig: {},
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'project-123',
            name: 'Test Project',
          },
        }),
      });

    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    // Complete the wizard flow
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Enter your answer...');
      fireEvent.change(input, { target: { value: 'Test Project' } });
    });

    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    await waitFor(() => {
      const templateCard = screen.getByText('Software Development');
      fireEvent.click(templateCard);
    });

    const createButton = screen.getByText('Create Project');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockOnProjectCreated).toHaveBeenCalledWith({
        id: 'project-123',
        name: 'Test Project',
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('shows error when API fails', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load wizard questions')).toBeInTheDocument();
    });
  });

  it('disables next button when required question is not answered', async () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeDisabled();
    });
  });

  it('enables next button when required question is answered', async () => {
    render(
      <ProjectWizard
        isOpen={true}
        onClose={mockOnClose}
        onProjectCreated={mockOnProjectCreated}
      />
    );

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Enter your answer...');
      fireEvent.change(input, { target: { value: 'Test Project' } });
    });

    await waitFor(() => {
      const nextButton = screen.getByText('Next');
      expect(nextButton).not.toBeDisabled();
    });
  });
});
