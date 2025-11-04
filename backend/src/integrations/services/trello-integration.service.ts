import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration, IntegrationType } from '../entities/integration.entity';
import { ExternalData, MappedData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  url: string;
  shortUrl: string;
  prefs: {
    background: string;
    backgroundImage: string;
  };
  organization: {
    id: string;
    name: string;
    displayName: string;
  } | null;
  members: Array<{
    id: string;
    fullName: string;
    username: string;
    avatarUrl: string;
  }>;
  lists: Array<{
    id: string;
    name: string;
    closed: boolean;
    pos: number;
  }>;
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  dateLastActivity: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  due: string | null;
  dueComplete: boolean;
  idList: string;
  idBoard: string;
  pos: number;
  url: string;
  shortUrl: string;
  labels: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  members: Array<{
    id: string;
    fullName: string;
    username: string;
    avatarUrl: string;
  }>;
  checklists: Array<{
    id: string;
    name: string;
    checkItems: Array<{
      id: string;
      name: string;
      state: string;
    }>;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    mimeType: string;
  }>;
  comments: Array<{
    id: string;
    data: {
      text: string;
    };
    memberCreator: {
      fullName: string;
      username: string;
    };
    date: string;
  }>;
  dateLastActivity: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
  pos: number;
  cards: TrelloCard[];
}

export interface TrelloWebhookPayload {
  action: {
    type: string;
    data: {
      board: {
        id: string;
        name: string;
      };
      list?: {
        id: string;
        name: string;
      };
      card?: {
        id: string;
        name: string;
      };
      old?: Record<string, unknown>;
    };
    memberCreator: {
      fullName: string;
      username: string;
    };
    date: string;
  };
  model: {
    id: string;
    name: string;
  };
}

interface TrelloCardData {
  id: string;
  name: string;
  desc?: string;
  closed?: boolean;
  due?: string;
  dueComplete?: boolean;
  idList?: string;
  idMembers?: string[];
  idLabels?: string[];
  url?: string;
  shortUrl?: string;
  pos?: number;
  dateLastActivity?: string;
}

interface TrelloListData {
  id: string;
  name: string;
  closed?: boolean;
  idBoard?: string;
  pos?: number;
}

interface TrelloBoardData {
  id: string;
  name: string;
  desc?: string;
  closed?: boolean;
  url?: string;
  shortUrl?: string;
  members?: Array<{
    id: string;
    fullName: string;
    username: string;
  }>;
  lists?: Array<{
    id: string;
    name: string;
  }>;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

// interface TrelloWebhookData extends Record<string, unknown> {
//   type: string;
//   data: Record<string, unknown>;
//   boardId?: string;
// }

@Injectable()
export class TrelloIntegrationService {
  private readonly logger = new Logger(TrelloIntegrationService.name);
  private readonly trelloApiBase = 'https://api.trello.com/1';

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
    @InjectRepository(ExternalData)
    private externalDataRepo: Repository<ExternalData>,
    @InjectRepository(SearchIndex)
    private searchIndexRepo: Repository<SearchIndex>,
  ) {}

