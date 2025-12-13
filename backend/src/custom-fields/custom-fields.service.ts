import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomFieldDefinition } from './entities/custom-field-definition.entity';
import { CustomFieldValue } from './entities/custom-field-value.entity';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private definitionsRepository: Repository<CustomFieldDefinition>,
    @InjectRepository(CustomFieldValue)
    private valuesRepository: Repository<CustomFieldValue>,
  ) {}

  async createDefinition(
    createDto: CreateCustomFieldDto,
  ): Promise<CustomFieldDefinition> {
    const definition = this.definitionsRepository.create(createDto);
    return this.definitionsRepository.save(definition);
  }

  async findAllDefinitions(
    projectId: string,
  ): Promise<CustomFieldDefinition[]> {
    return this.definitionsRepository.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOneDefinition(id: string): Promise<CustomFieldDefinition> {
    const definition = await this.definitionsRepository.findOne({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException(
        `Custom field definition with ID ${id} not found`,
      );
    }
    return definition;
  }

  async updateDefinition(
    id: string,
    updateDto: UpdateCustomFieldDto,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.findOneDefinition(id);
    Object.assign(definition, updateDto);
    return this.definitionsRepository.save(definition);
  }

  async removeDefinition(id: string): Promise<void> {
    const result = await this.definitionsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(
        `Custom field definition with ID ${id} not found`,
      );
    }
  }

  async getValuesForIssue(issueId: string): Promise<CustomFieldValue[]> {
    return this.valuesRepository.find({
      where: { issueId },
      relations: ['definition'],
    });
  }

  async updateValuesForIssue(
    issueId: string,
    values: { fieldId: string; value: string }[],
  ): Promise<CustomFieldValue[]> {
    // Remove existing values for these fields to avoid duplicates/conflicts
    // Or we can upsert. Let's try upsert logic.

    const savedValues: CustomFieldValue[] = [];

    for (const val of values) {
      let existing = await this.valuesRepository.findOne({
        where: { issueId, fieldId: val.fieldId },
      });

      if (existing) {
        existing.value = val.value;
      } else {
        existing = this.valuesRepository.create({
          issueId,
          fieldId: val.fieldId,
          value: val.value,
        });
      }
      savedValues.push(await this.valuesRepository.save(existing));
    }

    return savedValues;
  }
}
