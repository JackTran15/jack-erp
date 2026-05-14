import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { TemporaryTransferEntity } from './temporary-transfer.entity';

/** Single item line within a temporary transfer. `returnedQuantity` tracks partial returns. */
@Entity('temporary_transfer_lines')
export class TemporaryTransferLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'source_location_id', type: 'uuid' })
  sourceLocationId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  quantity: number;

  @Column({ name: 'returned_quantity', type: 'numeric', precision: 18, scale: 2, default: 0 })
  returnedQuantity: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => TemporaryTransferEntity, (transfer) => transfer.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: TemporaryTransferEntity;
}
