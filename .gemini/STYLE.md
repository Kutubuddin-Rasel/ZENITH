# Zenith Project - AI Assistant Guidelines

> These rules establish the standards for AI-assisted development on the Zenith project.
> The AI should operate as a **20+ years experienced senior software engineer** who thinks critically,
> writes clean code, and maintains professional standards throughout all interactions.

---

## 🧠 Core Mindset & Philosophy

### Think Before Coding
- **ALWAYS analyze the problem thoroughly** before proposing or implementing solutions
- Consider edge cases, error scenarios, and potential side effects upfront
- Ask clarifying questions when requirements are ambiguous—never assume
- Evaluate multiple approaches mentally before selecting the optimal one
- Consider the "why" behind every decision, not just the "what"

### Maintainability Over Cleverness
- Prefer readable, straightforward code over "smart" one-liners
- Future developers (including AI) will need to understand and modify this code
- If a solution requires extensive comments to explain, it's probably too complex
- Favor explicit code over implicit behavior

### Consistency Is Non-Negotiable
- Follow existing patterns in the codebase—don't introduce new paradigms without discussion
- Match naming conventions, file structures, and coding styles already established
- When in doubt, look at how similar features are implemented elsewhere in the project

---

## 🏗️ Backend Rules (NestJS + TypeORM)

### Module Architecture
```
src/
├── {module-name}/
│   ├── dto/                    # Data Transfer Objects with class-validator
│   ├── entities/               # TypeORM entities
│   ├── {module-name}.controller.ts
│   ├── {module-name}.service.ts
│   ├── {module-name}.module.ts
│   └── {module-name}.*.spec.ts # Tests alongside source files
```

### Controller Standards
- Controllers are **thin**—delegate ALL business logic to services
- Always use appropriate NestJS decorators: `@Get()`, `@Post()`, `@Patch()`, `@Delete()`
- Apply guards at controller or method level: `@UseGuards(JwtAuthGuard)`
- Use DTOs for request validation—NEVER trust raw request data
- Return consistent response shapes across all endpoints

```typescript
// ✅ CORRECT: Thin controller, proper decorators
@Controller('projects/:projectId/issues')
@UseGuards(JwtAuthGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post()
  @RequireProjectRole('Member', 'ProjectLead')
  create(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateIssueDto,
  ) {
    return this.issuesService.create(projectId, user.id, dto, user.organizationId);
  }
}

// ❌ WRONG: Business logic in controller
@Post()
create(@Body() dto: CreateIssueDto) {
  const issue = new Issue();
  issue.title = dto.title;
  // DON'T DO THIS - move to service
  return this.issueRepo.save(issue);
}
```

### Service Standards
- Services contain ALL business logic
- Always validate entity relationships before operations
- Use **transactions** for operations affecting multiple entities
- Emit events for cross-cutting concerns (notifications, audit logs)
- Implement proper **caching** strategies with invalidation

```typescript
// ✅ CORRECT: Complete validation chain
async update(projectId: string, issueId: string, userId: string, dto: UpdateIssueDto): Promise<Issue> {
  // 1. Validate project exists and user has access
  await this.projectsService.findOneById(projectId, organizationId);
  
  // 2. Validate issue exists in project
  const issue = await this.findOne(projectId, issueId, userId);
  
  // 3. Check user permissions
  const userRole = await this.projectMembersService.getUserRole(projectId, userId);
  if (userRole !== 'ProjectLead' && issue.assigneeId !== userId) {
    throw new ForbiddenException('Insufficient permissions');
  }
  
  // 4. Validate any referenced entities (e.g., new assignee)
  if (dto.assigneeId) {
    const assigneeRole = await this.projectMembersService.getUserRole(projectId, dto.assigneeId);
    if (!assigneeRole) {
      throw new BadRequestException('Assignee is not a project member');
    }
  }
  
  // 5. Perform update
  Object.assign(issue, dto);
  const saved = await this.issueRepo.save(issue);
  
  // 6. Invalidate cache
  await this.cacheService.del(`issue:${issueId}`);
  
  // 7. Emit event for side effects
  this.eventEmitter.emit('issue.updated', { projectId, issueId, actorId: userId });
  
  return saved;
}
```

### Entity Standards
- Use `@Entity()` decorator with explicit table name when needed
- Define `@Index()` on frequently queried columns
- Use proper TypeORM relation decorators with explicit options
- Always include `createdAt` and `updatedAt` timestamps
- Use UUIDs for primary keys (already established pattern)

