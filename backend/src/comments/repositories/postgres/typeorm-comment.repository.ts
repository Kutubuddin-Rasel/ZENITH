// src/comments/repositories/postgres/typeorm-comment.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../../entities/comment.entity';
import type {
  ICommentRepository,
  CommentView,
  KeysetCursor,
} from '../../interfaces/comments.interfaces';

@Injectable()
export class TypeormCommentRepository implements ICommentRepository {
  constructor(
    @InjectRepository(Comment) private readonly repo: Repository<Comment>,
  ) {}

  create(data: {
    issueId: string;
    authorId: string;
    content: string;
  }): CommentView {
    return this.repo.create(data);
  }

  save(comment: CommentView): Promise<CommentView> {
    return this.repo.save(comment as Comment);
  }

  findOne(issueId: string, commentId: string): Promise<CommentView | null> {
    return this.repo.findOneBy({ id: commentId, issueId });
  }

  listOffset(
    issueId: string,
    skip: number,
    take: number,
  ): Promise<[CommentView[], number]> {
    return this.repo.findAndCount({
      where: { issueId },
      relations: ['author'],
      order: { createdAt: 'ASC' },
      skip,
      take,
    });
  }

  listKeyset(
    issueId: string,
    limit: number,
    cursor?: KeysetCursor,
  ): Promise<CommentView[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.author', 'author')
      .where('c.issueId = :issueId', { issueId })
      .orderBy('c.createdAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .take(limit);
    if (cursor) {
      qb.andWhere('(c.createdAt, c.id) > (:cAt, :cId)', {
        cAt: cursor.createdAt,
        cId: cursor.id,
      });
    }
    return qb.getMany();
  }

  remove(comment: CommentView): Promise<void> {
    return this.repo.remove(comment as Comment).then(() => undefined);
  }
}
