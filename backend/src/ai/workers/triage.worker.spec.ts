import { Test, TestingModule } from '@nestjs/testing';
import { TriageWorker } from './triage.worker';
import { OpenAiService } from '../services/openai.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { Job } from 'bullmq';

describe('TriageWorker', () => {
  let worker: TriageWorker;
  let issueRepo: { findOne: jest.Mock; save: jest.Mock };
  let openAiService: { generateText: jest.Mock };
  let embeddingsService: { create: jest.Mock };

  beforeEach(async () => {
    issueRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    openAiService = {
      generateText: jest.fn(),
    };
    embeddingsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriageWorker,
        {
          provide: getRepositoryToken(Issue),
          useValue: issueRepo,
        },
        {
          provide: OpenAiService,
          useValue: openAiService,
        },
        {
          provide: EmbeddingsService,
          useValue: embeddingsService,
        },
      ],
    }).compile();

    worker = module.get<TriageWorker>(TriageWorker);
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('should process triage job', async () => {
    const job = { data: { issueId: 'issue-123' } } as unknown as Job<{
      issueId: string;
    }>;
    const issue = {
      id: 'issue-123',
      title: 'Fix bug',
      description: 'App crashes',
      labels: [],
    };

    issueRepo.findOne.mockResolvedValue(issue);
    embeddingsService.create.mockResolvedValue([0.1, 0.2]);
    openAiService.generateText.mockResolvedValue(
      JSON.stringify({ priority: 'High', labels: ['Bug', 'Backend'] }),
    );

    await worker.process(job);

    expect(embeddingsService.create).toHaveBeenCalledWith(
      `${issue.title}\n${issue.description}`,
    );
    expect(issueRepo.save).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedIssue = issueRepo.save.mock.calls[0][0] as Issue;
    expect(savedIssue.embedding).toEqual([0.1, 0.2]);
    expect(savedIssue.priority).toBe('High');
    expect(savedIssue.labels).toContain('Bug');
    expect(savedIssue.labels).toContain('Backend');
  });

  it('should handle errors gracefully (retry)', async () => {
    const job = { data: { issueId: 'issue-123' } } as unknown as Job<{
      issueId: string;
    }>;
    issueRepo.findOne.mockRejectedValue(new Error('DB Error') as never);

    await expect(worker.process(job)).rejects.toThrow('DB Error');
  });
});
