import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SatisfactionMetric } from './entities/satisfaction-metric.entity';
import { SatisfactionSurvey } from './entities/satisfaction-survey.entity';

@Injectable()
export class SatisfactionService {
  constructor(
    @InjectRepository(SatisfactionMetric)
    private metricRepo: Repository<SatisfactionMetric>,
    @InjectRepository(SatisfactionSurvey)
    private surveyRepo: Repository<SatisfactionSurvey>,
  ) {}

  async trackMetric(
    userId: string,
    metric: string,
    value: number,
    context?: Record<string, any>,
  ): Promise<SatisfactionMetric> {
    const metricEntity = this.metricRepo.create({
      userId,
      metric,
      value,
      context,
    });

    return this.metricRepo.save(metricEntity);
  }

  async submitSurvey(
    userId: string,
    type: 'onboarding' | 'feature' | 'general',
    questions: Array<{
      id: string;
      question: string;
      answer: number;
      context?: string;
    }>,
    overallScore: number,
    feedback?: string,
  ): Promise<SatisfactionSurvey> {
    const survey = this.surveyRepo.create({
      userId,
      type,
      questions,
      overallScore,
      feedback,
    });

    return this.surveyRepo.save(survey);
  }

  async getMetrics(
    userId: string,
    metric?: string,
  ): Promise<SatisfactionMetric[]> {
    const query = this.metricRepo
      .createQueryBuilder('metric')
      .where('metric.userId = :userId', { userId });

    if (metric) {
      query.andWhere('metric.metric = :metric', { metric });
    }

    return query.orderBy('metric.timestamp', 'DESC').getMany();
  }

  async getSurveys(
    userId: string,
    type?: string,
  ): Promise<SatisfactionSurvey[]> {
    const query = this.surveyRepo
      .createQueryBuilder('survey')
      .where('survey.userId = :userId', { userId });

    if (type) {
      query.andWhere('survey.type = :type', { type });
    }

    return query.orderBy('survey.timestamp', 'DESC').getMany();
  }

  async getAverageScore(userId: string, metric: string): Promise<number> {
    const result = await this.metricRepo
      .createQueryBuilder('metric')
      .select('AVG(metric.value)', 'average')
      .where('metric.userId = :userId', { userId })
      .andWhere('metric.metric = :metric', { metric })
      .getRawOne();

    return parseFloat(result.average) || 0;
  }

  async getOverallSatisfaction(userId: string): Promise<number> {
    const result = await this.surveyRepo
      .createQueryBuilder('survey')
      .select('AVG(survey.overallScore)', 'average')
      .where('survey.userId = :userId', { userId })
      .getRawOne();

    return parseFloat(result.average) || 0;
  }
}
