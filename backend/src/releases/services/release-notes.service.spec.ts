// src/releases/services/release-notes.service.spec.ts
import { ReleaseNotesService } from './release-notes.service';
import type { IReleaseQuery } from '../interfaces/releases.interfaces';

describe('ReleaseNotesService', () => {
  let query: jest.Mocked<IReleaseQuery>;
  let svc: ReleaseNotesService;

  beforeEach(() => {
    query = { getIssues: jest.fn() } as unknown as jest.Mocked<IReleaseQuery>;
    svc = new ReleaseNotesService(query);
  });

  it('returns the empty-state notes when no issues are linked', async () => {
    query.getIssues.mockResolvedValue([]);
    const res = await svc.generateReleaseNotes('p1', 'r1', 'u1');
    expect(res.issueCount).toBe(0);
    expect(res.notes).toContain('No issues are linked');
  });

  it('groups issues by type under emoji headings', async () => {
    query.getIssues.mockResolvedValue([
      {
        id: 'i1',
        type: 'Bug',
        title: 'Crash',
        status: 'Done',
        assignee: { name: 'Ada' },
      },
      { id: 'i2', type: 'Feature', title: 'Dark mode', status: 'Done' },
    ] as never);
    const res = await svc.generateReleaseNotes('p1', 'r1', 'u1');
    expect(res.issueCount).toBe(2);
    expect(res.notes).toContain('🐛 Bug Fixes');
    expect(res.notes).toContain('✨ New Features');
    expect(res.notes).toContain('**Crash** (Done) - Ada');
    expect(res.notes).toContain('**Dark mode** (Done) - Unassigned');
  });

  it('truncates long descriptions to 100 chars', async () => {
    const long = 'x'.repeat(150);
    query.getIssues.mockResolvedValue([
      { id: 'i1', type: 'Task', title: 'T', status: 'Open', description: long },
    ] as never);
    const res = await svc.generateReleaseNotes('p1', 'r1', 'u1');
    expect(res.notes).toContain('x'.repeat(100) + '...');
    expect(res.notes).not.toContain('x'.repeat(101) + '.');
  });

  it('falls back to a generic heading for unknown types', async () => {
    query.getIssues.mockResolvedValue([
      { id: 'i1', type: 'Spike', title: 'Research', status: 'Open' },
    ] as never);
    const res = await svc.generateReleaseNotes('p1', 'r1', 'u1');
    expect(res.notes).toContain('📦 Spike');
  });
});
