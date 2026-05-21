import { Test, TestingModule } from '@nestjs/testing';
import {
  InvitesController,
  ProjectInvitesController,
} from './invites.controller';
import {
  INVITE_COMMAND_TOKEN,
  INVITE_QUERY_TOKEN,
} from './constants/invites.tokens';
import { PermissionsGuard } from '../core/auth/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatelessCsrfGuard } from '../auth/guards/csrf.guard';

/**
 * Step-3 controller smoke spec. The controllers no longer depend on
 * the deleted `InvitesService` god-class — they inject the ISP tokens
 * directly. These tests only assert that the controllers can be
 * instantiated with token-shaped mocks; full HTTP/integration coverage
 * lives in the e2e suite.
 */
describe('Invites controllers', () => {
  const mockCommand = {
    createInvite: jest.fn(),
    revokeInvite: jest.fn(),
    resendInvite: jest.fn(),
    respondToInvite: jest.fn(),
    bulkInvite: jest.fn(),
  };

  const mockQuery = {
    findOneByToken: jest.fn(),
    findForProject: jest.fn(),
    findActivePendingByUser: jest.fn(),
    findActivePendingByEmail: jest.fn(),
  };

  let invitesController: InvitesController;
  let projectInvitesController: ProjectInvitesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvitesController, ProjectInvitesController],
      providers: [
        { provide: INVITE_COMMAND_TOKEN, useValue: mockCommand },
        { provide: INVITE_QUERY_TOKEN, useValue: mockQuery },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StatelessCsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();

    invitesController = module.get<InvitesController>(InvitesController);
    projectInvitesController = module.get<ProjectInvitesController>(
      ProjectInvitesController,
    );
  });

  it('InvitesController should be defined', () => {
    expect(invitesController).toBeDefined();
  });

  it('ProjectInvitesController should be defined', () => {
    expect(projectInvitesController).toBeDefined();
  });
});