```typescript
@Entity('issues')
@Index(['projectId', 'status'])  // Compound index for common query
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()  // Individual index for search
  title: string;

  @Column({ type: 'enum', enum: IssueStatus, default: IssueStatus.TODO })
  status: IssueStatus;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### DTO Standards
- Use `class-validator` decorators for ALL validation
- Make use of `@IsOptional()`, `@IsUUID()`, `@IsEnum()`, etc.
- Document constraints with descriptive error messages
- Use `PartialType()` or `PickType()` from `@nestjs/mapped-types` for update DTOs

```typescript
export class CreateIssueDto {
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(IssuePriority, { message: 'Invalid priority value' })
  priority?: IssuePriority;

  @IsOptional()
  @IsUUID('4', { message: 'Invalid assignee ID format' })
  assigneeId?: string;
}

export class UpdateIssueDto extends PartialType(CreateIssueDto) {}
```

### Error Handling
- Use NestJS built-in exceptions: `NotFoundException`, `BadRequestException`, `ForbiddenException`
- Provide meaningful error messages that help debug issues
- Never expose internal error details (stack traces, SQL) to clients
- Log errors with context for debugging

```typescript
// ✅ CORRECT: Specific, helpful errors
if (!project) {
  throw new NotFoundException(`Project with ID ${projectId} not found`);
}

if (!userRole) {
  throw new ForbiddenException('You are not a member of this project');
}

// ❌ WRONG: Generic or exposing internals
throw new Error('Something went wrong');
throw new Error(sqlError.message);
```

### Performance Considerations
- Use `select` in queries to fetch only needed columns
- Implement pagination for list endpoints
- Use database indexes for frequently filtered columns
- Cache expensive computations and frequently accessed data
- Use query builder for complex queries instead of multiple find() calls

```typescript
// ✅ CORRECT: Optimized query
const qb = this.issueRepo.createQueryBuilder('issue');
qb.select(['issue.id', 'issue.title', 'issue.status', 'issue.priority']);
qb.leftJoin('issue.assignee', 'assignee');
qb.addSelect(['assignee.id', 'assignee.name']);
qb.where('issue.projectId = :projectId', { projectId });
qb.take(limit).skip(offset);
return qb.getMany();

// ❌ WRONG: Over-fetching with all relations
return this.issueRepo.find({
  where: { projectId },
  relations: ['assignee', 'reporter', 'project', 'parent', 'children', 'comments', 'attachments'],
});
```

---

## 🎨 Frontend Rules (Next.js 15 + React)

### Component Architecture
```
src/
├── app/                        # Next.js App Router pages
│   ├── {route}/
│   │   └── page.tsx           # Page component
├── components/                 # Reusable UI components
│   ├── {ComponentName}.tsx    # PascalCase naming
├── hooks/                      # Custom React hooks
│   └── use{HookName}.ts       # camelCase with 'use' prefix
├── context/                    # React Context providers
├── lib/                        # Utilities and helpers
└── stores/                     # Zustand stores
```

### Component Standards
- Use **functional components** with hooks exclusively
- Implement proper TypeScript interfaces for all props
- Use `"use client"` directive only when necessary (interactivity required)
- Prefer Server Components for static content
- Memoize expensive computations and callbacks when appropriate

```typescript
// ✅ CORRECT: Properly typed component with clear structure
"use client";

interface IssueCardProps {
  issue: Issue;
  onEdit?: (issue: Issue) => void;
  onDelete?: (issueId: string) => void;
  isEditable?: boolean;
}

export default function IssueCard({ 
  issue, 
  onEdit, 
  onDelete, 
  isEditable = false 
}: IssueCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const handleEdit = useCallback(() => {
    onEdit?.(issue);
  }, [issue, onEdit]);

  return (
    <div 
      className="rounded-lg border p-4 transition-shadow hover:shadow-md"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Component content */}
    </div>
  );
}

// ❌ WRONG: Missing types, inline handlers, no memoization
export default function IssueCard({ issue, onEdit }) {
  return (
    <div onClick={() => onEdit(issue)}>
      {/* Missing types, recreating handler every render */}
    </div>
  );
}
```

### React Query (TanStack Query) Standards
- Create custom hooks for ALL API interactions
- Use consistent query key patterns: `[entity, id, filters]`
- Implement proper error boundaries and loading states
- Use `enabled` option to prevent unnecessary fetches
- Invalidate related queries on mutations

```typescript
// ✅ CORRECT: Well-structured custom hook
export function useProjectIssues(projectId: string, filters?: IssueFilters) {
  const queryKey = ['project-issues', projectId, filters];

  return useQuery<Issue[], Error>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
      }
      return apiFetch(`/projects/${projectId}/issues?${params}`);
    },
    enabled: !!projectId,  // Only fetch when projectId exists
    staleTime: 1000 * 60 * 5,  // Consider fresh for 5 minutes
  });
}

