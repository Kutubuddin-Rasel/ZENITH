/**
 * Tenant Isolation E2E Test - "Red Team" Verification
 *
 * This test proves that the TenantRepository correctly isolates data between tenants.
 * Uses PostgreSQL with unique table names to avoid conflicts.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';
import { ClsModule, ClsService } from 'nestjs-cls';

// Tenant infrastructure
import {
  TenantModule,
  TenantContext,
  TenantRepositoryFactory,
  TENANT_ID_KEY,
} from 'src/core/tenant';

// Unique test run ID to avoid table conflicts
const TEST_RUN_ID = Date.now().toString().slice(-6);

// ============================================================
// SIMPLIFIED TEST ENTITIES with unique table names
// ============================================================

@Entity(`test_orgs_${TEST_RUN_ID}`)
class TestOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
}

@Entity(`test_projects_${TEST_RUN_ID}`)
class TestProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  key: string;

  @Column({ type: 'uuid', nullable: true })
  organizationId?: string;

  @Column({ default: false })
  isArchived: boolean;
}

/**
 * TEST SCENARIO:
 * 1. Create Tenant A (Acme Corp) and Tenant B (Globex Corp)
 * 2. Create a Project under Tenant A
 * 3. Simulate request from User in Tenant B
 * 4. Assert: TenantRepository returns null/empty (NOT the data)
 */
