import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export interface UserPreferencesData {
  // Appearance Preferences (all visually applied)
  ui: {
    theme: 'light' | 'dark'; // Applied via document.classList
    accentColor: string; // Hex color, applied via CSS variables
    compactMode: boolean; // Applied via .compact class
    sidebarStyle: 'default' | 'compact'; // Sidebar width mode
  };

  // Notification Preferences
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
    types: {
      issueAssigned: boolean;
      issueUpdated: boolean;
      commentAdded: boolean;
      sprintStarted: boolean;
      sprintCompleted: boolean;
      projectInvited: boolean;
      // Enterprise: @mentions
      mentionedInComment: boolean;
      mentionedInDescription: boolean;
    };
  };

  // Work Preferences
  work: {
    workingHours: {
      start: string; // HH:MM format
      end: string; // HH:MM format
      timezone: string;
      workingDays: number[]; // 0-6 (Sunday-Saturday)
    };
    defaultSprintDuration: number; // days
    autoAssignToMe: boolean;
    enableTimeTracking: boolean;
    storyPointScale: number[];
  };

  // Learning Data for Smart Defaults
  learning: {
    preferredIssueTypes: string[];
    preferredPriorities: string[];
    commonAssigneePatterns: Record<string, string>; // issue type -> preferred assignee
    averageSprintVelocity: number;
    workingStyle: 'collaborative' | 'independent' | 'mixed';
    experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };

  // Onboarding Progress
  onboarding: {
    completedSteps: string[];
    currentStep: string;
    isCompleted: boolean;
    completedAt?: Date;
    skippedSteps: string[];
  };
}

@Entity({ name: 'user_preferences' })
@Index(['userId'], { unique: true })
export class UserPreferences {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'jsonb' })
  preferences: UserPreferencesData;

  @Column({ type: 'jsonb', nullable: true })
  learningData?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  analytics?: {
    lastActiveAt: Date;
    totalSessions: number;
    averageSessionDuration: number;
    mostUsedFeatures: string[];
    productivityScore: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
