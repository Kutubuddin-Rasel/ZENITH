// src/attachments/repositories/typeorm-attachment.repository.ts
//
// TypeORM Attachment Repository — Persistence Adapter (DIP)
// --------------------------------------------------------
// The ONLY place a `Repository<Attachment>` / `Repository<AttachmentHistory>`
// lives. Bound `useClass` under ATTACHMENT_REPOSITORY_TOKEN; the CQRS services
// depend on the `IAttachmentRepository` port, never on TypeORM. Every mutator
// accepts an optional `EntityManager` so the command service can run the
// metadata write + history append as one ACID unit via
// `dataSource.transaction(...)` — the ClickHouse / other-store swap seam.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { Attachment } from '../entities/attachment.entity';
import { AttachmentHistory } from '../entities/attachment-history.entity';
import {
  AttachmentColumn,
  AttachmentHistoryView,
  AttachmentView,
  IAttachmentRepository,
  NewAttachment,
  NewAttachmentHistory,
} from '../interfaces/attachments.interfaces';

@Injectable()
export class TypeormAttachmentRepository implements IAttachmentRepository {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    @InjectRepository(AttachmentHistory)
    private readonly historyRepo: Repository<AttachmentHistory>,
  ) {}

  /** Resolve the active attachment repo — the tx-enlisted one when inside a unit of work. */
  private repo(manager?: EntityManager): Repository<Attachment> {
    return manager ? manager.getRepository(Attachment) : this.attachmentRepo;
  }

  private history(manager?: EntityManager): Repository<AttachmentHistory> {
    return manager
      ? manager.getRepository(AttachmentHistory)
      : this.historyRepo;
  }

  create(data: NewAttachment): AttachmentView {
    return this.attachmentRepo.create(data);
  }

  async save(
    attachment: AttachmentView,
    manager?: EntityManager,
  ): Promise<AttachmentView> {
    // entity ⊆ view: the value originates from `create`, an Attachment instance.
    return this.repo(manager).save(attachment as Attachment);
  }

  async findByTarget(
    column: AttachmentColumn,
    value: string,
    withUploader = false,
  ): Promise<AttachmentView[]> {
    return this.attachmentRepo.find({
      where: { [column]: value } as FindOptionsWhere<Attachment>,
      relations: withUploader ? ['uploader'] : [],
      order: { createdAt: 'DESC' },
    });
  }

  async findOneByTarget(
    column: AttachmentColumn,
    value: string,
    attachmentId: string,
  ): Promise<AttachmentView | null> {
    return this.attachmentRepo.findOne({
      where: {
        id: attachmentId,
        [column]: value,
      } as FindOptionsWhere<Attachment>,
    });
  }

  async remove(
    attachment: AttachmentView,
    manager?: EntityManager,
  ): Promise<void> {
    await this.repo(manager).remove(attachment as Attachment);
  }

  async appendHistory(
    entry: NewAttachmentHistory,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.history(manager);
    await repo.save(repo.create(entry));
  }

  async listHistory(projectId: string): Promise<AttachmentHistoryView[]> {
    return this.historyRepo.find({
      where: { projectId },
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
