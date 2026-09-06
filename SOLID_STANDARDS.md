<solid_standards>
  <objective>
    This rubric defines the strict architectural standards for the Zenith backend. Any code refactored must adhere to these principles.
  </objective>

  <principle name="Single Responsibility Principle (SRP)">
    <rules>
      - Controllers: Strictly for HTTP routing, DTO validation, and returning responses. ZERO business logic.
      - Services: Strictly for business orchestration.
      - Repositories: Strictly for TypeORM/Database interactions. Do not put raw SQL or QueryBuilders in Services.
    </rules>
    <action>If a Service exceeds 300 lines, extract specific domain logic into smaller, focused Provider classes (e.g., separate UserAuthService from UserProfileService).</action>
  </principle>

  <principle name="Open/Closed Principle (OCP)">
    <rules>
      - No massive switch statements for core business rules (e.g., `switch(type)`).
    </rules>
    <action>Implement the Strategy Pattern. Create a base interface, implement concrete strategy classes, and inject them via a Factory or a Map.</action>
  </principle>

  <principle name="Liskov Substitution Principle (LSP)">
    <rules>
      - Contract Adherence: Any class implementing an interface must fully satisfy that interface.
    </rules>
    <action>You are strictly forbidden from writing methods that throw `NotImplementedException` simply to satisfy an interface signature.</action>
  </principle>

  <principle name="Interface Segregation Principle (ISP)">
    <rules>
      - No God Interfaces: Do not force classes to depend on methods they do not use.
    </rules>
    <action>Break large interfaces into smaller, role-based interfaces (e.g., instead of a massive `IProjectService`, create `IProjectReader` and `IProjectWriter`).</action>
  </principle>

  <principle name="Dependency Inversion Principle (DIP)" severity="CRITICAL">
    <rules>
      - Depend on Abstractions: High-level modules must not depend directly on concrete low-level implementations.
      - Stop injecting concrete classes directly (e.g., `constructor(private repo: PostgresUserRepository)`).
    </rules>
    <action>
      You MUST use NestJS Custom Providers and injection tokens:
      1. Define Abstract Class: `export abstract class UserRepository { abstract find(): Promise<User>; }`
      2. Module Setup: `{ provide: UserRepository, useClass: PostgresUserRepository }`
      3. Injection: `constructor(private readonly userRepo: UserRepository)` // No @Inject() decorator needed!
    </action>
  </principle>

  <infrastructure_lifecycle>
    <objective>
      Ensure NestJS lifecycle components isolate cross-cutting infrastructure concerns away from core domain logic.
    </objective>
    <component name="Guards">
      <rules>
        - Strictly for authentication, session verification, and identity context binding.
        - Must not perform downstream business mutations.
      </rules>
      <action>Inject abstraction-backed authentication providers to verify identities, appending the resolved identity cleanly to the execution context request object.</action>
    </component>
    <component name="Pipes">
      <rules>
        - Strictly for primitive parsing (e.g., ParseUUIDPipe) and structural DTO validation via class-validator.
        - Zero database or cross-module network queries are permitted inside a Pipe.
      </rules>
      <action>Execute data validation at the absolute boundary of the network layer. If a payload fails validation, short-circuit immediately before triggering controller execution.</action>
    </component>
    <component name="Interceptors">
      <rules>
        - Strictly for global response serialization, execution timing, performance logging, or broad transactional context caching.
        - Do not place domain-specific logic or mutations inside an interceptor's intercept pipeline.
      </rules>
    </component>
    <component name="Exception Filters">
      <rules>
        - Catch all untamed infrastructure, database, and domain exceptions at the application perimeter.
        - Mapping layer: Convert internal domain errors into standardized, sanitized client-facing JSON structures with accurate HTTP status codes.
      </rules>
      <action>Keep services pure. Services must throw generic or domain-specific exceptions. The Exception Filter is uniquely responsible for translating those exceptions into HTTP specs.</action>
    </component>
  </infrastructure_lifecycle>

  <definition_of_done>
    Before finalizing any refactor, verify:
    1. Are there any direct repository injections in the Service? (If yes, apply DIP).
    2. Does the Service exceed 300 lines? (If yes, split it).
    3. Are there any `any` types or skipped implementations? (If yes, fix them).
  </definition_of_done>
</solid_standards>