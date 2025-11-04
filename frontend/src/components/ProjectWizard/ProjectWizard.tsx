"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '../Card';
import Button from '../Button';
import Input from '../Input';
import Label from '../Label';
import Spinner from '../Spinner';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  CheckIcon,
  SparklesIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon,
  CogIcon
} from '@heroicons/react/24/outline';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setStartTime(new Date());
      loadWizardQuestions();
    }
  }, [isOpen]);

  // Debug logging
  useEffect(() => {
    console.log('Wizard state:', {
      currentStep,
      questionsLength: questions.length,
      responses,
      recommendations,
      selectedTemplate,
      loading,
      error
    });
  }, [currentStep, questions.length, responses, recommendations, selectedTemplate, loading, error]);

  // Log when recommendations change
  useEffect(() => {
    console.log('Recommendations updated:', recommendations);
  }, [recommendations]);

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
      setLoading(true);
      
      // Try to fetch questions from API
      try {
        const response = await fetch('http://localhost:3000/api/project-wizard/questions', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setQuestions(data.data);
        } else {
          throw new Error('API request failed');
        }
      } catch {
        console.log('API not available, using fallback questions');
        
        // Fallback questions if API is not available
        const fallbackQuestions: WizardQuestion[] = [
          {
            id: 'project_name',
            question: 'What would you like to call your project?',
            type: 'text',
            required: true,
            order: 1,
            category: 'basic',
          },
          {
            id: 'project_description',
            question: 'Briefly describe what this project is about',
            type: 'text',
            required: false,
            order: 2,
            category: 'basic',
          },
          {
            id: 'team_size',
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
      
      // Pre-populate with smart defaults for faster setup
      const smartDefaults = {
        'project_name': 'My New Project',
        'project_description': '',
        'team_size': '2-5',
        'timeline': 'medium',
        'industry': 'software_development',
        'methodology': 'agile',
        'complexity': 'moderate',
        'team_experience': 'intermediate',
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
    console.log('handleNext called', { 
      currentStep, 
      questionsLength: questions.length, 
      responses,
      isLastStep: currentStep === questions.length - 1,
      currentQuestion: questions[currentStep]
    });
    if (currentStep < questions.length - 1) {
      console.log('Moving to next step');
      setCurrentStep(prev => prev + 1);
    } else {
      console.log('Processing responses and moving to template selection');
      await processResponses();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const processResponses = async () => {
    try {
      console.log('processResponses called', { responses, recommendations });
      setLoading(true);
      
      // Try to process responses via API
      try {
        const wizardResponses: WizardResponse[] = Object.entries(responses).map(([questionId, answer]) => ({
          questionId,
          answer,
          timestamp: new Date(),
        }));

        console.log('Making API call to process-responses with:', { responses: wizardResponses });
        const response = await fetch('http://localhost:3000/api/project-wizard/process-responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({ responses: wizardResponses }),
        });

        console.log('API response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          console.log('API response data:', data);
          console.log('API data.data:', data.data);
          console.log('API data.data.recommendations:', data.data?.recommendations);
          
          // Check if API returned empty recommendations
          if (data.data?.recommendations && data.data.recommendations.length > 0) {
            setRecommendations(data.data.recommendations);
            console.log('setRecommendations called with API recommendations:', data.data.recommendations);
          } else {
            console.log('API returned empty recommendations, using fallback');
            // Use fallback recommendations if API returns empty
            const fallbackRecommendations: TemplateRecommendation[] = [
              {
                template: {
                  id: 'software-development-basic',
                  name: 'Software Development - Basic',
                  description: 'A simple project template for software development with basic issue types and workflows.',
                  category: 'software_development',
                  methodology: 'agile',
                  icon: '💻',
                  color: '#3B82F6',
                  usageCount: 150,
                },
                score: 0.9,
                reasons: ['Matches your industry selection', 'Suitable for your team size'],
                confidence: 'high',
              },
              {
                template: {
                  id: 'agile-scrum-template',
                  name: 'Agile Scrum Template',
                  description: 'A comprehensive Scrum template with sprints, backlogs, and agile workflows.',
                  category: 'software_development',
                  methodology: 'scrum',
                  icon: '🏃',
                  color: '#10B981',
                  usageCount: 200,
                },
                score: 0.85,
                reasons: ['Matches your methodology preference', 'Good for your team size'],
                confidence: 'high',
              },
              {
                template: {
                  id: 'kanban-workflow',
                  name: 'Kanban Workflow',
                  description: 'A flexible Kanban board for continuous workflow management.',
                  category: 'software_development',
                  methodology: 'kanban',
                  icon: '📋',
                  color: '#F59E0B',
                  usageCount: 120,
                },
                score: 0.8,
                reasons: ['Flexible workflow', 'Good for ongoing projects'],
                confidence: 'medium',
              },
            ];
            setRecommendations(fallbackRecommendations);
            console.log('setRecommendations called with fallback recommendations:', fallbackRecommendations);
          }
        } else {
          const errorText = await response.text();
          console.log('API error response:', errorText);
          throw new Error('API request failed');
        }
      } catch (apiError) {
        console.log('API not available, using fallback recommendations', apiError);
        
        // Generate fallback recommendations based on responses
        const fallbackRecommendations: TemplateRecommendation[] = [
          {
            template: {
              id: 'software-development-basic',
              name: 'Software Development - Basic',
              description: 'A simple project template for software development with basic issue types and workflows.',
              category: 'software_development',
              methodology: 'agile',
              icon: '💻',
              color: '#3B82F6',
              usageCount: 150,
            },
            score: 0.9,
            reasons: ['Matches your industry selection', 'Suitable for your team size'],
            confidence: 'high',
          },
          {
            template: {
              id: 'agile-scrum-template',
              name: 'Agile Scrum Template',
              description: 'A comprehensive Scrum template with sprints, backlogs, and agile workflows.',
              category: 'software_development',
              methodology: 'scrum',
              icon: '🏃',
              color: '#10B981',
              usageCount: 200,
            },
            score: 0.85,
            reasons: ['Matches your methodology preference', 'Good for your team size'],
            confidence: 'high',
          },
          {
            template: {
              id: 'kanban-workflow',
              name: 'Kanban Workflow',
              description: 'A flexible Kanban board for continuous workflow management.',
              category: 'software_development',
              methodology: 'kanban',
              icon: '📋',
              color: '#F59E0B',
              usageCount: 120,
            },
            score: 0.8,
            reasons: ['Flexible workflow', 'Good for ongoing projects'],
            confidence: 'medium',
          },
        ];
        
        console.log('Setting fallback recommendations:', fallbackRecommendations);
        setRecommendations(fallbackRecommendations);
        console.log('Fallback recommendations set');
      }
      
      console.log('Moving to template selection step', { newStep: questions.length, recommendations });
      setCurrentStep(questions.length); // Move to template selection
    } catch (err) {
      console.error('Failed to process wizard responses:', err);
      setError('Failed to process wizard responses');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!selectedTemplate) return;

    try {
      setLoading(true);
      const wizardData = {
        projectName: responses.project_name || 'New Project',
        description: responses.project_description || '',
        teamSize: responses.team_size && typeof responses.team_size === 'string' ? parseInt(responses.team_size.split('-')[0]) : 1,
        timeline: responses.timeline || 'medium',
        industry: responses.industry || 'software_development',
        methodology: responses.methodology || 'agile',
        complexity: responses.complexity || 'moderate',
        teamExperience: responses.team_experience || 'intermediate',
        hasExternalStakeholders: false,
        requiresCompliance: false,
        budget: 'medium',
      };

      // Generate a unique project key (max 5 chars, uppercase letters and underscores only)
      const projectName = String(wizardData.projectName);
      const baseKey = projectName.replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 4);
      // Add a random letter to make it unique
      const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const uniqueKey = `${baseKey}${randomLetter}`;
      console.log('Generated project key:', uniqueKey);
      
        // Try regular project creation API first (more reliable)
        try {
          const token = localStorage.getItem('access_token');
          console.log('Token from localStorage:', token ? 'Present' : 'Missing');
          console.log('Creating project with:', {
            name: projectName,
            description: String(wizardData.description),
            key: uniqueKey,
          });
          
          const response = await fetch('http://localhost:3000/projects', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: projectName,
              description: String(wizardData.description),
              key: uniqueKey,
            }),
          });

        console.log('Project creation response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Project created successfully:', data);
          onProjectCreated(data);
          onClose();
          router.push(`/projects/${data.id}`);
          return;
        } else {
          const errorText = await response.text();
          console.log('Project creation failed:', errorText);
          throw new Error('Regular API request failed');
        }
      } catch (regularApiError) {
        console.log('Regular API failed:', regularApiError);
        console.log('Regular API not available, trying wizard API');
        
        // Try wizard API as fallback
        try {
          const response = await fetch('http://localhost:3000/api/project-wizard/create-project', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            },
            body: JSON.stringify({
              wizardData,
              templateId: selectedTemplate,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            onProjectCreated(data.data);
            onClose();
            router.push(`/projects/${data.data.id}`);
            return;
          } else {
            throw new Error('Wizard API request failed');
          }
        } catch {
          console.log('All APIs failed, cannot create project');
          throw new Error('Unable to create project - all APIs failed');
        }
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
    console.log('renderTemplateSelection called', { recommendations, selectedTemplate });
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
            className={`p-4 cursor-pointer transition-all duration-200 ${
              selectedTemplate === rec.template.id
                ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedTemplate(rec.template.id)}
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
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    rec.confidence === 'high' ? 'bg-green-100 text-green-800' :
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
                className={`h-2 rounded-full transition-all duration-300 ${
                  elapsedTime < 120 ? 'bg-green-600' : elapsedTime < 180 ? 'bg-yellow-600' : 'bg-red-600'
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
            <div className="flex items-center justify-center py-12">
              <Spinner />
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
                    className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
                      responses[questions[currentStep].id] === option.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => handleAnswer(questions[currentStep].id, option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        responses[questions[currentStep].id] === option.value
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
                  onClick={createProject}
                  disabled={!selectedTemplate}
                >
                  Create Project
                  <CheckIcon className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ProjectWizard;
