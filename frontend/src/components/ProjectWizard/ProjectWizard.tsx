"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../Card';
import Button from '../Button';
import Input from '../Input';
import Label from '../Label';
import Spinner from '../Spinner';
import AIProjectChat from './AIProjectChat';
import { WizardAnalytics } from '@/lib/analytics';
import { safeLocalStorage } from '@/lib/safe-local-storage';
import { apiFetch } from '@/lib/fetcher';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  SparklesIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  CogIcon,
  QueueListIcon
} from '@heroicons/react/24/outline';

// Helper to check if a template ID is a fallback (not a real database UUID)
// Fallback templates use descriptive IDs like 'software-agile' instead of UUIDs
const isFallbackTemplate = (templateId: string): boolean => {
  // UUIDs have a specific format: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return !uuidRegex.test(templateId);
};

interface WizardQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string; description?: string }>;
  required: boolean;
  order: number;
  category: string;
}

interface WizardResponse {
  questionId: string;
  answer: string | string[] | number | boolean;
  timestamp: Date;
}

interface TemplateRecommendation {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
    methodology: string;
    icon: string;
    color: string;
    usageCount: number;
  };
  score: number;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
}

interface Project {
  id: string;
  name: string;
  description?: string;
  key: string;
  type: string;
  methodology: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}

