import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { OpenAiService } from './services/openai.service';
import { EmbeddingsService } from './services/embeddings.service';
import { SemanticSearchService } from './services/semantic-search.service';
import { ProjectRAGService } from './services/project-rag.service';
import { TriageWorker } from './workers/triage.worker';
import { TriageListener } from './listeners/triage.listener';
import { ProjectIntelligenceService } from './services/project-intelligence.service';
import { AIProviderService } from './services/ai-provider.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { GroqProvider } from './providers/groq.provider';
import { ProjectTemplate } from '../project-templates/entities/project-template.entity';
import { CacheModule } from '../cache/cache.module';
import { TenantModule } from '../core/tenant/tenant.module';
// New Intelligent Smart Setup Services
import { ConversationManagerService } from './services/conversation-manager.service';
import { SemanticExtractorService } from './services/semantic-extractor.service';
import { QuestionGeneratorService } from './services/question-generator.service';
import { TemplateScorerService } from './services/template-scorer.service';
import { SmartSetupLearningService } from './services/smart-setup-learning.service';
import { ProjectNameGeneratorService } from './services/project-name-generator.service';
import { UserPreferences } from '../user-preferences/entities/user-preferences.entity';
// Confidence Scoring Framework
import { AISuggestion } from './entities/ai-suggestion.entity';
import { AIPredictionLog } from './entities/ai-prediction-log.entity';
import { SuggestionsService } from './services/suggestions.service';
import { PredictionAnalyticsService } from './services/prediction-analytics.service';
import { SuggestionsController } from './controllers/suggestions.controller';
import { ProjectChatController } from './controllers/project-chat.controller';

@Module({
  imports: [
    ConfigModule,
    TenantModule,
    TypeOrmModule.forFeature([
      Issue,
      ProjectTemplate,
      UserPreferences,
      AISuggestion,
      AIPredictionLog,
    ]),
    BullModule.registerQueue({
      name: 'ai-triage',
    }),
    CacheModule,
  ],
  controllers: [SuggestionsController, ProjectChatController],
  providers: [
    OpenAiService,
    EmbeddingsService,
    SemanticSearchService,
    ProjectRAGService,
    TriageWorker,
    TriageListener,
    ProjectIntelligenceService,
    AIProviderService,
    GeminiProvider,
    OpenRouterProvider,
    GroqProvider,
    // New Intelligent Smart Setup Services
    ConversationManagerService,
    SemanticExtractorService,
    QuestionGeneratorService,
    TemplateScorerService,
    SmartSetupLearningService,
    ProjectNameGeneratorService,
    // Confidence Scoring Framework
    SuggestionsService,
    PredictionAnalyticsService,
  ],
  exports: [
    OpenAiService,
    EmbeddingsService,
    SemanticSearchService,
    ProjectRAGService,
    ProjectIntelligenceService,
    // Export new services for use in other modules
    ConversationManagerService,
    SemanticExtractorService,
    QuestionGeneratorService,
    TemplateScorerService,
    SmartSetupLearningService,
    ProjectNameGeneratorService,
    // Export suggestions service for use in controllers
    SuggestionsService,
    PredictionAnalyticsService,
  ],
})
export class AiModule {}
