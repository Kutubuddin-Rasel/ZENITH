/**
 * AI Smart Setup Type Definitions
 * Shared types for project recommendations and issue defaults
 */

// ============================================
// Project Recommendation Types
// ============================================

export interface ProjectRecommendationRequest {
  projectName: string;
  projectDescription?: string;
  teamSize: number;
  timeline: 'short' | 'medium' | 'long';
  industry: string;
  userExperience: 'beginner' | 'intermediate' | 'advanced';
}

export interface TeamRole {
  role: string;
  description: string;
}

export interface ProjectRecommendation {
  methodology: 'agile' | 'scrum' | 'kanban' | 'waterfall' | 'hybrid';
  sprintDuration: number;
  issueTypes: string[];
  teamRoles: TeamRole[];
  priorities: string[];
  workflowStages: string[];
  reasoning: string;
  confidence: number;
}

// ============================================
// Issue Defaults Types
// ============================================

export interface RecentIssue {
  type: string;
  priority: string;
}

export interface IssueDefaultsRequest {
  projectType: string;
  issueType?: string;
  teamMembers: string[];
  recentIssues?: RecentIssue[];
}

export interface IssueDefaults {
  suggestedType: string;
  suggestedPriority: string;
  suggestedAssignee?: string;
  estimatedDueDate?: string;
  suggestedLabels?: string[];
  reasoning: string;
}

// ============================================
// Template Scoring Types
// ============================================

export interface TemplateForScoring {
  id: string;
  name: string;
  category: string;
  methodology: string;
}

export interface TemplateScoringContext {
  industry: string;
  teamSize: number;
  experience: string;
}

export interface TemplateAIScore {
  templateId: string;
  aiScore: number;
  reasoning: string;
}
