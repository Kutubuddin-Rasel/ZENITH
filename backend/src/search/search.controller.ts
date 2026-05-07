import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { SearchService, SearchResult } from './search.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request.interface';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query() dto: SearchQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SearchResult> {
    return this.searchService.search(dto, req.user.userId);
  }
}
