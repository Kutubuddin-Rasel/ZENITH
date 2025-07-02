// src/revisions/subscribers/revision.subscriber.ts
import { Injectable } from '@nestjs/common';
import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  DataSource,
} from 'typeorm';
import { Revision, EntityType } from '../entities/revision.entity';

const WATCHED: { target: Function; type: EntityType }[] = [
  {
    target: () => require('../../projects/entities/project.entity').Project,
    type: 'Project',
  },
  {
    target: () => require('../../issues/entities/issue.entity').Issue,
    type: 'Issue',
  },
  {
    target: () => require('../../sprints/entities/sprint.entity').Sprint,
    type: 'Sprint',
  },
  {
    target: () => require('../../boards/entities/board.entity').Board,
    type: 'Board',
  },
  {
    target: () => require('../../releases/entities/release.entity').Release,
    type: 'Release',
  },
  {
    target: () => require('../../taxonomy/entities/label.entity').Label,
    type: 'Label',
  },
  {
    target: () => require('../../taxonomy/entities/component.entity').Component,
    type: 'Component',
  },
  {
    target: () => require('../../epics/entities/epic.entity').Epic,
    type: 'Epic',
  },
  {
    target: () => require('../../epics/entities/story.entity').Story,
    type: 'Story',
  },
];

@EventSubscriber()
@Injectable()
export class RevisionSubscriber implements EntitySubscriberInterface {
  constructor(private dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    // we return a dummy; actual hooking in after* methods below
    return Revision;
  }

  private getEntityType(targetName: string): EntityType | null {
    const entry = WATCHED.find((w) => w.target().name === targetName);
    return entry ? entry.type : null;
  }

  async afterInsert(event: InsertEvent<any>) {
    await this.record(event, 'CREATE', event.entity);
  }
  async beforeUpdate(event: UpdateEvent<any>) {
    // record snapshot before update
    await this.record(event, 'UPDATE', event.databaseEntity);
  }
  async beforeRemove(event: RemoveEvent<any>) {
    // record snapshot before delete
    await this.record(event, 'DELETE', event.databaseEntity);
  }

  private async record(
    event: InsertEvent<any> | UpdateEvent<any> | RemoveEvent<any>,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    snapshotEntity: any,
  ) {
    const entityName = event.metadata.name;
    const entityType = this.getEntityType(entityName);
    if (!entityType) return; // not watched

    const revRepo = this.dataSource.getRepository(Revision);
    const revision = revRepo.create({
      entityType,
      entityId: snapshotEntity.id,
      snapshot: snapshotEntity,
      action,
      // assume you attached userId to the query runner context:
      changedBy: (event.queryRunner.data?.userId as string) || 'system',
    });
    await revRepo.save(revision);
  }

  handleEvent(event: unknown): unknown {
    // This is a stub for event handling; implement as needed
    return event;
  }
}
