import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuditLogsService } from '../src/audit/audit-logs.service';
import { randomUUID } from 'crypto';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const auditService = app.get(AuditLogsService);

    console.log('Sending test audit log...');

    await auditService.log({
        event_uuid: randomUUID(),
        timestamp: new Date(),
        tenant_id: randomUUID(),
        actor_id: randomUUID(),
        resource_type: 'TestResource',
        resource_id: randomUUID(),
        action_type: 'CREATE',
        changes: {
            status: ['old', 'new']
        },
        metadata: { source: 'script' }
    });

    console.log('Test log sent to queue. Check worker logs.');

    // Give it a moment to process before closing
    setTimeout(() => process.exit(0), 3000);
}

bootstrap();
