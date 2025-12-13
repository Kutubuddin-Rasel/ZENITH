"use client";
import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Input from '@/components/Input';
import { AnimatePresence, motion } from 'framer-motion';
import Button from '@/components/Button';
import FormError from '@/components/FormError';
import AuthLayout from '@/components/AuthLayout';
import PasswordStrength from '@/components/PasswordStrength';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { CheckIcon, UserIcon, BuildingOfficeIcon, SparklesIcon } from '@heroicons/react/24/outline';

// Step 1: Personal Info
const personalSchema = z.object({
  fullName: z.string().min(2, { message: 'Name must be at least 2 characters' }),
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Step 2: Workspace Info
const workspaceSchema = z.object({
  workspaceName: z.string().min(2, { message: 'Workspace name must be at least 2 characters' }),
});

type PersonalFormData = z.infer<typeof personalSchema>;
type WorkspaceFormData = z.infer<typeof workspaceSchema>;

const STEPS = [
  { id: 1, name: 'Your Details', icon: UserIcon, description: 'Personal information' },
  { id: 2, name: 'Workspace', icon: BuildingOfficeIcon, description: 'Set up your team' },
];

// Generate workspace slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
}

export default function RegisterPage() {
  const { register: registerUser, loading } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [personalData, setPersonalData] = useState<PersonalFormData | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Step 1 form
  const personalForm = useForm<PersonalFormData>({
    resolver: zodResolver(personalSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
    mode: 'onChange',
  });

  // Step 2 form
  const workspaceForm = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { workspaceName: '' },
    mode: 'onChange',
  });

  const watchedPassword = personalForm.watch('password');
  const watchedWorkspaceName = workspaceForm.watch('workspaceName');
  const workspaceSlug = useMemo(() => generateSlug(watchedWorkspaceName || ''), [watchedWorkspaceName]);

  const handlePersonalSubmit = (data: PersonalFormData) => {
    setPersonalData(data);
    setCurrentStep(2);
  };

  const handleWorkspaceSubmit = async (data: WorkspaceFormData) => {
    if (!personalData) return;

    setGlobalError(null);
    try {
      await registerUser(
        personalData.email,
        personalData.password,
        personalData.fullName,
        data.workspaceName
      );
    } catch (e: unknown) {
      const message = e && typeof e === 'object' && 'message' in e
        ? (e as { message?: string }).message
        : undefined;
      setGlobalError(message || 'Registration failed. Please try again.');
    }
  };

  const goBack = () => {
    setCurrentStep(1);
  };

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 30 : -30,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 30 : -30,
      opacity: 0,
    }),
  };

  return (
    <AuthLayout
      title={currentStep === 1 ? "Create your account" : "Set up your workspace"}
      subtitle={currentStep === 1 ? "Start your 14-day free trial" : "Give your team a home"}
    >
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-3">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{
                    scale: currentStep === step.id ? 1.1 : 1,
                    backgroundColor: currentStep > step.id
                      ? 'rgb(34 197 94)' // success-500
                      : currentStep === step.id
                        ? 'rgb(37 99 235)' // primary-600
                        : 'rgb(229 229 229)', // neutral-200
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm"
                >
                  {currentStep > step.id ? (
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <CheckIcon className="w-5 h-5 text-white" />
                    </motion.div>
                  ) : (
                    <step.icon className={`w-5 h-5 ${currentStep === step.id ? 'text-white' : 'text-neutral-500'
                      }`} />
                  )}
                </motion.div>
                <div className="hidden sm:block">
                  <p className={`text-sm font-medium ${currentStep >= step.id
                      ? 'text-neutral-900 dark:text-white'
                      : 'text-neutral-400'
                    }`}>
                    {step.name}
                  </p>
                </div>
              </div>

              {/* Connector */}
              {idx < STEPS.length - 1 && (
                <motion.div
                  className="w-12 h-0.5 rounded-full"
                  animate={{
                    backgroundColor: currentStep > step.id
                      ? 'rgb(34 197 94)'
                      : 'rgb(229 229 229)',
                  }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Form Steps */}
      <AnimatePresence mode="wait" custom={currentStep}>
        {currentStep === 1 && (
          <motion.div
            key="step1"
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <form onSubmit={personalForm.handleSubmit(handlePersonalSubmit)} className="flex flex-col gap-5">
              <Input
                label="Full name"
                type="text"
                autoComplete="name"
                placeholder="John Doe"
                {...personalForm.register("fullName")}
                error={personalForm.formState.errors.fullName?.message}
              />

              <Input
                label="Work email"
                type="email"
                autoComplete="email"
                placeholder="john@company.com"
                {...personalForm.register("email")}
                error={personalForm.formState.errors.email?.message}
              />

              <div className="space-y-1">
                <Input
                  label="Password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  showPasswordToggle
                  {...personalForm.register("password")}
                  error={personalForm.formState.errors.password?.message}
                />
                <PasswordStrength password={watchedPassword} />
              </div>

              <Input
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                showPasswordToggle
                {...personalForm.register("confirmPassword")}
                error={personalForm.formState.errors.confirmPassword?.message}
              />

              <Button
                type="submit"
                fullWidth
                className="mt-2 py-3 text-base font-semibold shadow-lg shadow-primary-600/20"
              >
                Continue
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>

              <p className="mt-4 text-center text-sm text-neutral-600 dark:text-neutral-400">
                Already have an account?{' '}
                <Link href="/auth/login" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 transition-colors">
                  Sign in
                </Link>
              </p>
            </form>
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div
            key="step2"
            custom={2}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <form onSubmit={workspaceForm.handleSubmit(handleWorkspaceSubmit)} className="flex flex-col gap-5">
              {/* Workspace Preview Card */}
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20"
                    animate={{ scale: watchedWorkspaceName ? [1, 1.05, 1] : 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="text-white font-bold text-xl">
                      {watchedWorkspaceName ? watchedWorkspaceName[0].toUpperCase() : 'W'}
                    </span>
                  </motion.div>
                  <div>
                    <p className="font-semibold text-neutral-900 dark:text-white">
                      {watchedWorkspaceName || 'Your Workspace'}
                    </p>
                    {workspaceSlug && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        zenith.pm/<span className="text-primary-600 dark:text-primary-400">{workspaceSlug}</span>
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  <SparklesIcon className="w-4 h-4 inline mr-1 text-yellow-500" />
                  Your workspace is where your team organizes projects and collaborates.
                </p>
              </div>

              <Input
                label="Workspace name"
                type="text"
                placeholder="Acme Corp"
                {...workspaceForm.register("workspaceName")}
                error={workspaceForm.formState.errors.workspaceName?.message}
              />

              <FormError error={globalError ?? undefined} />

              <div className="flex gap-3 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={goBack}
                  className="flex-1 py-3"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </Button>
                <Button
                  type="submit"
                  loading={loading}
                  className="flex-1 py-3 shadow-lg shadow-primary-600/20"
                >
                  Create Workspace
                </Button>
              </div>

              {/* Terms */}
              <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                By creating an account, you agree to our{' '}
                <Link href="/terms" className="text-primary-600 hover:underline">Terms of Service</Link>
                {' '}and{' '}
                <Link href="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}