  async syncBoards(integrationId: string): Promise<TrelloBoard[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.TRELLO },
      });

      if (!integration) {
        throw new Error('Trello integration not found');
      }

      const { apiKey, apiToken } = this.getTrelloCredentials(integration);
      const boards = integration.config.boards || [];

      const syncedBoards: TrelloBoard[] = [];

      for (const boardId of boards) {
        try {
          const response = await fetch(
            `${this.trelloApiBase}/boards/${boardId}?` +
              `key=${apiKey}&token=${apiToken}&` +
              `lists=open&members=all&organization=true&labels=all`,
            {
              headers: {
                Accept: 'application/json',
              },
            },
          );

          if (response.ok) {
            const board = (await response.json()) as TrelloBoard;
            syncedBoards.push(board);
            await this.storeExternalData(integrationId, 'board', board.id, {
              ...board,
              syncedAt: new Date(),
            });
          } else {
            this.logger.warn(
              `Failed to sync Trello board ${boardId}: ${response.status}`,
            );
          }
        } catch (error) {
          this.logger.error(`Error syncing Trello board ${boardId}:`, error);
        }
      }

      this.logger.log(`Synced ${syncedBoards.length} Trello boards`);
      return syncedBoards;
    } catch (error) {
      this.logger.error('Failed to sync Trello boards:', error);
      throw error;
    }
  }

  async syncCards(
    integrationId: string,
    boardId: string,
  ): Promise<TrelloCard[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.TRELLO },
      });

      if (!integration) {
        throw new Error('Trello integration not found');
      }

      const { apiKey, apiToken } = this.getTrelloCredentials(integration);

      const response = await fetch(
        `${this.trelloApiBase}/boards/${boardId}/cards?` +
          `key=${apiKey}&token=${apiToken}&` +
          `members=all&checklists=all&attachments=true&actions=commentCard`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }

      const cards = (await response.json()) as TrelloCard[];
      const syncedCards: TrelloCard[] = [];

      for (const card of cards) {
        syncedCards.push(card);
        await this.storeExternalData(integrationId, 'card', card.id, {
          ...card,
          boardId,
          syncedAt: new Date(),
        });
      }

      this.logger.log(
        `Synced ${syncedCards.length} Trello cards from board ${boardId}`,
      );
      return syncedCards;
    } catch (error) {
      this.logger.error('Failed to sync Trello cards:', error);
      throw error;
    }
  }

  async syncLists(
    integrationId: string,
    boardId: string,
  ): Promise<TrelloList[]> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.TRELLO },
      });

      if (!integration) {
        throw new Error('Trello integration not found');
      }

      const { apiKey, apiToken } = this.getTrelloCredentials(integration);

      const response = await fetch(
        `${this.trelloApiBase}/boards/${boardId}/lists?` +
          `key=${apiKey}&token=${apiToken}&cards=open`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }

      const lists = (await response.json()) as TrelloList[];
      const syncedLists: TrelloList[] = [];

      for (const list of lists) {
        syncedLists.push(list);
        await this.storeExternalData(integrationId, 'list', list.id, {
          ...list,
          boardId,
          syncedAt: new Date(),
        });
      }

      this.logger.log(
        `Synced ${syncedLists.length} Trello lists from board ${boardId}`,
      );
      return syncedLists;
    } catch (error) {
      this.logger.error('Failed to sync Trello lists:', error);
      throw error;
    }
  }

  async createCard(
    integrationId: string,
    listId: string,
    cardData: Partial<TrelloCard>,
  ): Promise<TrelloCard> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.TRELLO },
      });

      if (!integration) {
        throw new Error('Trello integration not found');
      }

      const { apiKey, apiToken } = this.getTrelloCredentials(integration);

      const response = await fetch(`${this.trelloApiBase}/cards`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: apiKey,
          token: apiToken,
          idList: listId,
          name: cardData.name,
          desc: cardData.desc,
          due: cardData.due,
          idLabels: cardData.labels?.map((l) => l.id).join(','),
        }),
      });

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }

      const createdCard = (await response.json()) as TrelloCard;
      this.logger.log(`Created Trello card: ${createdCard.id}`);

      return createdCard;
    } catch (error) {
      this.logger.error('Failed to create Trello card:', error);
      throw error;
    }
  }

  async updateCardStatus(
    integrationId: string,
    cardId: string,
    listId: string,
  ): Promise<void> {
    try {
      const integration = await this.integrationRepo.findOne({
        where: { id: integrationId, type: IntegrationType.TRELLO },
      });

      if (!integration) {
        throw new Error('Trello integration not found');
      }

      const { apiKey, apiToken } = this.getTrelloCredentials(integration);

      const response = await fetch(`${this.trelloApiBase}/cards/${cardId}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: apiKey,
          token: apiToken,
          idList: listId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Trello API error: ${response.status}`);
      }

      this.logger.log(`Updated Trello card ${cardId} status`);
    } catch (error) {
      this.logger.error('Failed to update Trello card status:', error);
      throw error;
    }
  }

  async handleWebhook(payload: TrelloWebhookPayload): Promise<void> {
    try {
      this.logger.log(`Received Trello webhook: ${payload.action.type}`);

      // Find the integration for this board
      const integration = await this.integrationRepo.findOne({
        where: {
          type: IntegrationType.TRELLO,
        },
      });

      if (!integration) {
        this.logger.warn(
          `No integration found for Trello board ${payload.model.id}`,
        );
        return;
      }

      // Handle different webhook events
      switch (payload.action.type) {
        case 'createCard':
        case 'updateCard':
        case 'deleteCard':
          if (payload.action.data.card) {
            await this.handleCardEvent(
              integration.id,
              payload.action.data.card,
              payload.model.id,
            );
          }
          break;
        case 'createList':
        case 'updateList':
        case 'deleteList':
          if (payload.action.data.list) {
            await this.handleListEvent(
              integration.id,
              payload.action.data.list,
              payload.model.id,
            );
          }
          break;
        case 'updateBoard':
          await this.handleBoardEvent(integration.id, payload.model);
          break;
        default:
          this.logger.log(
            `Unhandled Trello webhook action: ${payload.action.type}`,
          );
      }
    } catch (error) {
      this.logger.error('Failed to handle Trello webhook:', error);
    }
  }

  private getTrelloCredentials(integration: Integration): {
    apiKey: string;
    apiToken: string;
  } {
    return {
      apiKey: integration.authConfig.apiKey || '',
      apiToken: integration.authConfig.accessToken || '',
    };
  }

  private async handleCardEvent(
    integrationId: string,
    card: TrelloCardData,
    boardId: string,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'card', card.id, {
      ...card,
      boardId,
      syncedAt: new Date(),
    });
  }

  private async handleListEvent(
    integrationId: string,
    list: TrelloListData,
    boardId: string,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'list', list.id, {
      ...list,
      boardId,
      syncedAt: new Date(),
    });
  }

  private async handleBoardEvent(
    integrationId: string,
    board: TrelloBoardData,
  ): Promise<void> {
    await this.storeExternalData(integrationId, 'board', board.id, {
      ...board,
      syncedAt: new Date(),
    });
  }

  private async storeExternalData(
    integrationId: string,
    type: string,
    externalId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Check if data already exists
      const existing = await this.externalDataRepo.findOne({
        where: {
          integrationId,
          externalId,
          externalType: type,
        },
      });

      const mappedData = this.mapTrelloData(type, data);
      if (!mappedData) {
        return;
      }

      if (existing) {
        existing.rawData = data;
        existing.mappedData = mappedData;
        existing.lastSyncAt = new Date();
        await this.externalDataRepo.save(existing);
      } else {
        const externalData = this.externalDataRepo.create({
          integrationId,
          externalId,
          externalType: type,
          rawData: data,
          mappedData,
          lastSyncAt: new Date(),
        });
        await this.externalDataRepo.save(externalData);
      }

      // Update search index
      if (mappedData) {
        await this.updateSearchIndex(
          integrationId,
          type,
          externalId,
          mappedData,
        );
      }
    } catch (error) {
      this.logger.error('Failed to store external data:', error);
    }
  }

  private mapTrelloData(
    type: string,
    data: Record<string, unknown>,
  ): MappedData | null {
    switch (type) {
      case 'board': {
        const members = data.members as { fullName: string }[] | undefined;
        const lists = data.lists as { name: string }[] | undefined;
        const labels = data.labels as { name: string }[] | undefined;
        const organization = data.organization as
          | { displayName?: string }
          | undefined;
        return {
          title: (data.name as string) || 'Board',
          content: (data.desc as string) || '',
          author: organization?.displayName || 'Trello',
          source: 'trello',
          url: (data.url as string) || '',
          metadata: {
            closed: data.closed,
            shortUrl: data.shortUrl,
            members:
              members?.map((m: { fullName: string }) => m.fullName) || [],
            lists: lists?.map((l: { name: string }) => l.name) || [],
            labels: labels?.map((l: { name: string }) => l.name) || [],
            lastActivity: data.dateLastActivity,
          },
        };
      }
      case 'list':
        return {
          title: (data.name as string) || 'List',
          content: `List in board`,
          author: 'Trello',
          source: 'trello',
          url: (data.url as string) || '',
          metadata: {
            closed: data.closed,
            position: data.pos,
            boardId: data.boardId,
            cardCount: (data.cards as unknown[])?.length || 0,
          },
        };
      case 'card': {
        const cardMembers = data.members as { fullName: string }[] | undefined;
        const cardLabels = data.labels as { name: string }[] | undefined;
        const cardChecklists = data.checklists as
          | { name: string }[]
          | undefined;
        return {
          title: (data.name as string) || 'Card',
          content: (data.desc as string) || '',
          author: cardMembers?.[0]?.fullName || 'Unknown',
          source: 'trello',
          url: (data.url as string) || '',
          metadata: {
            closed: data.closed,
            due: data.due,
            dueComplete: data.dueComplete,
            listId: data.idList,
            boardId: data.boardId,
            position: data.pos,
            labels: cardLabels?.map((l: { name: string }) => l.name) || [],
            members:
              cardMembers?.map((m: { fullName: string }) => m.fullName) || [],
            checklists:
              cardChecklists?.map((c: { name: string }) => c.name) || [],
            attachments: (data.attachments as unknown[])?.length || 0,
            comments: (data.comments as unknown[])?.length || 0,
            lastActivity: data.dateLastActivity,
          },
        };
      }
      default:
        return null;
    }
  }

  private async updateSearchIndex(
    integrationId: string,
    type: string,
    externalId: string,
    mappedData: MappedData,
  ): Promise<void> {
    try {
      const searchContent =
        `${mappedData.title} ${mappedData.content}`.toLowerCase();

      const existing = await this.searchIndexRepo.findOne({
        where: {
          integrationId,
          contentType: type,
        },
      });

      const searchMetadata = {
        source: mappedData.source,
        url: mappedData.url,
        author: mappedData.author,
        timestamp: new Date(),
        tags: [],
        priority: 1,
        ...mappedData.metadata,
      };

      if (existing) {
        existing.title = mappedData.title;
        existing.content = mappedData.content;
        existing.metadata = searchMetadata;
        existing.searchVector = searchContent;
        existing.updatedAt = new Date();
        await this.searchIndexRepo.save(existing);
      } else {
        const searchIndex = this.searchIndexRepo.create({
          integrationId,
          contentType: type,
          title: mappedData.title,
          content: mappedData.content,
          metadata: searchMetadata,
          searchVector: searchContent,
        });
        await this.searchIndexRepo.save(searchIndex);
      }
    } catch (error) {
      this.logger.error('Failed to update search index:', error);
    }
  }
}
