// src/comments/repositories/postgres/typeorm-comment.repository.spec.ts
import { TypeormCommentRepository } from './typeorm-comment.repository';

describe('TypeormCommentRepository', () => {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const repo: any = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const sut = new TypeormCommentRepository(repo);

  it('listOffset delegates to findAndCount with the existing query shape', async () => {
    await sut.listOffset('issue-1', 0, 20);
    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { issueId: 'issue-1' },
      relations: ['author'],
      order: { createdAt: 'ASC' },
      skip: 0,
      take: 20,
    });
  });

  it('listKeyset applies the (createdAt,id) tuple seek predicate when a cursor is given', async () => {
    await sut.listKeyset('issue-1', 20, {
      createdAt: new Date('2026-06-04T10:00:00Z'),
      id: 'c-9',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(c.createdAt, c.id) > (:cAt, :cId)',
      {
        cAt: expect.any(Date),
        cId: 'c-9',
      },
    );
    expect(qb.take).toHaveBeenCalledWith(20);
  });
});
