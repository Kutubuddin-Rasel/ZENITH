import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Issue } from '../../issues/entities/issue.entity';
import { CustomFieldDefinition } from './custom-field-definition.entity';

@Entity('custom_field_values')
export class CustomFieldValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  issueId: string;

  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issueId' })
  issue: Issue;

  @Column()
  fieldId: string;

  @ManyToOne(() => CustomFieldDefinition, (definition) => definition.values, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fieldId' })
  definition: CustomFieldDefinition;

  @Column({ type: 'text' })
  value: string; // Stored as string, casted at runtime based on definition type

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
