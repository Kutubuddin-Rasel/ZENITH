import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueryOptimizerService } from './services/query-optimizer.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [QueryOptimizerService],
  exports: [QueryOptimizerService],
})
export class DatabaseModule {}