export function useUpdateIssue(projectId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ issueId, data }) => {
      return apiFetch(`/projects/${projectId}/issues/${issueId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['project-issues', projectId] });
      queryClient.invalidateQueries({ queryKey: ['issue-details', variables.issueId] });
    },
  });
}
```

### Form Handling Standards
- Use `react-hook-form` with `zod` for validation (already established)
- Define schemas outside components for reusability
- Provide immediate, clear validation feedback
- Handle loading and error states explicitly

```typescript
// ✅ CORRECT: Schema-driven form with proper validation
const createIssueSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().optional(),
  priority: z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']),
  assigneeId: z.string().uuid().optional(),
});

type CreateIssueFormData = z.infer<typeof createIssueSchema>;

function CreateIssueForm({ projectId, onSuccess }: Props) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateIssueFormData>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: { priority: 'Medium' },
  });

  const createIssue = useCreateIssue();

  const onSubmit = async (data: CreateIssueFormData) => {
    try {
      await createIssue.mutateAsync({ ...data, projectId });
      onSuccess?.();
    } catch (error) {
      // Error handling
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('title')} error={errors.title?.message} />
      {/* More fields */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create Issue'}
      </Button>
    </form>
  );
}
```

### Styling Standards (Tailwind CSS)
- Use Tailwind utility classes following project conventions
- Create consistent spacing: `p-4`, `gap-4`, `space-y-4`
- Use `dark:` variants for dark mode support
- Extract repeated patterns into component classes when needed
- Follow mobile-first responsive design: `md:`, `lg:`, `xl:`

```typescript
// ✅ CORRECT: Consistent, readable Tailwind classes
<div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:shadow-md transition-shadow">
  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
    {title}
  </h3>
  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
    {description}
  </p>
</div>

// ❌ WRONG: Inconsistent spacing, missing dark mode
<div className="rounded border p-3 bg-white">
  <h3 className="text-lg font-bold">{title}</h3>
  <p className="mt-1 text-gray-500">{description}</p>
</div>
```

### Error & Loading States
- ALWAYS handle loading, error, and empty states
- Use skeleton loaders for better perceived performance
- Provide actionable error messages with retry options
- Consider optimistic updates for better UX

```typescript
// ✅ CORRECT: Complete state handling
function IssuesList({ projectId }: Props) {
  const { issues, isLoading, isError, error, refetch } = useProjectIssues(projectId);

  if (isLoading) {
    return <IssuesListSkeleton count={5} />;
  }

  if (isError) {
    return (
      <ErrorState 
        message={error?.message || 'Failed to load issues'} 
        onRetry={refetch}
      />
    );
  }

  if (!issues?.length) {
    return <EmptyState message="No issues found" action={<CreateIssueButton />} />;
  }

  return (
    <div className="space-y-4">
      {issues.map(issue => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
```

---

## 🔒 Security Standards

### Never Trust User Input
- Validate ALL input on backend regardless of frontend validation
- Sanitize data before database operations
- Use parameterized queries (TypeORM handles this automatically)
- Escape output when rendering user-generated content

### Authorization Checks
- Verify user permissions at the service level, not just guards
- Check resource ownership before any operation
- Use organization context for multi-tenant isolation
- Log security-relevant events

```typescript
// ✅ CORRECT: Multi-layer authorization
async deleteIssue(projectId: string, issueId: string, userId: string, organizationId: string) {
  // 1. Verify project belongs to organization
  const project = await this.projectsService.findOneById(projectId, organizationId);
  if (!project) {
    throw new NotFoundException('Project not found');
  }

  // 2. Verify issue belongs to project
  const issue = await this.issueRepo.findOne({ where: { id: issueId, projectId } });
  if (!issue) {
    throw new NotFoundException('Issue not found');
  }

  // 3. Verify user has permission
  const userRole = await this.projectMembersService.getUserRole(projectId, userId);
  if (userRole !== 'ProjectLead') {
    throw new ForbiddenException('Only project leads can delete issues');
  }

  // 4. Perform deletion
  await this.issueRepo.remove(issue);
  
  // 5. Audit log
  this.eventEmitter.emit('issue.deleted', { projectId, issueId, actorId: userId });
}
```

### Sensitive Data Handling
- Never log passwords, tokens, or PII
- Use environment variables for secrets
- Implement proper token rotation and expiry
- Encrypt sensitive data at rest when appropriate

---

## 📝 Code Quality Standards

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Files (Backend) | kebab-case | `issues.service.ts`, `create-issue.dto.ts` |
| Files (Frontend) | PascalCase (components), camelCase (hooks) | `IssueCard.tsx`, `useProjectIssues.ts` |
| Classes | PascalCase | `IssuesService`, `CreateIssueDto` |
| Functions/Methods | camelCase | `createIssue`, `findOneById` |
| Variables | camelCase | `projectId`, `userRole` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_PAGE_SIZE` |
| Enums | PascalCase | `IssueStatus`, `IssuePriority` |
| Enum Values | PascalCase or SCREAMING_SNAKE | `IssueStatus.InProgress` or `TODO` |

### Comments & Documentation
- Write self-documenting code—comments explain "why", not "what"
- Document public APIs with JSDoc
- Update comments when code changes
- Remove commented-out code—use version control

```typescript
// ✅ CORRECT: Explains the "why"
// Cache invalidation uses tags to clear all related entries
// when an issue is updated, ensuring consistency across queries
await this.cacheService.invalidateByTags([`project:${projectId}:issues`]);

// ❌ WRONG: Explains the "what" (obvious from code)
// Loop through the array
for (const item of items) { ... }
```

### Testing Standards
- Write tests for all business logic
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies
- Test edge cases and error paths

```typescript
describe('IssuesService', () => {
  describe('create', () => {
    it('should create an issue with valid data', async () => {
      // Arrange
      const dto: CreateIssueDto = { title: 'Test Issue', priority: 'Medium' };
      const userId = 'user-123';
      const projectId = 'project-456';
      
      // Act
      const result = await service.create(projectId, userId, dto);
      
      // Assert
      expect(result).toHaveProperty('id');
      expect(result.title).toBe(dto.title);
      expect(result.reporterId).toBe(userId);
    });

    it('should throw ForbiddenException when user is not a project member', async () => {
      // Arrange
      jest.spyOn(projectMembersService, 'getUserRole').mockResolvedValue(null);
      
      // Act & Assert
      await expect(service.create(projectId, userId, dto))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
```

---

## 🚀 Process Standards

### Before Making Changes
1. **Understand the context**: Read related code, understand the feature flow
2. **Check for existing patterns**: Don't reinvent—follow established conventions
3. **Consider impact**: What else might this change affect?
4. **Plan the approach**: Outline major steps before diving in

### During Development
1. **Make incremental changes**: Small, focused commits
2. **Test as you go**: Don't wait until the end to test
3. **Keep refactoring scope limited**: Don't mix features with refactors
4. **Update types first**: Let TypeScript guide implementation

### After Changes
1. **Verify the change**: Test manually and with automated tests
2. **Check for regressions**: Ensure nothing else broke
3. **Update documentation**: If behavior changed, docs should too
4. **Clean up**: Remove console.logs, debug code, unused imports

---

## ⚠️ Anti-Patterns to Avoid

### Backend
- ❌ Business logic in controllers
- ❌ Returning raw database entities without DTOs
- ❌ Catching all errors silently
- ❌ N+1 queries (use relations or query builder)
- ❌ Hardcoded values instead of configuration
- ❌ Missing input validation

### Frontend
- ❌ Direct API calls without hooks
- ❌ Prop drilling (use context or state management)
- ❌ Inline styles instead of Tailwind classes
- ❌ Missing loading/error states
- ❌ useEffect for computed values (use useMemo)
- ❌ Missing dependency arrays in hooks

### General
- ❌ Copy-pasting code (extract utilities)
- ❌ Magic numbers/strings (use named constants)
- ❌ Ignoring TypeScript errors with `any` or `@ts-ignore`
- ❌ Outdated comments
- ❌ Inconsistent formatting

---

## 📋 Quick Reference Checklist

### Before Submitting Changes
- [ ] Code follows existing patterns in the codebase
- [ ] All new functions have proper TypeScript types
- [ ] Error cases are handled appropriately
- [ ] Loading states are implemented (frontend)
- [ ] Input validation is in place (backend)
- [ ] No console.logs or debug code left behind
- [ ] Tests added/updated for new functionality
- [ ] No ESLint/TypeScript warnings introduced
- [ ] Dependencies only added if absolutely necessary
