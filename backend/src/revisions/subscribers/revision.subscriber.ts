// src/revisions/subscribers/revision.subscriber.ts
import { Injectable } from '@nestjs/common';
import {
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  DataSource,
  ObjectLiteral,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { Sprint } from '../../sprints/entities/sprint.entity';
import { Board } from '../../boards/entities/board.entity';
import { Release } from '../../releases/entities/release.entity';
import { Label } from '../../taxonomy/entities/label.entity';
import { Component } from '../../taxonomy/entities/component.entity';
import { Revision, EntityType } from '../entities/revision.entity';

const WATCHED: { target: () => { name: string }; type: EntityType }[] = [
  { target: () => Project, type: 'Project' },
  { target: () => Issue, type: 'Issue' },
  { target: () => Sprint, type: 'Sprint' },
  { target: () => Board, type: 'Board' },
  { target: () => Release, type: 'Release' },
  { target: () => Label, type: 'Label' },
  { target: () => Component, type: 'Component' },
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

  async afterInsert(event: InsertEvent<ObjectLiteral>) {
    await this.record(event, 'CREATE', event.entity);
  }
  async beforeUpdate(event: UpdateEvent<ObjectLiteral>) {
    // record snapshot before update
    await this.record(event, 'UPDATE', event.databaseEntity);
  }
  async beforeRemove(event: RemoveEvent<ObjectLiteral>) {
    // record snapshot before delete
    await this.record(event, 'DELETE', event.databaseEntity);
  }

  private async record(
    event:
      | InsertEvent<ObjectLiteral>
      | UpdateEvent<ObjectLiteral>
      | RemoveEvent<ObjectLiteral>,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    snapshotEntity: ObjectLiteral,
  ) {
    const entityName = event.metadata.name;
    const entityType = this.getEntityType(entityName);
    if (!entityType) return; // not watched

    const revRepo = this.dataSource.getRepository(Revision);
    const revision = revRepo.create({
      entityType,
      entityId: (snapshotEntity as { id: string }).id,
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
