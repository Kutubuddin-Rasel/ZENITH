import { CycleTimeCalculator } from './cycle-time.calculator';
import { Revision } from '../../revisions/entities/revision.entity';
import type {
  CycleTimeIssueRow,
  CycleTimeMetric,
} from '../interfaces/analytics.interfaces';

// ---------------------------------------------------------------------------
// Test Data Factories
// ---------------------------------------------------------------------------

const issue = (overrides?: Partial<CycleTimeIssueRow>): CycleTimeIssueRow => ({
  id: 'issue-1',
  title: 'Test Issue',
  status: 'Done',
  updatedAt: new Date('2023-01-02T12:00:00Z'),
  ...overrides,
});

// 24h cycle: To Do (Jan 1 12:00) → Done (Jan 2 12:00).
const dayLongRevisions = (entityId: string): Partial<Revision>[] => [
  {
    id: 'rev-3',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-02T12:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'Done' },
    changedBy: 'user-1',
  },
  {
    id: 'rev-2',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T12:00:00Z'),
    action: 'UPDATE',
    snapshot: { status: 'To Do' },
    changedBy: 'user-1',
  },
  {
    id: 'rev-1',
    entityId,
    entityType: 'Issue',
    createdAt: new Date('2023-01-01T10:00:00Z'),
    action: 'CREATE',
    snapshot: { status: 'To Do' },
    changedBy: 'user-1',
  },
];

describe('CycleTimeCalculator', () => {
  let calc: CycleTimeCalculator;

  beforeEach(() => {
    calc = new CycleTimeCalculator();
  });

  describe('computeIssueCycleTime', () => {
    it('computes the start→done span in hours from revisions', () => {
      const metric = calc.computeIssueCycleTime(
        issue(),
        dayLongRevisions('issue-1') as Revision[],
      );
      expect(metric).not.toBeNull();
      expect(metric?.cycleTimeHours).toBe(24);
      expect(metric?.issueId).toBe('issue-1');
    });

    it('falls back to a 1-hour window when no start transition exists', () => {
      // Only a CREATE revision → no UPDATE-out-of-todo → fallback applies.
      const metric = calc.computeIssueCycleTime(issue(), [
        {
          id: 'rev-1',
          entityId: 'issue-1',
          entityType: 'Issue',
          createdAt: new Date('2023-01-02T12:00:00Z'),
          action: 'CREATE',
          snapshot: { status: 'To Do' },
          changedBy: 'user-1',
        } as Revision,
      ]);
      expect(metric?.cycleTimeHours).toBe(1);
    });

    it('never returns a negative cycle time', () => {
      const metric = calc.computeIssueCycleTime(issue(), []);
      expect(metric?.cycleTimeHours).toBeGreaterThanOrEqual(0);
    });
  });

  describe('summarize', () => {
    const metrics: CycleTimeMetric[] = [
      {
        issueId: 'a',
        issueTitle: 'A',
        cycleTimeHours: 24,
        completedAt: new Date(),
      },
      {
        issueId: 'b',
        issueTitle: 'B',
        cycleTimeHours: 48,
        completedAt: new Date(),
      },
    ];

    it('aggregates average + percentiles in days', () => {
      const result = calc.summarize(metrics, 'detailed', 0);
      expect(result.averageDays).toBe(1.5); // (24+48)/2 = 36h = 1.5d
      expect(result.totalIssues).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it("omits per-issue data in 'summary' usage", () => {
      const result = calc.summarize(metrics, 'summary', 0);
      expect(result.data).toEqual([]);
    });

    it('derives trend by comparing against the previous-period average', () => {
      expect(calc.summarize(metrics, 'summary', 0.5).trend).toBe('up');
      expect(calc.summarize(metrics, 'summary', 5).trend).toBe('down');
      expect(calc.summarize(metrics, 'summary', 1.5).trend).toBe('flat');
    });
  });

  describe('averageDaysForPeriod', () => {
    it('returns 0 for an empty window', () => {
      expect(calc.averageDaysForPeriod([], new Map())).toBe(0);
    });

    it('averages only issues that have a detectable start transition', () => {
      const map = new Map<string, Revision[]>([
        ['issue-1', dayLongRevisions('issue-1') as Revision[]],
      ]);
      expect(calc.averageDaysForPeriod([issue()], map)).toBe(1); // 24h = 1d
    });
  });
});