const ProjectWizard: React.FC<ProjectWizardProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, string | number | boolean>>({});
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loadingState, setLoadingState] = useState<{
    isLoading: boolean;
    action: 'questions' | 'recommendations' | 'creating' | null;
    message: string;
  }>({ isLoading: false, action: null, message: '' });
  const [error, setError] = useState<string>('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [wizardMode, setWizardMode] = useState<'ai' | 'classic'>('ai');

  // Legacy loading state for backward compatibility
  const loading = loadingState.isLoading;
  const setLoading = (isLoading: boolean) =>
    setLoadingState((prev) => ({ ...prev, isLoading, action: isLoading ? prev.action : null }));

  // LocalStorage key for persisting wizard progress
  const WIZARD_STORAGE_KEY = 'zenith_wizard_progress';

  // Save progress to localStorage whenever responses or step changes
  useEffect(() => {
    if (questions.length > 0 && Object.keys(responses).length > 0) {
      const progress = {
        currentStep,
        responses,
        selectedTemplate,
        timestamp: Date.now(),
      };
      try {
        safeLocalStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(progress));
      } catch {
        // localStorage may be full or disabled
      }
    }
  }, [currentStep, responses, selectedTemplate, questions.length]);

  // Restore progress from localStorage on initial load
  useEffect(() => {
    if (isOpen) {
      setStartTime(new Date());
      WizardAnalytics.wizardOpened();
      // Try to restore saved progress
      try {
        const saved = safeLocalStorage.getItem(WIZARD_STORAGE_KEY);
        if (saved) {
          const progress = JSON.parse(saved);
          // Only restore if saved within the last 24 hours
          const isRecent = Date.now() - progress.timestamp < 24 * 60 * 60 * 1000;
          if (isRecent && progress.responses) {
            setResponses(progress.responses);
            if (progress.selectedTemplate) {
              setSelectedTemplate(progress.selectedTemplate);
            }
            // Don't restore step until questions are loaded
          }
        }
      } catch {
        // Invalid saved data, ignore
      }

      loadWizardQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Restore step after questions are loaded (if we have saved progress)
  useEffect(() => {
    if (questions.length > 0) {
      try {
        const saved = safeLocalStorage.getItem(WIZARD_STORAGE_KEY);
        if (saved) {
          const progress = JSON.parse(saved);
          const isRecent = Date.now() - progress.timestamp < 24 * 60 * 60 * 1000;
          if (isRecent && progress.currentStep !== undefined && progress.currentStep < questions.length) {
            setCurrentStep(progress.currentStep);
          }
        }
      } catch {
        // Invalid saved data, ignore
      }
    }
  }, [questions.length]);

  // Clear saved progress when wizard completes successfully
  const clearSavedProgress = () => {
    try {
      safeLocalStorage.removeItem(WIZARD_STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  };

  // Timer effect
  useEffect(() => {
    if (startTime) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((new Date().getTime() - startTime.getTime()) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [startTime]);

  const loadWizardQuestions = async () => {
    try {
      setLoadingState({ isLoading: true, action: 'questions', message: 'Loading wizard questions...' });

      // Try to fetch questions from API
      try {
        const data = await apiFetch<{ data: WizardQuestion[] }>('/api/project-wizard/questions');
        // Check if data.data is an array and has items
        if (Array.isArray(data.data) && data.data.length > 0) {
          setQuestions(data.data);
        } else {
          // If empty array, throw to trigger fallback
          throw new Error('No questions returned from API');
        }
      } catch {
        // API not available, using fallback questions

        // Fallback questions if API is not available
        const fallbackQuestions: WizardQuestion[] = [
          {
            id: 'projectName',
            question: 'What would you like to call your project?',
            type: 'text',
            required: true,
            order: 1,
            category: 'basic',
          },
          {
            id: 'description',
            question: 'Briefly describe what this project is about',
            type: 'text',
            required: false,
            order: 2,
            category: 'basic',
          },
          {
            id: 'teamSize',
            question: 'How many people will be working on this project?',
            type: 'select',
            options: [
              { value: '1', label: 'Just me (1 person)' },
              { value: '2-5', label: 'Small team (2-5 people)' },
              { value: '6-10', label: 'Medium team (6-10 people)' },
              { value: '11-20', label: 'Large team (11-20 people)' },
              { value: '20+', label: 'Very large team (20+ people)' },
            ],
            required: true,
            order: 3,
            category: 'team',
          },
          {
            id: 'timeline',
            question: 'What\'s your project timeline?',
            type: 'select',
            options: [
              { value: 'short', label: 'Quick project (1-3 months)' },
              { value: 'medium', label: 'Medium project (3-6 months)' },
              { value: 'long', label: 'Long-term project (6+ months)' },
            ],
            required: true,
            order: 4,
            category: 'timeline',
          },
          {
            id: 'industry',
            question: 'What industry or domain is this project for?',
            type: 'select',
            options: [
              { value: 'software_development', label: 'Software Development' },
              { value: 'marketing', label: 'Marketing & Advertising' },
              { value: 'product_launch', label: 'Product Launch' },
              { value: 'research', label: 'Research & Development' },
              { value: 'event_planning', label: 'Event Planning' },
              { value: 'website_development', label: 'Website Development' },
              { value: 'mobile_development', label: 'Mobile App Development' },
              { value: 'data_analysis', label: 'Data Analysis' },
              { value: 'design', label: 'Design & Creative' },
              { value: 'sales', label: 'Sales & Business' },
              { value: 'other', label: 'Other' },
            ],
            required: true,
            order: 5,
            category: 'industry',
          },
          {
            id: 'methodology',
            question: 'Which project methodology do you prefer?',
            type: 'select',
            options: [
              { value: 'agile', label: 'Agile', description: 'Iterative and flexible approach' },
              { value: 'scrum', label: 'Scrum', description: 'Structured sprints with defined roles' },
              { value: 'kanban', label: 'Kanban', description: 'Continuous flow with visual boards' },
              { value: 'waterfall', label: 'Waterfall', description: 'Sequential phases' },
              { value: 'hybrid', label: 'Hybrid', description: 'Mix of methodologies' },
            ],
            required: true,
            order: 6,
            category: 'methodology',
          },
          {
            id: 'complexity',
            question: 'How complex is this project?',
            type: 'select',
            options: [
              { value: 'simple', label: 'Simple', description: 'Straightforward with clear requirements' },
              { value: 'moderate', label: 'Moderate', description: 'Some complexity with changing requirements' },
              { value: 'complex', label: 'Complex', description: 'High complexity with many unknowns' },
            ],
            required: true,
            order: 7,
            category: 'complexity',
          },
        ];

        setQuestions(fallbackQuestions);
      }

      // Only pre-populate non-critical fields - let user explicitly choose industry/methodology
      const smartDefaults = {
        'projectName': '',  // Let user enter project name
        'description': '',
        // Don't pre-fill industry/methodology - these are critical for accurate recommendations
      };
      setResponses(smartDefaults);
    } catch (err) {
      console.error('Failed to load wizard questions:', err);
      setError('Failed to load wizard questions');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: string, answer: string | number | boolean) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleNext = async () => {
    if (currentStep < questions.length - 1) {
      // Track step completion
      const currentQuestion = questions[currentStep];
      if (currentQuestion) {
        WizardAnalytics.stepCompleted(currentStep, currentQuestion.id, questions.length);
      }
      setCurrentStep(prev => prev + 1);
    } else {
      await processResponses();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Generate dynamic fallback recommendations based on user selections
  const generateDynamicFallbacks = (): TemplateRecommendation[] => {
    const industry = String(responses.industry || responses.category || 'software_development');
    const methodology = String(responses.methodology || 'agile');
    const teamSize = String(responses.teamSize || responses.team_size || '2-5');

    // Template data for each industry with methodology variants
    const templateDatabase: Record<string, TemplateRecommendation[]> = {
      software_development: [
        {
          template: { id: 'software-agile', name: 'Software Development (Agile)', description: 'Agile workflow with sprints, stories, and retrospectives', category: 'software_development', methodology: 'agile', icon: '💻', color: '#3B82F6', usageCount: 150 },
          score: 0.9, reasons: [], confidence: 'high',
        },
        {
          template: { id: 'software-kanban', name: 'Software Development (Kanban)', description: 'Continuous flow with visual boards and WIP limits', category: 'software_development', methodology: 'kanban', icon: '📋', color: '#6366F1', usageCount: 100 },
          score: 0.85, reasons: [], confidence: 'high',
        },
        {
          template: { id: 'software-scrum', name: 'Software Development (Scrum)', description: 'Structured sprints with defined roles', category: 'software_development', methodology: 'scrum', icon: '🏃', color: '#10B981', usageCount: 120 },
          score: 0.8, reasons: [], confidence: 'medium',
        },
      ],
      marketing: [
        {
          template: { id: 'marketing-campaign', name: 'Marketing Campaign', description: 'Campaign management with content planning', category: 'marketing', methodology: 'kanban', icon: '📢', color: '#10B981', usageCount: 80 },
          score: 0.9, reasons: [], confidence: 'high',
        },
        {
          template: { id: 'content-calendar', name: 'Content Calendar', description: 'Plan and schedule content across channels', category: 'marketing', methodology: 'kanban', icon: '📅', color: '#8B5CF6', usageCount: 60 },
          score: 0.85, reasons: [], confidence: 'high',
        },
      ],
      product_launch: [
        {
          template: { id: 'product-launch', name: 'Product Launch', description: 'From ideation to market release', category: 'product_launch', methodology: 'hybrid', icon: '🚀', color: '#F59E0B', usageCount: 90 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      website_development: [
        {
          template: { id: 'website-dev', name: 'Website Development', description: 'Full website project from design to deployment', category: 'website_development', methodology: 'agile', icon: '🌐', color: '#8B5CF6', usageCount: 70 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      mobile_development: [
        {
          template: { id: 'mobile-app', name: 'Mobile App Development', description: 'iOS and Android app development', category: 'mobile_development', methodology: 'scrum', icon: '📱', color: '#EC4899', usageCount: 85 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      event_planning: [
        {
          template: { id: 'event-planning', name: 'Event Planning', description: 'Plan and execute events with vendor management', category: 'event_planning', methodology: 'waterfall', icon: '🎉', color: '#F97316', usageCount: 50 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      research: [
        {
          template: { id: 'research-project', name: 'Research & Development', description: 'Research with hypothesis and experiment tracking', category: 'research', methodology: 'agile', icon: '🔬', color: '#06B6D4', usageCount: 45 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      data_analysis: [
        {
          template: { id: 'data-analysis', name: 'Data Analysis Project', description: 'Data analysis and reporting workflow', category: 'data_analysis', methodology: 'kanban', icon: '📊', color: '#14B8A6', usageCount: 55 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      design: [
        {
          template: { id: 'design-project', name: 'Design Project', description: 'Creative design with feedback loops', category: 'design', methodology: 'kanban', icon: '🎨', color: '#A855F7', usageCount: 65 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
      sales: [
        {
          template: { id: 'sales-pipeline', name: 'Sales Pipeline', description: 'Sales opportunity tracking and management', category: 'sales', methodology: 'kanban', icon: '💼', color: '#EF4444', usageCount: 75 },
          score: 0.9, reasons: [], confidence: 'high',
        },
      ],
    };

    // Get templates for selected industry (or fallback to software_development)
    let templates = templateDatabase[industry] || templateDatabase.software_development;

    // Score and add reasons based on user selections
    templates = templates.map((t, index) => {
      let score = 0.9 - (index * 0.1);
      const reasons: string[] = [];

      // Industry match
      if (t.template.category === industry) {
        score += 0.1;
        reasons.push(`Designed for ${industry.replace('_', ' ')}`);
      }

      // Methodology match
      if (t.template.methodology === methodology) {
        score += 0.15;
        reasons.push(`Uses ${methodology} workflow`);
      }

      // Team size consideration
      const isSmallTeam = teamSize === '1' || teamSize === '2-5';
      if (isSmallTeam) {
        reasons.push('Suitable for small teams');
      } else {
        reasons.push('Scalable for larger teams');
      }

      return {
        ...t,
        score: Math.min(score, 1),
        reasons,
        confidence: score >= 0.8 ? 'high' as const : score >= 0.6 ? 'medium' as const : 'low' as const,
      };
    });

    // Sort by score and return top 3
    return templates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  };

  const processResponses = async () => {
    try {
      setLoadingState({ isLoading: true, action: 'recommendations', message: 'Analyzing your responses...' });

      // Try to process responses via API
      try {
        const wizardResponses: WizardResponse[] = Object.entries(responses).map(([questionId, answer]) => ({
          questionId,
          answer,
          timestamp: new Date(),
        }));

        const data = await apiFetch<{ data: { recommendations: TemplateRecommendation[] } }>('/api/project-wizard/process-responses', {
          method: 'POST',
          body: JSON.stringify({ responses: wizardResponses }),
        });

        // Check if API returned recommendations
        if (data.data?.recommendations && data.data.recommendations.length > 0) {
          setRecommendations(data.data.recommendations);
        } else {
          // Use dynamic fallback recommendations based on user input
          setRecommendations(generateDynamicFallbacks());
        }
      } catch {
        // API not available, use dynamic fallback recommendations
        setRecommendations(generateDynamicFallbacks());
      }

      setCurrentStep(questions.length); // Move to template selection
    } catch (err) {
      console.error('Failed to process wizard responses:', err);
      setError('Failed to process wizard responses');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (explicitData?: Record<string, string | number | boolean>, explicitTemplateId?: string) => {
    const activeTemplate = explicitTemplateId || selectedTemplate;
    if (!activeTemplate) return;

    const activeResponses = { ...responses, ...(explicitData || {}) };

    try {
      setLoadingState({ isLoading: true, action: 'creating', message: 'Analyzing your responses...' });
      // Generate a unique project key (max 10 chars, uppercase letters and underscores only)
      // FIX: Check both camelCase (API) and snake_case (legacy/fallback) keys
      const projectName = String(activeResponses.projectName || activeResponses.project_name || 'New Project');
      let baseKey = projectName.replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 4);

      // Fallback if name has no letters (e.g. "123")
      if (baseKey.length < 2) {
        baseKey = 'PROJ';
      }

      // Add a random letter to make it unique and ensure at least 3 chars
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const uniqueKey = `${baseKey}${randomLetter}`;

      const wizardData = {
        projectName: projectName,
        // projectKey: uniqueKey, // Let backend generate robust key
        description: activeResponses.description || activeResponses.project_description || '',
        teamSize: (() => {
          const size = activeResponses.teamSize || activeResponses.team_size;
          if (typeof size === 'string') return size;
          if (typeof size === 'number') return String(size);
          return "1";
        })(),
        timeline: activeResponses.timeline || 'medium',
        industry: activeResponses.industry || 'software_development',
        methodology: activeResponses.methodology || 'agile',
        complexity: activeResponses.complexity || 'moderate',
        teamExperience: activeResponses.teamExperience || activeResponses.team_experience || 'intermediate',
        hasExternalStakeholders: false,
        requiresCompliance: false,
        budget: 'medium',
        userExperience: "intermediate"
      };

      // Only try wizard API if we have a real template ID (not a fallback)
      // Fallback templates use descriptive IDs that won't exist in the database
      const useWizardApi = activeTemplate && !isFallbackTemplate(activeTemplate);

      if (useWizardApi) {
        try {
          // Log payload for debugging 400 error
          console.log('[Wizard Debug] Creating project with payload:', JSON.stringify({
            url: '/api/project-wizard/create-project',
            body: { wizardData, templateId: activeTemplate }
          }, null, 2));

          // Only try wizard API if we have a real template ID (not a fallback)
          const response = await apiFetch<{ data: Project } | Project>('/api/project-wizard/create-project', {
            method: 'POST',
            body: JSON.stringify({
              wizardData,
              templateId: activeTemplate,
            }),
          });

          // apiFetch automatically throws if response is not ok
          const project = 'data' in response ? response.data : response;

          if (project?.id) {
            clearSavedProgress();
            WizardAnalytics.projectCreated(activeTemplate, elapsedTime, true);
            onProjectCreated(project);
            onClose();
            // Force a router refresh to update server components/layout
            router.refresh();
            router.push(`/projects/${project.id}`);
          } else {
            console.error('Project created but ID missing:', project);
            setError('Project created but navigation failed');
          }
          return;
        } catch (wizardError: unknown) {
          // Check if it's a known error (like duplicate name)
          let errorMsg = '';
          if (wizardError instanceof Error) {
            errorMsg = wizardError.message;
          } else {
            errorMsg = String(wizardError);
          }

          if (errorMsg.includes('Project name or key') || errorMsg.includes('already exist')) {
            setError(errorMsg.replace(/.*(?:message|error)":"([^"]+)".*/, '$1') || 'Project name already exists. Please choose another.');
            return; // Stop here, don't try fallback
          }
          // Wizard API not available, falling through to regular project creation
          console.warn('Wizard API error, trying fallback:', wizardError);
        }
      }

      // Use regular project creation API for fallback templates or as fallback
      try {
        const data = await apiFetch<Project>('/projects', {
          method: 'POST',
          body: JSON.stringify({
            name: projectName,
            description: String(wizardData.description),
            key: uniqueKey,
          }),
        });

        clearSavedProgress();
        WizardAnalytics.projectCreated(activeTemplate, elapsedTime, false);
        onProjectCreated(data);
        onClose();
        router.push(`/projects/${data.id}`);
        return;
      } catch (fallbackError) {
        console.error('Fallback project creation failed:', fallbackError);
        throw new Error('Unable to create project');
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      setError('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const getStepIcon = (step: number) => {
    const icons = [
      <SparklesIcon key="sparkles" className="h-6 w-6" />,
      <UserGroupIcon key="users" className="h-6 w-6" />,
      <ClockIcon key="clock" className="h-6 w-6" />,
      <ChartBarIcon key="chart" className="h-6 w-6" />,
      <CogIcon key="cog" className="h-6 w-6" />,
    ];
    return icons[step] || <CogIcon key="default" className="h-6 w-6" />;
  };

  const renderQuestion = (question: WizardQuestion) => {
    const value = responses[question.id] || '';

    switch (question.type) {
      case 'text':
        return (
          <Input
            value={String(value)}
            onChange={(e) => handleAnswer(question.id, e.target.value)}
            placeholder="Enter your answer..."
            className="w-full"
          />
        );

      case 'select':
        return (
          <select
            value={String(value)}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleAnswer(question.id, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Select an option...</option>
            {question.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={String(value)}
            onChange={(e) => handleAnswer(question.id, parseInt(e.target.value))}
            placeholder="Enter a number..."
            className="w-full"
          />
        );

      default:
        return null;
    }
  };

  const renderTemplateSelection = () => {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Choose Your Project Template
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Based on your answers, we recommend these templates
          </p>
        </div>

        <div className="grid gap-4">
          {recommendations.map((rec) => (
            <Card
              key={rec.template.id}
              className={`p-4 cursor-pointer transition-all duration-200 ${selectedTemplate === rec.template.id
                ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'hover:shadow-md'
                }`}
              onClick={() => {
                setSelectedTemplate(rec.template.id);
                WizardAnalytics.templateSelected(rec.template.id, rec.template.name, isFallbackTemplate(rec.template.id));
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-white"
                  style={{ backgroundColor: rec.template.color }}
                >
                  <span className="text-xl">{rec.template.icon}</span>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      {rec.template.name}
                    </h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${rec.confidence === 'high' ? 'bg-green-100 text-green-800' :
                      rec.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                      {rec.confidence} match
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {rec.template.description}
                  </p>

                  <div className="space-y-1">
                    {rec.reasons.map((reason, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <CheckIcon className="h-4 w-4 text-green-500" />
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Project Setup Wizard
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Let&apos;s create the perfect project for your needs
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode Toggle Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setWizardMode('ai')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${wizardMode === 'ai'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              <SparklesIcon className="h-4 w-4" />
              AI Assistant
            </button>
            <button
              onClick={() => setWizardMode('classic')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${wizardMode === 'classic'
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
              <QueueListIcon className="h-4 w-4" />
              Classic Wizard
            </button>
          </div>

          {/* AI Chat Mode */}
          {wizardMode === 'ai' && (
            <AIProjectChat
              onTemplateSelected={(templateId, suggestedConfig, extractedData) => {
                console.log('[Wizard Debug] Template Selected:', templateId);
                console.log('[Wizard Debug] AI Extracted Data:', extractedData);

                setSelectedTemplate(templateId);

                const newResponses = { ...responses };
                if (extractedData) {
                  if (extractedData.name) {
                    newResponses.project_name = extractedData.name;
                    console.log('[Wizard Debug] Mapped name to project_name:', extractedData.name);
                  }
                  if (extractedData.description) newResponses.project_description = extractedData.description;
                  if (extractedData.teamSize) newResponses.team_size = extractedData.teamSize;
                  if (extractedData.industry) newResponses.industry = extractedData.industry;
                  if (extractedData.methodology) newResponses.methodology = extractedData.methodology;
                  if (extractedData.timeline) newResponses.timeline = extractedData.timeline;

                  setResponses(newResponses);
                }

                if (suggestedConfig) {
                  // In a real app we'd store this config
                }

                // If check if we have a valid project name to proceed
                // If yes, create immediately. If no, go to wizard to ask.
                const hasProjectName = !!newResponses.project_name && String(newResponses.project_name).length > 0;
                console.log('[Wizard Debug] Has Project Name?', hasProjectName, newResponses.project_name);

                if (hasProjectName) {
                  createProject(); // Call createProject without arguments, it uses state
                } else {
                  // Switch to Review Mode (Classic Wizard)
                  // We start at step 0 so user can see/edit the inferred name

                  // Make sure questions are loaded first!
                  if (questions.length === 0) {
                    // Force load generic questions if API failed
                    console.log('[Wizard Debug] No questions loaded, loading fallback...');
                    loadWizardQuestions().then(() => {
                      setWizardMode('classic');
                      setCurrentStep(0);
                    });
                  } else {
                    setWizardMode('classic');
                    setCurrentStep(0);
                  }
                }
              }}
              onClose={onClose}
            />
          )}

          {/* Classic Wizard Mode */}
          {wizardMode === 'classic' && (
            <>
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Step {currentStep + 1} of {questions.length + 1}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {Math.round(((currentStep + 1) / (questions.length + 1)) * 100)}% Complete
                    </span>
                    <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <ClockIcon className="h-4 w-4" />
                      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${elapsedTime < 120 ? 'bg-green-600' : elapsedTime < 180 ? 'bg-yellow-600' : 'bg-red-600'
                      }`}
                    style={{ width: `${((currentStep + 1) / (questions.length + 1)) * 100}%` }}
                  />
                </div>
                {elapsedTime < 120 && (
                  <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckIcon className="h-3 w-3" />
                    On track for 2-minute setup!
                  </div>
                )}
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Spinner />
                  {loadingState.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{loadingState.message}</p>
                  )}
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
                  <Button onClick={() => window.location.reload()}>
                    Try Again
                  </Button>
                </div>
              ) : currentStep < questions.length ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    {getStepIcon(currentStep)}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {questions[currentStep]?.question}
                      </h3>
                      {questions[currentStep]?.options?.[0]?.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {questions[currentStep].options?.[0].description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {questions[currentStep]?.options?.map((option) => (
                      <div
                        key={option.value}
                        className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${responses[questions[currentStep].id] === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        onClick={() => handleAnswer(questions[currentStep].id, option.value)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 ${responses[questions[currentStep].id] === option.value
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-gray-300 dark:border-gray-600'
                            }`}>
                            {responses[questions[currentStep].id] === option.value && (
                              <div className="w-2 h-2 bg-white rounded-full m-0.5" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {option.label}
                            </div>
                            {option.description && (
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {option.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {questions[currentStep]?.type === 'text' && (
                    <div className="space-y-2">
                      <Label htmlFor={questions[currentStep].id}>
                        {questions[currentStep].question}
                      </Label>
                      {renderQuestion(questions[currentStep])}
                    </div>
                  )}
                </div>
              ) : (
                renderTemplateSelection()
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="ghost"
                  onClick={currentStep < questions.length ? handlePrevious : () => setCurrentStep(questions.length - 1)}
                  disabled={currentStep === 0}
                >
                  <ChevronLeftIcon className="h-4 w-4 mr-2" />
                  Previous
                </Button>

                <div className="flex gap-3">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  {currentStep < questions.length ? (
                    <Button
                      onClick={handleNext}
                      disabled={questions[currentStep]?.required && !responses[questions[currentStep]?.id]}
                    >
                      Next
                      <ChevronRightIcon className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => createProject()}
                      disabled={!selectedTemplate}
                    >
                      Create Project
                      <CheckIcon className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ProjectWizard;
