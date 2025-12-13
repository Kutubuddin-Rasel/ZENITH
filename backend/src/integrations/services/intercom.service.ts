import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetrievalService } from '../../rag/services/retrieval.service';

@Injectable()
export class IntercomService {
  private readonly logger = new Logger(IntercomService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly retrievalService: RetrievalService,
  ) {}

  async syncTickets() {
    // Mock sync logic
    this.logger.log('Syncing Intercom tickets...');
    // In real implementation: Fetch from Intercom API
    const mockTickets = [
      { id: 'ic_1', text: 'Login is slow', user: 'user_a' },
      { id: 'ic_2', text: 'Cannot login, timeout', user: 'user_b' },
      { id: 'ic_3', text: 'Feature request: Dark mode', user: 'user_c' },
    ];

    for (const ticket of mockTickets) {
      await this.processTicket(ticket);
    }
  }

  async processTicket(ticket: { id: string; text: string }) {
    // Mock Project ID for sync demo
    const projectId = '00000000-0000-0000-0000-000000000000';
    const relatedSegments = await this.retrievalService.query(
      projectId,
      ticket.text,
      3,
    );

    if (relatedSegments.length > 0) {
      const topMatch = relatedSegments[0];
      // If high similarity (logic depends on distance which we didn't return explicitly but sorted by),
      // Link it.
      // Ideally check distance threshold.
      // For now, just log the "Insight"
      this.logger.log(
        `Found relation: Intercom ${ticket.id} -> Document ${topMatch.documentId} (Content: ${topMatch.content.substring(0, 30)}...)`,
      );

      // Create "Insight Card" logic here (e.g. store in separate DB table)
    } else {
      this.logger.log(`No relation found for Intercom ${ticket.id}`);
    }
  }

  async clusterFeedback() {
    // Logic to cluster tickets together without existing issues
    // This requires fetching all tickets and running clustering algorithm (e.g. K-Means on vectors)
    // This is complex for this step, so we stick to 'Linking to Issues' as primary valus
  }
}
