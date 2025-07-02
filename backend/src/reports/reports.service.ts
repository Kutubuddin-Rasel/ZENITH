import { Injectable } from '@nestjs/common';
import { IssuesService } from 'src/issues/issues.service';
import { SprintStatus } from 'src/sprints/entities/sprint.entity';
import { SprintsService } from 'src/sprints/sprints.service';
import { EpicsService } from 'src/epics/epics.service';
import { IssueStatus } from 'src/issues/entities/issue.entity';

@Injectable()
export class ReportsService {
  constructor(
    private sprintsService: SprintsService,
    private issuesService: IssuesService,
    private epicsService: EpicsService,
  ) {}

  async getVelocity(projectId: string, userId: string) {
    // Get all sprints and filter for completed ones
    const allSprints = await this.sprintsService.findAll(projectId, userId);
    const sprints = allSprints.filter(sprint => sprint.status === SprintStatus.COMPLETED);

    const velocityData = await Promise.all(
      sprints.map(async (sprint) => {
        const issues = await this.issuesService.findAll(projectId, userId, {
          sprint: sprint.id,
        });

        // Use story points for velocity calculation (industry standard)
        const committedPoints = issues.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);
        const completedPoints = issues
          .filter(issue => issue.status === IssueStatus.DONE)
          .reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);

        return {
          sprintId: sprint.id,
          sprintName: sprint.name,
          completedPoints,
          committedPoints,
          sprintStart: sprint.startDate,
          sprintEnd: sprint.endDate,
        };
      }),
    );

    return velocityData.sort((a, b) => new Date(a.sprintStart).getTime() - new Date(b.sprintStart).getTime());
  }

  async getBurndown(projectId: string, userId: string, sprintId?: string) {
    let sprints;
    
    if (sprintId) {
      // Get specific sprint
      const sprint = await this.sprintsService.findOne(projectId, sprintId, userId);
      sprints = [sprint];
    } else {
      // Get active sprint
      const allSprints = await this.sprintsService.findAll(projectId, userId);
      sprints = allSprints.filter(sprint => sprint.status === SprintStatus.ACTIVE);
    }

    if (sprints.length === 0) {
      return [];
    }

    const burndownData = await Promise.all(
      sprints.map(async (sprint) => {
        const issues = await this.issuesService.findAll(projectId, userId, {
          sprint: sprint.id,
        });

        const totalPoints = issues.reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);
        const completedPoints = issues
          .filter(issue => issue.status === IssueStatus.DONE)
          .reduce((sum, issue) => sum + (issue.storyPoints || 0), 0);
        const remainingPoints = totalPoints - completedPoints;

        // Calculate ideal burndown line
        const sprintStart = new Date(sprint.startDate);
        const sprintEnd = new Date(sprint.endDate);
        const totalDays = Math.ceil((sprintEnd.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
        const pointsPerDay = totalPoints / totalDays;

        return {
          sprintId: sprint.id,
          sprintName: sprint.name,
          totalPoints,
          completedPoints,
          remainingPoints,
          sprintStart: sprint.startDate,
          sprintEnd: sprint.endDate,
          totalDays,
          pointsPerDay,
          completionPercentage: totalPoints > 0 ? (completedPoints / totalPoints) * 100 : 0,
        };
      }),
    );

    return burndownData;
  }

  async getCumulativeFlow(projectId: string, userId: string, days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all issues in the project
    const allIssues = await this.issuesService.findAll(projectId, userId);
    
    // Filter issues by date range
    const issuesInRange = allIssues.filter(issue => {
      const issueDate = new Date(issue.updatedAt);
      return issueDate >= startDate && issueDate <= endDate;
    });

    // Group issues by status and date
    const statusGroups: { [key: string]: { [key: string]: number } } = {};
    
    // Initialize status groups
    Object.values(IssueStatus).forEach(status => {
      statusGroups[status] = {};
    });

    // Count issues by status and date
    issuesInRange.forEach(issue => {
      const date = new Date(issue.updatedAt).toISOString().split('T')[0];
      if (!statusGroups[issue.status][date]) {
        statusGroups[issue.status][date] = 0;
      }
      statusGroups[issue.status][date]++;
    });

    // Convert to cumulative flow format
    const dates = Object.keys(
      issuesInRange.reduce((acc, issue) => {
        const date = new Date(issue.updatedAt).toISOString().split('T')[0];
        acc[date] = true;
        return acc;
      }, {} as { [key: string]: boolean })
    ).sort();

    const cumulativeFlowData = dates.map(date => {
      const dataPoint: any = { date };
      
      Object.values(IssueStatus).forEach(status => {
        dataPoint[status] = statusGroups[status][date] || 0;
      });
      
      return dataPoint;
    });

    return cumulativeFlowData;
  }

  async getEpicProgress(projectId: string, userId: string) {
    const epics = await this.epicsService.listEpics(projectId, userId);
    
    const epicProgressData = await Promise.all(
      epics.map(async (epic) => {
        const stories = epic.stories || [];
        
        const totalStories = stories.length;
        const completedStories = stories.filter(story => story.status === 'Done').length;
        const totalStoryPoints = stories.reduce((sum, story) => sum + (story.storyPoints || 0), 0);
        const completedStoryPoints = stories
          .filter(story => story.status === 'Done')
          .reduce((sum, story) => sum + (story.storyPoints || 0), 0);

        return {
          epicId: epic.id,
          epicTitle: epic.title,
          epicStatus: epic.status,
          totalStories,
          completedStories,
          totalStoryPoints,
          completedStoryPoints,
          completionPercentage: totalStories > 0 ? (completedStories / totalStories) * 100 : 0,
          storyPointsCompletionPercentage: totalStoryPoints > 0 ? (completedStoryPoints / totalStoryPoints) * 100 : 0,
          startDate: epic.startDate,
          endDate: epic.endDate,
        };
      }),
    );

    return epicProgressData;
  }

  async getIssueBreakdown(projectId: string, userId: string) {
    const allIssues = await this.issuesService.findAll(projectId, userId);
    
    // Breakdown by type
    const typeBreakdown = allIssues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Breakdown by priority
    const priorityBreakdown = allIssues.reduce((acc, issue) => {
      acc[issue.priority] = (acc[issue.priority] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Breakdown by status
    const statusBreakdown = allIssues.reduce((acc, issue) => {
      acc[issue.status] = (acc[issue.status] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    // Breakdown by assignee
    const assigneeBreakdown = allIssues.reduce((acc, issue) => {
      const assigneeName = issue.assignee?.name || 'Unassigned';
      acc[assigneeName] = (acc[assigneeName] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    return {
      typeBreakdown,
      priorityBreakdown,
      statusBreakdown,
      assigneeBreakdown,
      totalIssues: allIssues.length,
    };
  }
} 