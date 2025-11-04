import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchIndex } from '../entities/search-index.entity';
import { Integration } from '../entities/integration.entity';

export interface SearchQuery {
  query: string;
  sources?: string[];
  contentType?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  contentType: string;
  url: string;
  author: string;
  timestamp: Date;
  relevanceScore: number;
  metadata: Record<string, unknown>;
}

export interface UnifiedSearchResults {
  results: SearchResult[];
  total: number;
  sources: string[];
  suggestions: string[];
  query: string;
  took: number;
}

export interface SearchSuggestion {
  text: string;
  type: 'query' | 'source' | 'content_type';
  count?: number;
}

@Injectable()
export class UniversalSearchService {
  private readonly logger = new Logger(UniversalSearchService.name);

  constructor(
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
  ) {}

  async search(query: SearchQuery): Promise<UnifiedSearchResults> {
    const startTime = Date.now();

    try {
      const {
        query: searchQuery,
        sources = [],
        contentType,
        limit = 20,
        offset = 0,
      } = query;

      if (!searchQuery || searchQuery.trim().length < 2) {
        return {
          results: [],
          total: 0,
          sources: [],
          suggestions: [],
          query: searchQuery,
          took: Date.now() - startTime,
        };
      }

      // Build search query
      let queryBuilder = this.searchIndexRepo
        .createQueryBuilder('search')
        .leftJoin('search.integration', 'integration')
        .where('integration.isActive = :isActive', { isActive: true });

      // Add full-text search
      queryBuilder = queryBuilder.andWhere(
        `to_tsvector('english', search.title || ' ' || search.content) @@ plainto_tsquery('english', :query)`,
        { query: searchQuery },
      );

      // Filter by sources if specified
      if (sources.length > 0) {
        queryBuilder = queryBuilder.andWhere(
          'integration.type IN (:...sources)',
          { sources },
        );
      }

      // Filter by content type if specified
      if (contentType) {
        queryBuilder = queryBuilder.andWhere(
          'search.contentType = :contentType',
          { contentType },
        );
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Get results with pagination
      const searchResults = await queryBuilder
        .select([
          'search.id',
          'search.title',
          'search.content',
          'search.contentType',
          'search.metadata',
          'search.createdAt',
          'integration.type',
        ])
        .orderBy('search.createdAt', 'DESC')
        .limit(limit)
        .offset(offset)
        .getMany();

      // Transform results
      const results: SearchResult[] = searchResults.map((result) => ({
        id: result.id,
        title: result.title,
        content: result.content,
        source: result.integration?.type || 'unknown',
        contentType: result.contentType,
        url: result.metadata?.url || '#',
        author: result.metadata?.author || 'Unknown',
        timestamp: result.createdAt,
        relevanceScore: this.calculateRelevanceScore(
          searchQuery,
          result.title,
          result.content,
        ),
        metadata: result.metadata || {},
      }));

      // Sort by relevance score
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Get unique sources
      const uniqueSources = [...new Set(results.map((r) => r.source))];

      // Get suggestions
      const suggestions = await this.getSearchSuggestions(searchQuery);

      const took = Date.now() - startTime;

      this.logger.log(
        `Search completed: "${searchQuery}" - ${results.length} results in ${took}ms`,
      );

      return {
        results,
        total,
        sources: uniqueSources,
        suggestions: suggestions.map((s) => s.text),
        query: searchQuery,
        took,
      };
    } catch (error) {
      this.logger.error('Search failed:', error);
      return {
        results: [],
        total: 0,
        sources: [],
        suggestions: [],
        query: query.query,
        took: Date.now() - startTime,
      };
    }
  }

  async getSearchSuggestions(
    partialQuery: string,
  ): Promise<SearchSuggestion[]> {
    try {
      if (!partialQuery || partialQuery.length < 2) {
        return [];
      }

      // Get query suggestions from search history
      const querySuggestions = await this.searchIndexRepo
        .createQueryBuilder('search')
        .select('search.title')
        .where('search.title ILIKE :query', { query: `%${partialQuery}%` })
        .groupBy('search.title')
        .orderBy('COUNT(*)', 'DESC')
        .limit(5)
        .getRawMany();

      // Get source suggestions
      const sourceSuggestions = await this.searchIndexRepo
        .createQueryBuilder('search')
        .leftJoin('search.integration', 'integration')
        .select('integration.type', 'source')
        .addSelect('COUNT(*)', 'count')
        .where('integration.isActive = :isActive', { isActive: true })
        .groupBy('integration.type')
        .orderBy('COUNT(*)', 'DESC')
        .limit(5)
        .getRawMany();

      // Get content type suggestions
      const contentTypeSuggestions = await this.searchIndexRepo
        .createQueryBuilder('search')
        .select('search.contentType', 'contentType')
        .addSelect('COUNT(*)', 'count')
        .leftJoin('search.integration', 'integration')
        .where('integration.isActive = :isActive', { isActive: true })
        .groupBy('search.contentType')
        .orderBy('COUNT(*)', 'DESC')
        .limit(5)
        .getRawMany();

      const suggestions: SearchSuggestion[] = [
        ...querySuggestions.map((s: Record<string, unknown>) => ({
          text: s.search_title as string,
          type: 'query' as const,
        })),
        ...sourceSuggestions.map((s: Record<string, unknown>) => ({
          text: s.source as string,
          type: 'source' as const,
          count: parseInt(s.count as string),
        })),
        ...contentTypeSuggestions.map((s: Record<string, unknown>) => ({
          text: s.contentType as string,
          type: 'content_type' as const,
          count: parseInt(s.count as string),
        })),
      ];

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  async indexExternalContent(
    integrationId: string,
    content: any[],
  ): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId },
      });

