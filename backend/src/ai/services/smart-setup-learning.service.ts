/**
 * Smart Setup Learning Service
 * Records template selections and updates user preferences for personalization
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { UserPreferences } from '../../user-preferences/entities/user-preferences.entity';
import {
  IntelligentCriteria,
  TemplateScoringResult,
} from '../interfaces/intelligent-criteria.interface';
import { ProjectTemplate } from '../../project-templates/entities/project-template.entity';

/**
 * Selection event for analytics
 */
interface SelectionEvent {
  userId: string;
  conversationId: string;
  selectedTemplateId: string;
  recommendedTemplateIds: string[];
  wasTopRecommendation: boolean;
  criteria: Partial<IntelligentCriteria>;
  timestamp: Date;
}

/**
 * User template preference data stored in learningData
 */
interface TemplatePreference {
  templateId: string;
  selectionCount: number;
  lastSelected: string; // ISO date string for JSON serialization
  categories: string[];
  methodologies: string[];
}

/**
 * Smart Setup learning data structure stored in learningData
 */
interface SmartSetupLearningData {
  templatePreferences: TemplatePreference[];
  preferredWorkStyle?: string;
  preferredIndustry?: string;
  lastUpdated: string;
}

/**
 * Configuration
 */
const LEARNING_CONFIG = {
  CACHE_NAMESPACE: 'smart-setup-learning',
  PREFERENCE_KEY_PREFIX: 'user-template-prefs',
  SELECTION_HISTORY_KEY: 'selection-history',
  MAX_HISTORY_ITEMS: 100,
  PREFERENCE_BOOST_DECAY_DAYS: 90,
  LEARNING_DATA_KEY: 'smartSetup', // Key in learningData JSONB
};

