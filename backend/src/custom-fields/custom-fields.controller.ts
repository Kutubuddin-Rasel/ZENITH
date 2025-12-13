import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
} from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post('projects/:projectId/custom-fields')
  create(
    @Param('projectId') projectId: string,
    @Body() createCustomFieldDto: CreateCustomFieldDto,
  ) {
    // Ensure projectId in DTO matches URL param for safety
    createCustomFieldDto.projectId = projectId;
    return this.customFieldsService.createDefinition(createCustomFieldDto);
  }

  @Get('projects/:projectId/custom-fields')
  findAll(@Param('projectId') projectId: string) {
    return this.customFieldsService.findAllDefinitions(projectId);
  }

  @Get('custom-fields/:id')
  findOne(@Param('id') id: string) {
    return this.customFieldsService.findOneDefinition(id);
  }

  @Patch('custom-fields/:id')
  update(
    @Param('id') id: string,
    @Body() updateCustomFieldDto: UpdateCustomFieldDto,
  ) {
    return this.customFieldsService.updateDefinition(id, updateCustomFieldDto);
  }

  @Delete('custom-fields/:id')
  remove(@Param('id') id: string) {
    return this.customFieldsService.removeDefinition(id);
  }

  @Get('issues/:issueId/custom-fields')
  getIssueValues(@Param('issueId') issueId: string) {
    return this.customFieldsService.getValuesForIssue(issueId);
  }

  @Put('issues/:issueId/custom-fields')
  updateIssueValues(
    @Param('issueId') issueId: string,
    @Body() values: { fieldId: string; value: string }[],
  ) {
    return this.customFieldsService.updateValuesForIssue(issueId, values);
  }
}