      if (!integration) {
        throw new Error('Integration not found');
      }

      for (const item of content) {
        const searchContent =
          `${((item as Record<string, unknown>).title as string) || ''} ${((item as Record<string, unknown>).content as string) || ''}`.toLowerCase();

        const existing = await this.searchIndexRepo.findOne({
          where: {
            integrationId,
            contentType: (item as Record<string, unknown>).type as string,
          },
        });

        if (existing) {
          existing.title =
            ((item as Record<string, unknown>).title as string) || '';
          existing.content =
            ((item as Record<string, unknown>).content as string) || '';
          existing.metadata =
            ((item as Record<string, unknown>).metadata as Record<
              string,
              unknown
            >) || {};
          existing.searchVector = searchContent;
          existing.updatedAt = new Date();
          await this.searchIndexRepo.save(existing);
        } else {
          const searchIndex = this.searchIndexRepo.create({
            integrationId,
            contentType: (item as Record<string, unknown>).type as string,
            title: ((item as Record<string, unknown>).title as string) || '',
            content:
              ((item as Record<string, unknown>).content as string) || '',
            metadata:
              ((item as Record<string, unknown>).metadata as Record<
                string,
                unknown
              >) || {},
            searchVector: searchContent,
          });
          await this.searchIndexRepo.save(searchIndex);
        }
      }

      this.logger.log(
        `Indexed ${content.length} items for integration ${integrationId}`,
      );
    } catch (error) {
      this.logger.error('Failed to index external content:', error);
    }
  }

  async getPopularSearches(limit = 10): Promise<SearchSuggestion[]> {
    try {
      const popularSearches = await this.searchIndexRepo
        .createQueryBuilder('search')
        .select('search.title', 'title')
        .addSelect('COUNT(*)', 'count')
        .leftJoin('search.integration', 'integration')
        .where('integration.isActive = :isActive', { isActive: true })
        .groupBy('search.title')
        .orderBy('COUNT(*)', 'DESC')
        .limit(limit)
        .getRawMany();

      return popularSearches.map((search: Record<string, unknown>) => ({
        text: search.title as string,
        type: 'query' as const,
        count: parseInt(search.count as string),
      }));
    } catch (error) {
      this.logger.error('Failed to get popular searches:', error);
      return [];
    }
  }

  async getSearchAnalytics(days = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const analytics = await this.searchIndexRepo
        .createQueryBuilder('search')
        .leftJoin('search.integration', 'integration')
        .select('integration.type', 'source')
        .addSelect('search.contentType', 'contentType')
        .addSelect('COUNT(*)', 'count')
        .where('search.createdAt >= :startDate', { startDate })
        .andWhere('integration.isActive = :isActive', { isActive: true })
        .groupBy('integration.type, search.contentType')
        .orderBy('COUNT(*)', 'DESC')
        .getRawMany();

      const analyticsData = analytics as Record<string, unknown>[];

      return {
        period: `${days} days`,
        totalSearches: analyticsData.reduce(
          (sum: number, item: Record<string, unknown>) =>
            sum + parseInt(item.count as string),
          0,
        ),
        bySource: analyticsData.reduce(
          (acc: Record<string, number>, item: Record<string, unknown>) => {
            const source = item.source as string;
            if (!acc[source]) acc[source] = 0;
            acc[source] += parseInt(item.count as string);
            return acc;
          },
          {},
        ),
        byContentType: analyticsData.reduce(
          (acc: Record<string, number>, item: Record<string, unknown>) => {
            const contentType = item.contentType as string;
            if (!acc[contentType]) acc[contentType] = 0;
            acc[contentType] += parseInt(item.count as string);
            return acc;
          },
          {},
        ),
        details: analyticsData,
      };
    } catch (error) {
      this.logger.error('Failed to get search analytics:', error);
      return null;
    }
  }

  private calculateRelevanceScore(
    query: string,
    title: string,
    content: string,
  ): number {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();

    let score = 0;

    // Title matches are more important
    if (titleLower.includes(queryLower)) {
      score += 10;
    }

    // Content matches
    if (contentLower.includes(queryLower)) {
      score += 5;
    }

    // Exact phrase matches
    if (titleLower.includes(queryLower)) {
      score += 15;
    }

    // Word boundary matches
    const queryWords = queryLower.split(/\s+/);
    const titleWords = titleLower.split(/\s+/);
    const contentWords = contentLower.split(/\s+/);

    for (const word of queryWords) {
      if (titleWords.includes(word)) {
        score += 3;
      }
      if (contentWords.includes(word)) {
        score += 1;
      }
    }

    return Math.min(score, 100); // Cap at 100
  }
}
