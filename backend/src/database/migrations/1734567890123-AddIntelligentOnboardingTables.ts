import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntelligentOnboardingTables1734567890123
  implements MigrationInterface
{
  name = 'AddIntelligentOnboardingTables1734567890123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create project_templates table
    await queryRunner.query(`
            CREATE TABLE "project_templates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "description" text,
                "category" character varying NOT NULL DEFAULT 'custom',
                "methodology" character varying NOT NULL DEFAULT 'agile',
                "templateConfig" jsonb NOT NULL,
                "isSystemTemplate" boolean NOT NULL DEFAULT true,
                "usageCount" integer NOT NULL DEFAULT '0',
                "isActive" boolean NOT NULL DEFAULT true,
                "createdBy" character varying,
                "icon" character varying,
                "color" character varying,
                "tags" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_project_templates" PRIMARY KEY ("id")
            )
        `);

    // Create user_preferences table
    await queryRunner.query(`
            CREATE TABLE "user_preferences" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "preferences" jsonb NOT NULL,
                "learningData" jsonb,
                "analytics" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_user_preferences" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_user_preferences_userId" UNIQUE ("userId")
            )
        `);

    // Create onboarding_progress table
    await queryRunner.query(`
            CREATE TABLE "onboarding_progress" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" character varying NOT NULL,
                "projectId" character varying,
                "currentStep" character varying NOT NULL DEFAULT 'welcome',
                "steps" jsonb NOT NULL,
                "isCompleted" boolean NOT NULL DEFAULT false,
                "completedAt" TIMESTAMP,
                "context" jsonb,
                "analytics" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_onboarding_progress" PRIMARY KEY ("id")
            )
        `);

    // Create indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_project_templates_category" ON "project_templates" ("category", "isSystemTemplate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_project_templates_methodology" ON "project_templates" ("methodology", "isSystemTemplate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_preferences_userId" ON "user_preferences" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_onboarding_progress_userId_projectId" ON "onboarding_progress" ("userId", "projectId")`,
    );

    // Add foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "user_preferences" ADD CONSTRAINT "FK_user_preferences_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_progress" ADD CONSTRAINT "FK_onboarding_progress_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_progress" ADD CONSTRAINT "FK_onboarding_progress_projectId" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE`,
    );

    // Insert default project templates
    await queryRunner.query(`
            INSERT INTO "project_templates" ("name", "description", "category", "methodology", "templateConfig", "icon", "color", "tags") VALUES
            (
                'Software Development (Agile)',
                'Complete agile development workflow with sprints, stories, and retrospectives',
                'software_development',
                'agile',
                '{
                    "defaultSprintDuration": 14,
                    "defaultIssueTypes": ["Bug", "Task", "Story", "Epic", "Sub-task"],
                    "defaultPriorities": ["Low", "Medium", "High", "Critical"],
                    "defaultStatuses": ["Backlog", "To Do", "In Progress", "In Review", "Done"],
                    "suggestedRoles": [
                        {"role": "Product Owner", "description": "Defines requirements and priorities", "permissions": ["manage_backlog"]},
                        {"role": "Scrum Master", "description": "Facilitates the process", "permissions": ["manage_sprints"]},
                        {"role": "Developer", "description": "Builds the product", "permissions": ["manage_issues"]},
                        {"role": "QA Engineer", "description": "Tests the product", "permissions": ["manage_issues"]}
                    ],
                    "workflowStages": [
                        {"name": "Backlog", "description": "Items waiting to be planned", "order": 1, "isDefault": true},
                        {"name": "Sprint Planning", "description": "Planning next sprint", "order": 2, "isDefault": false},
                        {"name": "In Progress", "description": "Currently being worked on", "order": 3, "isDefault": true},
                        {"name": "Review", "description": "Ready for review", "order": 4, "isDefault": true},
                        {"name": "Done", "description": "Completed", "order": 5, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Sprint Board",
                            "type": "scrum",
                            "columns": [
                                {"name": "To Do", "status": "To Do", "order": 1},
                                {"name": "In Progress", "status": "In Progress", "order": 2},
                                {"name": "Review", "status": "In Review", "order": 3},
                                {"name": "Done", "status": "Done", "order": 4}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "Sprint 1", "description": "First sprint", "estimatedDuration": 14, "order": 1},
                        {"name": "Sprint 2", "description": "Second sprint", "estimatedDuration": 14, "order": 2},
                        {"name": "Release", "description": "Product release", "estimatedDuration": 0, "order": 3}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": false,
                        "suggestDueDates": true,
                        "enableTimeTracking": true,
                        "enableStoryPoints": true,
                        "defaultStoryPointScale": [1, 2, 3, 5, 8, 13, 21]
                    }
                }',
                'code',
                '#3B82F6',
                '["agile", "development", "scrum"]'
            ),
            (
                'Marketing Campaign',
                'End-to-end marketing campaign management with content planning and tracking',
                'marketing',
                'kanban',
                '{
                    "defaultSprintDuration": 7,
                    "defaultIssueTypes": ["Campaign", "Content", "Design", "Research", "Analysis"],
                    "defaultPriorities": ["Low", "Medium", "High", "Urgent"],
                    "defaultStatuses": ["Ideas", "Planning", "In Progress", "Review", "Published"],
                    "suggestedRoles": [
                        {"role": "Campaign Manager", "description": "Oversees the entire campaign", "permissions": ["manage_campaign"]},
                        {"role": "Content Creator", "description": "Creates marketing content", "permissions": ["create_content"]},
                        {"role": "Designer", "description": "Creates visual assets", "permissions": ["create_designs"]},
                        {"role": "Analyst", "description": "Analyzes campaign performance", "permissions": ["view_analytics"]}
                    ],
                    "workflowStages": [
                        {"name": "Ideas", "description": "Campaign ideas and concepts", "order": 1, "isDefault": true},
                        {"name": "Planning", "description": "Detailed planning phase", "order": 2, "isDefault": true},
                        {"name": "Creation", "description": "Creating content and assets", "order": 3, "isDefault": true},
                        {"name": "Review", "description": "Review and approval", "order": 4, "isDefault": true},
                        {"name": "Published", "description": "Live and running", "order": 5, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Campaign Board",
                            "type": "kanban",
                            "columns": [
                                {"name": "Ideas", "status": "Ideas", "order": 1},
                                {"name": "Planning", "status": "Planning", "order": 2},
                                {"name": "In Progress", "status": "In Progress", "order": 3},
                                {"name": "Review", "status": "Review", "order": 4},
                                {"name": "Published", "status": "Published", "order": 5}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "Campaign Launch", "description": "Campaign goes live", "estimatedDuration": 0, "order": 1},
                        {"name": "Mid-Campaign Review", "description": "Performance review", "estimatedDuration": 14, "order": 2},
                        {"name": "Campaign End", "description": "Campaign completion", "estimatedDuration": 30, "order": 3}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": true,
                        "suggestDueDates": true,
                        "enableTimeTracking": false,
                        "enableStoryPoints": false,
                        "defaultStoryPointScale": []
                    }
                }',
                'megaphone',
                '#10B981',
                '["marketing", "campaign", "content"]'
            ),
            (
                'Product Launch',
                'Comprehensive product launch management with go-to-market strategy',
                'product_launch',
                'hybrid',
                '{
                    "defaultSprintDuration": 21,
                    "defaultIssueTypes": ["Feature", "Bug", "Task", "Milestone", "Risk", "Marketing"],
                    "defaultPriorities": ["Low", "Medium", "High", "Critical", "Blocker"],
                    "defaultStatuses": ["Backlog", "Planning", "In Progress", "Testing", "Ready", "Launched"],
                    "suggestedRoles": [
                        {"role": "Product Manager", "description": "Owns product strategy and roadmap", "permissions": ["manage_product"]},
                        {"role": "Engineering Lead", "description": "Leads technical implementation", "permissions": ["manage_engineering"]},
                        {"role": "Marketing Lead", "description": "Handles go-to-market strategy", "permissions": ["manage_marketing"]},
                        {"role": "QA Lead", "description": "Ensures quality and testing", "permissions": ["manage_qa"]},
                        {"role": "Sales Lead", "description": "Prepares sales team and materials", "permissions": ["manage_sales"]}
                    ],
                    "workflowStages": [
                        {"name": "Discovery", "description": "Research and planning phase", "order": 1, "isDefault": true},
                        {"name": "Development", "description": "Building the product", "order": 2, "isDefault": true},
                        {"name": "Testing", "description": "Quality assurance and testing", "order": 3, "isDefault": true},
                        {"name": "Pre-Launch", "description": "Final preparations", "order": 4, "isDefault": true},
                        {"name": "Launch", "description": "Go-to-market execution", "order": 5, "isDefault": true},
                        {"name": "Post-Launch", "description": "Monitoring and optimization", "order": 6, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Launch Board",
                            "type": "hybrid",
                            "columns": [
                                {"name": "Backlog", "status": "Backlog", "order": 1},
                                {"name": "Planning", "status": "Planning", "order": 2},
                                {"name": "In Progress", "status": "In Progress", "order": 3},
                                {"name": "Testing", "status": "Testing", "order": 4},
                                {"name": "Ready", "status": "Ready", "order": 5},
                                {"name": "Launched", "status": "Launched", "order": 6}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "MVP Complete", "description": "Minimum viable product ready", "estimatedDuration": 60, "order": 1},
                        {"name": "Beta Launch", "description": "Limited beta release", "estimatedDuration": 90, "order": 2},
                        {"name": "Public Launch", "description": "Full public launch", "estimatedDuration": 120, "order": 3},
                        {"name": "Post-Launch Review", "description": "Launch success analysis", "estimatedDuration": 150, "order": 4}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": true,
                        "suggestDueDates": true,
                        "enableTimeTracking": true,
                        "enableStoryPoints": true,
                        "defaultStoryPointScale": [1, 2, 3, 5, 8, 13, 21, 34]
                    }
                }',
                'rocket',
                '#F59E0B',
                '["product", "launch", "strategy"]'
            ),
            (
                'Research Project',
                'Academic and business research project management with data analysis',
                'research',
                'waterfall',
                '{
                    "defaultSprintDuration": 30,
                    "defaultIssueTypes": ["Research", "Analysis", "Experiment", "Documentation", "Review"],
                    "defaultPriorities": ["Low", "Medium", "High", "Critical"],
                    "defaultStatuses": ["Proposed", "Approved", "In Progress", "Analysis", "Review", "Published"],
                    "suggestedRoles": [
                        {"role": "Research Lead", "description": "Leads research direction and methodology", "permissions": ["manage_research"]},
                        {"role": "Data Analyst", "description": "Analyzes research data", "permissions": ["analyze_data"]},
                        {"role": "Research Assistant", "description": "Supports research activities", "permissions": ["support_research"]},
                        {"role": "Reviewer", "description": "Reviews research outputs", "permissions": ["review_outputs"]}
                    ],
                    "workflowStages": [
                        {"name": "Proposal", "description": "Research proposal and approval", "order": 1, "isDefault": true},
                        {"name": "Planning", "description": "Detailed research planning", "order": 2, "isDefault": true},
                        {"name": "Data Collection", "description": "Gathering research data", "order": 3, "isDefault": true},
                        {"name": "Analysis", "description": "Data analysis and interpretation", "order": 4, "isDefault": true},
                        {"name": "Review", "description": "Peer review and validation", "order": 5, "isDefault": true},
                        {"name": "Publication", "description": "Publishing results", "order": 6, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Research Board",
                            "type": "waterfall",
                            "columns": [
                                {"name": "Proposed", "status": "Proposed", "order": 1},
                                {"name": "Approved", "status": "Approved", "order": 2},
                                {"name": "In Progress", "status": "In Progress", "order": 3},
                                {"name": "Analysis", "status": "Analysis", "order": 4},
                                {"name": "Review", "status": "Review", "order": 5},
                                {"name": "Published", "status": "Published", "order": 6}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "Proposal Approved", "description": "Research proposal accepted", "estimatedDuration": 30, "order": 1},
                        {"name": "Data Collection Complete", "description": "All data gathered", "estimatedDuration": 90, "order": 2},
                        {"name": "Analysis Complete", "description": "Data analysis finished", "estimatedDuration": 120, "order": 3},
                        {"name": "Results Published", "description": "Research published", "estimatedDuration": 180, "order": 4}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": false,
                        "suggestDueDates": true,
                        "enableTimeTracking": true,
                        "enableStoryPoints": false,
                        "defaultStoryPointScale": []
                    }
                }',
                'academic-cap',
                '#8B5CF6',
                '["research", "academic", "analysis"]'
            ),
            (
                'Event Planning',
                'Complete event planning and management workflow',
                'event_planning',
                'waterfall',
                '{
                    "defaultSprintDuration": 14,
                    "defaultIssueTypes": ["Task", "Vendor", "Logistics", "Marketing", "Follow-up"],
                    "defaultPriorities": ["Low", "Medium", "High", "Urgent"],
                    "defaultStatuses": ["Planning", "Confirmed", "In Progress", "Review", "Complete"],
                    "suggestedRoles": [
                        {"role": "Event Manager", "description": "Oversees entire event", "permissions": ["manage_event"]},
                        {"role": "Logistics Coordinator", "description": "Handles logistics and setup", "permissions": ["manage_logistics"]},
                        {"role": "Marketing Coordinator", "description": "Manages marketing and promotion", "permissions": ["manage_marketing"]},
                        {"role": "Vendor Manager", "description": "Manages vendor relationships", "permissions": ["manage_vendors"]}
                    ],
                    "workflowStages": [
                        {"name": "Planning", "description": "Initial planning and concept", "order": 1, "isDefault": true},
                        {"name": "Vendor Selection", "description": "Choosing and booking vendors", "order": 2, "isDefault": true},
                        {"name": "Marketing", "description": "Promotion and marketing", "order": 3, "isDefault": true},
                        {"name": "Execution", "description": "Event execution", "order": 4, "isDefault": true},
                        {"name": "Follow-up", "description": "Post-event activities", "order": 5, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Event Board",
                            "type": "waterfall",
                            "columns": [
                                {"name": "Planning", "status": "Planning", "order": 1},
                                {"name": "Confirmed", "status": "Confirmed", "order": 2},
                                {"name": "In Progress", "status": "In Progress", "order": 3},
                                {"name": "Review", "status": "Review", "order": 4},
                                {"name": "Complete", "status": "Complete", "order": 5}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "Event Date Confirmed", "description": "Event date and venue secured", "estimatedDuration": 30, "order": 1},
                        {"name": "Vendors Booked", "description": "All vendors confirmed", "estimatedDuration": 60, "order": 2},
                        {"name": "Marketing Launch", "description": "Marketing campaign starts", "estimatedDuration": 90, "order": 3},
                        {"name": "Event Day", "description": "Event execution", "estimatedDuration": 120, "order": 4}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": true,
                        "suggestDueDates": true,
                        "enableTimeTracking": false,
                        "enableStoryPoints": false,
                        "defaultStoryPointScale": []
                    }
                }',
                'calendar',
                '#EF4444',
                '["event", "planning", "coordination"]'
            ),
            (
                'Website Development',
                'Modern website development with design and deployment',
                'website_development',
                'agile',
                '{
                    "defaultSprintDuration": 14,
                    "defaultIssueTypes": ["Bug", "Feature", "Design", "Content", "SEO", "Performance"],
                    "defaultPriorities": ["Low", "Medium", "High", "Critical"],
                    "defaultStatuses": ["Backlog", "Design", "Development", "Testing", "Deployed"],
                    "suggestedRoles": [
                        {"role": "Project Manager", "description": "Manages project timeline and scope", "permissions": ["manage_project"]},
                        {"role": "Frontend Developer", "description": "Builds user interface", "permissions": ["develop_frontend"]},
                        {"role": "Backend Developer", "description": "Develops server-side functionality", "permissions": ["develop_backend"]},
                        {"role": "UI/UX Designer", "description": "Creates user experience design", "permissions": ["design_ui"]},
                        {"role": "Content Writer", "description": "Creates website content", "permissions": ["create_content"]}
                    ],
                    "workflowStages": [
                        {"name": "Discovery", "description": "Requirements and research", "order": 1, "isDefault": true},
                        {"name": "Design", "description": "UI/UX design phase", "order": 2, "isDefault": true},
                        {"name": "Development", "description": "Building the website", "order": 3, "isDefault": true},
                        {"name": "Testing", "description": "Quality assurance", "order": 4, "isDefault": true},
                        {"name": "Launch", "description": "Website deployment", "order": 5, "isDefault": true}
                    ],
                    "defaultBoards": [
                        {
                            "name": "Development Board",
                            "type": "scrum",
                            "columns": [
                                {"name": "Backlog", "status": "Backlog", "order": 1},
                                {"name": "Design", "status": "Design", "order": 2},
                                {"name": "Development", "status": "Development", "order": 3},
                                {"name": "Testing", "status": "Testing", "order": 4},
                                {"name": "Deployed", "status": "Deployed", "order": 5}
                            ]
                        }
                    ],
                    "defaultMilestones": [
                        {"name": "Design Complete", "description": "UI/UX design approved", "estimatedDuration": 21, "order": 1},
                        {"name": "MVP Ready", "description": "Minimum viable product", "estimatedDuration": 42, "order": 2},
                        {"name": "Beta Launch", "description": "Beta version deployed", "estimatedDuration": 63, "order": 3},
                        {"name": "Production Launch", "description": "Live website launch", "estimatedDuration": 84, "order": 4}
                    ],
                    "smartDefaults": {
                        "autoAssignIssues": true,
                        "suggestDueDates": true,
                        "enableTimeTracking": true,
                        "enableStoryPoints": true,
                        "defaultStoryPointScale": [1, 2, 3, 5, 8, 13]
                    }
                }',
                'globe-alt',
                '#06B6D4',
                '["website", "development", "design"]'
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "onboarding_progress" DROP CONSTRAINT "FK_onboarding_progress_projectId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_progress" DROP CONSTRAINT "FK_onboarding_progress_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preferences" DROP CONSTRAINT "FK_user_preferences_userId"`,
    );

    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "IDX_onboarding_progress_userId_projectId"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_user_preferences_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_project_templates_methodology"`);
    await queryRunner.query(`DROP INDEX "IDX_project_templates_category"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "onboarding_progress"`);
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`DROP TABLE "project_templates"`);
  }
}