describe('Tenant Isolation (Red Team Test)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let projectRepo: Repository<TestProject>;
  let orgRepo: Repository<TestOrganization>;
  let tenantContext: TenantContext;
  let tenantRepoFactory: TenantRepositoryFactory;
  let clsService: ClsService;

  // Test data
  let tenantA: TestOrganization;
  let tenantB: TestOrganization;
  let projectInTenantA: TestProject;

  // Get test database URL - construct from individual vars if needed
  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    (process.env.DATABASE_HOST
      ? `postgresql://${process.env.DATABASE_USER || 'postgres'}:${process.env.DATABASE_PASS || 'postgres'}@${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT || 5432}/${process.env.DATABASE_NAME || 'zenith_db'}`
      : null);

  // Skip tests if no database is available
  const shouldRunIntegrationTests = !!testDbUrl;

  beforeAll(async () => {
    if (!shouldRunIntegrationTests) {
      console.warn(
        'SKIPPING INTEGRATION TESTS: No TEST_DATABASE_URL or DATABASE_URL set',
      );
      return;
    }

    console.log(`Using database: ${testDbUrl?.replace(/:[^:@]+@/, ':***@')}`);
    console.log(
      `Test tables: test_orgs_${TEST_RUN_ID}, test_projects_${TEST_RUN_ID}`,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        // CLS for request-scoped context
        ClsModule.forRoot({
          global: true,
          middleware: { mount: true },
        }),
        // Use PostgreSQL - no schema, just unique table names
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: testDbUrl,
          entities: [TestProject, TestOrganization],
          synchronize: true, // Auto-create tables for test entities
          logging: false,
        }),
        TypeOrmModule.forFeature([TestProject, TestOrganization]),
        TenantModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    projectRepo = moduleFixture.get<Repository<TestProject>>(
      getRepositoryToken(TestProject),
    );
    orgRepo = moduleFixture.get<Repository<TestOrganization>>(
      getRepositoryToken(TestOrganization),
    );
    tenantContext = moduleFixture.get<TenantContext>(TenantContext);
    tenantRepoFactory = moduleFixture.get<TenantRepositoryFactory>(
      TenantRepositoryFactory,
    );
    clsService = moduleFixture.get<ClsService>(ClsService);

    // Setup test data
    await setupTestData();
  }, 60000);

  afterAll(async () => {
    if (!shouldRunIntegrationTests) return;

    // Clean up test tables
    try {
      if (dataSource?.isInitialized) {
        // Drop our test tables explicitly
        await dataSource.query(
          `DROP TABLE IF EXISTS "test_projects_${TEST_RUN_ID}" CASCADE`,
        );
        await dataSource.query(
          `DROP TABLE IF EXISTS "test_orgs_${TEST_RUN_ID}" CASCADE`,
        );
        await dataSource.destroy();
      }
    } catch (e) {
      console.warn('Cleanup error:', e);
    }
    if (app) {
      await app.close();
    }
  });

  async function setupTestData() {
    // Create Tenant A (Acme Corp)
    tenantA = orgRepo.create({ name: 'Acme Corp' });
    tenantA = await orgRepo.save(tenantA);

    // Create Tenant B (Globex Corp)
    tenantB = orgRepo.create({ name: 'Globex Corp' });
    tenantB = await orgRepo.save(tenantB);

    // Create Project in Tenant A
    projectInTenantA = projectRepo.create({
      name: 'Secret Acme Project',
      key: 'ACME',
      organizationId: tenantA.id,
      isArchived: false,
    });
    projectInTenantA = await projectRepo.save(projectInTenantA);
  }

  /**
   * Helper to run code within a CLS context with a specific tenant
   */
  async function runAsTenant<T>(
    tenantId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return clsService.run(async () => {
      clsService.set(TENANT_ID_KEY, tenantId);
      return fn();
    });
  }

  // ============================================================
  // TEST CASES
  // ============================================================

  describe('TenantRepository.find()', () => {
    it('should return projects for the current tenant only', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run as Tenant A - should see the project
      const projectsAsA = await runAsTenant(tenantA.id, async () => {
        return tenantProjectRepo.find();
      });

      expect(projectsAsA).toHaveLength(1);
      expect(projectsAsA[0].name).toBe('Secret Acme Project');
    });

    it('should return EMPTY array when querying as different tenant (RED TEAM)', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run as Tenant B - should NOT see Tenant A's project
      const projectsAsB = await runAsTenant(tenantB.id, async () => {
        return tenantProjectRepo.find();
      });

      // CRITICAL ASSERTION: No data leakage!
      expect(projectsAsB).toHaveLength(0);
    });
  });

  describe('TenantRepository.findOne()', () => {
    it('should return project for the owning tenant', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run as Tenant A - should find the project
      const projectAsA = await runAsTenant(tenantA.id, async () => {
        return tenantProjectRepo.findOne({
          where: { id: projectInTenantA.id },
        });
      });

      expect(projectAsA).not.toBeNull();
      expect(projectAsA?.name).toBe('Secret Acme Project');
    });

    it("should return NULL when accessing another tenant's data by ID (RED TEAM)", async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // ATTACK SCENARIO: Tenant B tries to access Tenant A's project by ID
      const projectAsB = await runAsTenant(tenantB.id, async () => {
        return tenantProjectRepo.findOne({
          where: { id: projectInTenantA.id },
        });
      });

      // CRITICAL ASSERTION: Cannot access by direct ID!
      expect(projectAsB).toBeNull();
    });
  });

  describe('TenantRepository.count()', () => {
    it('should only count entities in current tenant', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Tenant A count
      const countA = await runAsTenant(tenantA.id, async () => {
        return tenantProjectRepo.count();
      });
      expect(countA).toBe(1);

      // Tenant B count
      const countB = await runAsTenant(tenantB.id, async () => {
        return tenantProjectRepo.count();
      });
      expect(countB).toBe(0);
    });
  });

  describe('TenantRepository.createQueryBuilder()', () => {
    it('should auto-inject tenant filter in QueryBuilder (use .andWhere)', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run as Tenant B with QueryBuilder
      // NOTE: Must use .andWhere() to preserve the tenant filter
      // Using .where() would OVERWRITE the pre-applied tenant filter
      const projectsAsB = await runAsTenant(tenantB.id, async () => {
        return tenantProjectRepo
          .createQueryBuilder('project')
          .andWhere('project.name LIKE :name', { name: '%Acme%' })
          .getMany();
      });

      // Even with explicit name filter, tenant filter should prevent access
      expect(projectsAsB).toHaveLength(0);
    });

    it('should allow mixing tenant filter with other conditions', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run as Tenant A with additional filter
      const projectsAsA = await runAsTenant(tenantA.id, async () => {
        return tenantProjectRepo
          .createQueryBuilder('project')
          .andWhere('project.isArchived = :archived', { archived: false })
          .getMany();
      });

      expect(projectsAsA).toHaveLength(1);
    });
  });

  describe('Bypass Functionality', () => {
    it('should allow bypass for admin operations', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Admin operation with bypass enabled
      const allProjects = await runAsTenant(tenantB.id, async () => {
        // Enable bypass (simulating admin context)
        tenantContext.enableBypass();

        try {
          return tenantProjectRepo.find();
        } finally {
          // IMPORTANT: Always disable bypass after use
          tenantContext.disableBypass();
        }
      });

      // With bypass, can see all tenants' data
      expect(allProjects.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('No Tenant Context', () => {
    it('should return all data when no tenant is set (dangerous - log warning)', async () => {
      if (!shouldRunIntegrationTests) return;

      const tenantProjectRepo = tenantRepoFactory.create(projectRepo);

      // Run without setting tenant (e.g., system background job)
      const allProjects = await clsService.run(async () => {
        // Note: Not setting TENANT_ID_KEY
        return tenantProjectRepo.find();
      });

      // Without tenant context, no filter is applied
      expect(allProjects.length).toBeGreaterThanOrEqual(1);
    });
  });
});
