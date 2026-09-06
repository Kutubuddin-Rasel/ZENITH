// src/comments/interfaces/comments.interfaces.ts
import type { CreateCommentDto } from '../dto/create-comment.dto';
import type { UpdateCommentDto } from '../dto/update-comment.dto';

/** Read projection of a comment. The TypeORM `Comment` entity is assignable to this. */
export interface CommentView {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author?: unknown; // hydrated when relations:['author'] is loaded
}

export interface OffsetPage {
  page: number;
  limit: number;
}

export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export interface PaginatedComments {
  data: CommentView[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface KeysetComments {
  data: CommentView[];
  nextCursor: string | null;
}

/** Read surface. Implementations MUST enforce issue/tenant access before returning. */
export interface ICommentQuery {
  findAll(
    projectId: string,
    issueId: string,
    userId: string,
    page: OffsetPage,
  ): Promise<PaginatedComments>;

  findAllKeyset(
    projectId: string,
    issueId: string,
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<KeysetComments>;

  /**
   * Pure authorization probe. Resolves the comment and asserts the caller may
   * MUTATE it (author or PROJECT_LEAD). Throws NotFound/Forbidden otherwise.
   * NO writes, NO audit, NO notifications — safe on read paths.
   */
  assertEditable(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<CommentView>;
}

/** Write surface. */
export interface ICommentCommand {
  create(
    projectId: string,
    issueId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<CommentView>;

  update(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentView>;

  remove(
    projectId: string,
    issueId: string,
    commentId: string,
    userId: string,
  ): Promise<void>;
}

/** Persistence port — the ClickHouse/other-store swap seam. */
export interface ICommentRepository {
  create(data: {
    issueId: string;
    authorId: string;
    content: string;
  }): CommentView;
  save(comment: CommentView): Promise<CommentView>;
  findOne(issueId: string, commentId: string): Promise<CommentView | null>;
  /** Offset page + total count. */
  listOffset(
    issueId: string,
    skip: number,
    take: number,
  ): Promise<[CommentView[], number]>;
  /** Keyset seek: returns up to `limit` rows after `cursor`, ordered (createdAt, id) ASC. */
  listKeyset(
    issueId: string,
    limit: number,
    cursor?: KeysetCursor,
  ): Promise<CommentView[]>;
  remove(comment: CommentView): Promise<void>;
}