@Injectable()
export class SmartSetupLearningService {
  private readonly logger = new Logger(SmartSetupLearningService.name);

  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(UserPreferences)
    private readonly userPrefsRepo: Repository<UserPreferences>,
    @InjectRepository(ProjectTemplate)
    private readonly templateRepo: Repository<ProjectTemplate>,
  ) {}

  /**
   * Record a template selection for learning
   */
  async recordSelection(
    userId: string,
    conversationId: string,
    selectedTemplateId: string,
    recommendations: TemplateScoringResult[],
    criteria: Partial<IntelligentCriteria>,
  ): Promise<void> {
    try {
      const recommendedIds = recommendations.map((r) => r.templateId);
      const wasTopRecommendation =
        recommendedIds.length > 0 && recommendedIds[0] === selectedTemplateId;

      const event: SelectionEvent = {
        userId,
        conversationId,
        selectedTemplateId,
        recommendedTemplateIds: recommendedIds,
        wasTopRecommendation,
        criteria,
        timestamp: new Date(),
      };

      // Store selection event in cache for analytics
      await this.storeSelectionEvent(event);

      // Update user preferences
      await this.updateUserLearningData(userId, selectedTemplateId, criteria);

      this.logger.log(
        `Recorded selection: user=${userId} template=${selectedTemplateId} wasTop=${wasTopRecommendation}`,
      );
    } catch (error) {
      this.logger.error('Failed to record selection', error);
      // Don't throw - learning is non-critical
    }
  }

  /**
   * Get user's template preferences for scoring boost
   */
  async getUserTemplatePreferences(
    userId: string,
  ): Promise<TemplatePreference[]> {
    try {
      const cacheKey = `${LEARNING_CONFIG.PREFERENCE_KEY_PREFIX}:${userId}`;
      const cached = await this.cacheService.get<TemplatePreference[]>(
        cacheKey,
        { namespace: LEARNING_CONFIG.CACHE_NAMESPACE },
      );

      if (cached) {
        return cached;
      }

      // Load from database
      const userPrefs = await this.userPrefsRepo.findOne({
        where: { userId },
      });

      const learningData = this.getLearningData(userPrefs);
      if (!learningData?.templatePreferences) {
        return [];
      }

      const prefs = learningData.templatePreferences;

      // Cache for 5 minutes
      await this.cacheService.set(cacheKey, prefs, {
        ttl: 300,
        namespace: LEARNING_CONFIG.CACHE_NAMESPACE,
      });

      return prefs;
    } catch (error) {
      this.logger.warn('Failed to get user template preferences', error);
      return [];
    }
  }

  /**
   * Calculate preference boost for a template (0-100)
   */
  async getPreferenceBoost(
    userId: string,
    templateId: string,
  ): Promise<number> {
    const prefs = await this.getUserTemplatePreferences(userId);
    const pref = prefs.find((p) => p.templateId === templateId);

    if (!pref) {
      return 0;
    }

    // Calculate boost based on selection count and recency
    const daysSinceLastSelected = Math.floor(
      (Date.now() - new Date(pref.lastSelected).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    // Decay factor: 100% within 7 days, decreasing to 0% at 90 days
    const decayFactor = Math.max(
      0,
      1 - daysSinceLastSelected / LEARNING_CONFIG.PREFERENCE_BOOST_DECAY_DAYS,
    );

    // Base boost from selection count (max 50 points for 3+ selections)
    const countBoost = Math.min(50, pref.selectionCount * 20);

    return Math.round(countBoost * decayFactor);
  }

  /**
   * Get category preferences from user history
   */
  async getCategoryPreferences(userId: string): Promise<Map<string, number>> {
    const prefs = await this.getUserTemplatePreferences(userId);
    const categoryWeights = new Map<string, number>();

    for (const pref of prefs) {
      for (const category of pref.categories) {
        const current = categoryWeights.get(category) || 0;
        categoryWeights.set(category, current + pref.selectionCount);
      }
    }

    return categoryWeights;
  }

  /**
   * Get methodology preferences from user history
   */
  async getMethodologyPreferences(
    userId: string,
  ): Promise<Map<string, number>> {
    const prefs = await this.getUserTemplatePreferences(userId);
    const methodWeights = new Map<string, number>();

    for (const pref of prefs) {
      for (const methodology of pref.methodologies) {
        const current = methodWeights.get(methodology) || 0;
        methodWeights.set(methodology, current + pref.selectionCount);
      }
    }

    return methodWeights;
  }

  /**
   * Store selection event for analytics
   */
  private async storeSelectionEvent(event: SelectionEvent): Promise<void> {
    const historyKey = `${LEARNING_CONFIG.SELECTION_HISTORY_KEY}:${event.userId}`;

    try {
      // Get existing history
      const history =
        (await this.cacheService.get<SelectionEvent[]>(historyKey, {
          namespace: LEARNING_CONFIG.CACHE_NAMESPACE,
        })) || [];

      // Add new event and trim to max size
      history.unshift(event);
      if (history.length > LEARNING_CONFIG.MAX_HISTORY_ITEMS) {
        history.pop();
      }

      // Store with long TTL (30 days)
      await this.cacheService.set(historyKey, history, {
        ttl: 60 * 60 * 24 * 30,
        namespace: LEARNING_CONFIG.CACHE_NAMESPACE,
      });
    } catch (error) {
      this.logger.warn('Failed to store selection event', error);
    }
  }

  /**
   * Extract SmartSetupLearningData from UserPreferences
   */
  private getLearningData(
    userPrefs: UserPreferences | null,
  ): SmartSetupLearningData | null {
    if (!userPrefs?.learningData) {
      return null;
    }

    const data = userPrefs.learningData;
    const smartSetup = data[LEARNING_CONFIG.LEARNING_DATA_KEY];

    if (!smartSetup || typeof smartSetup !== 'object') {
      return null;
    }

    return smartSetup as SmartSetupLearningData;
  }

  /**
   * Update user learning data with new selection
   */
  private async updateUserLearningData(
    userId: string,
    templateId: string,
    criteria: Partial<IntelligentCriteria>,
  ): Promise<void> {
    try {
      // Get template details
      const template = await this.templateRepo.findOne({
        where: { id: templateId },
      });

      if (!template) {
        return;
      }

      // Get or create user preferences
      const userPrefs = await this.userPrefsRepo.findOne({
        where: { userId },
      });

      if (!userPrefs) {
        // User preferences should exist - don't create new records here
        // Just cache the learning data for now
        this.logger.warn(`No user preferences found for user ${userId}`);
        return;
      }

      // Initialize learningData if missing
      if (!userPrefs.learningData) {
        userPrefs.learningData = {};
      }

      // Get or create smart setup learning data
      const data = userPrefs.learningData;
      let smartSetup = (data[LEARNING_CONFIG.LEARNING_DATA_KEY] ||
        {}) as SmartSetupLearningData;

      if (!smartSetup.templatePreferences) {
        smartSetup = {
          templatePreferences: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      // Find or create preference for this template
      let pref = smartSetup.templatePreferences.find(
        (p) => p.templateId === templateId,
      );

      if (pref) {
        pref.selectionCount++;
        pref.lastSelected = new Date().toISOString();
      } else {
        pref = {
          templateId,
          selectionCount: 1,
          lastSelected: new Date().toISOString(),
          categories: [template.category],
          methodologies: [template.methodology],
        };
        smartSetup.templatePreferences.push(pref);
      }

      // Update working style preference if available
      if (criteria.workStyle) {
        smartSetup.preferredWorkStyle = criteria.workStyle;
      }

      // Update industry if available
      if (criteria.industry) {
        smartSetup.preferredIndustry = criteria.industry;
      }

      smartSetup.lastUpdated = new Date().toISOString();

      // Save to learningData
      data[LEARNING_CONFIG.LEARNING_DATA_KEY] = smartSetup;
      userPrefs.learningData = data;

      await this.userPrefsRepo.save(userPrefs);

      // Invalidate cache
      await this.cacheService.del(
        `${LEARNING_CONFIG.PREFERENCE_KEY_PREFIX}:${userId}`,
        { namespace: LEARNING_CONFIG.CACHE_NAMESPACE },
      );

      this.logger.debug(`Updated learning data for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to update user learning data', error);
    }
  }

  /**
   * Get selection accuracy statistics
   */
  async getSelectionStats(userId: string): Promise<{
    totalSelections: number;
    topRecommendationHits: number;
    hitRate: number;
  }> {
    const historyKey = `${LEARNING_CONFIG.SELECTION_HISTORY_KEY}:${userId}`;
    const history =
      (await this.cacheService.get<SelectionEvent[]>(historyKey, {
        namespace: LEARNING_CONFIG.CACHE_NAMESPACE,
      })) || [];

    const totalSelections = history.length;
    const topRecommendationHits = history.filter(
      (e) => e.wasTopRecommendation,
    ).length;
    const hitRate =
      totalSelections > 0 ? topRecommendationHits / totalSelections : 0;

    return {
      totalSelections,
      topRecommendationHits,
      hitRate: Math.round(hitRate * 100),
    };
  }
}
