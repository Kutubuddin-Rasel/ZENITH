"use client";
import React, { useState } from 'react';
import Card from '../Card';
import Button from '../Button';
import { XMarkIcon, StarIcon } from '@heroicons/react/24/outline';
import { useUserSatisfaction } from '../../hooks/useUserSatisfaction';

interface SatisfactionSurveyProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'onboarding' | 'feature' | 'general';
  title: string;
  questions: Array<{
    id: string;
    question: string;
    context?: string;
  }>;
  onComplete?: (score: number, feedback?: string) => void;
}

const SatisfactionSurvey: React.FC<SatisfactionSurveyProps> = ({
  isOpen,
  onClose,
  type,
  title,
  questions,
  onComplete,
}) => {
  const { submitSurvey } = useUserSatisfaction();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const handleAnswer = (questionId: string, rating: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: rating,
    }));
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    const surveyQuestions = questions.map(q => ({
      id: q.id,
      question: q.question,
      answer: answers[q.id] || 0,
      context: q.context,
    }));

    const result = await submitSurvey(type, surveyQuestions, feedback);
    
    if (result) {
      const overallScore = result.overallScore;
      onComplete?.(overallScore, feedback);
      onClose();
    }
  };

  const isCurrentQuestionAnswered = () => {
    const questionId = questions[currentQuestion]?.id;
    return questionId && answers[questionId] > 0;
  };

  const getOverallProgress = () => {
    const answeredQuestions = Object.keys(answers).length;
    return Math.round((answeredQuestions / questions.length) * 100);
  };

  if (!isOpen) return null;

  const currentQ = questions[currentQuestion];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Your feedback helps us improve
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Question {currentQuestion + 1} of {questions.length}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {getOverallProgress()}% Complete
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${getOverallProgress()}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {currentQ?.question}
              </h3>
              {currentQ?.context && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {currentQ.context}
                </p>
              )}
            </div>

            {/* Rating Scale */}
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => handleAnswer(currentQ.id, rating)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
                      answers[currentQ.id] === rating
                        ? 'bg-blue-600 text-white scale-110'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    <StarIcon className="h-6 w-6" />
                  </button>
                ))}
              </div>
              
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </div>

            {/* Feedback (only on last question) */}
            {currentQuestion === questions.length - 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Additional feedback (optional)
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Tell us more about your experience..."
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              Previous
            </Button>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={onClose}>
                Skip
              </Button>
              <Button
                onClick={handleNext}
                disabled={!isCurrentQuestionAnswered()}
              >
                {currentQuestion === questions.length - 1 ? 'Submit' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SatisfactionSurvey;
