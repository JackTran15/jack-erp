import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { StockTakeEntity } from "./stock-take.entity";

@Entity("stock_take_members")
export class StockTakeMemberEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "organization_id" })
  organizationId: string;

  @Column({ name: "branch_id", nullable: true })
  branchId?: string;

  @Column({ name: "stock_take_id", type: "uuid" })
  stockTakeId: string;

  @Column({ name: "full_name", type: "varchar", length: 255 })
  fullName: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  title?: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  representative?: string | null;

  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "created_by" })
  createdBy: string;

  @ManyToOne(() => StockTakeEntity, (st) => st.members, { onDelete: "CASCADE" })
  @JoinColumn({ name: "stock_take_id" })
  stockTake: StockTakeEntity;
}
