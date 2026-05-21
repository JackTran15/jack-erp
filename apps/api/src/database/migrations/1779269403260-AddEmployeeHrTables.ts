import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Employee HR profile tables (EPIC-20052026):
 *  - job_positions                 reference data (generic CRUD, soft-delete)
 *  - employee_profiles             1:1 with users; holds HR fields
 *  - employee_addresses            permanent / current residence
 *  - employee_emergency_contacts   1:1 emergency contact
 *  - employee_access_schedules     per-weekday software access windows
 */
export class AddEmployeeHrTables1779269403260 implements MigrationInterface {
  name = 'AddEmployeeHrTables1779269403260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- job_positions -------------------------------------------------------
    await queryRunner.query(
      `CREATE TABLE "job_positions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying NOT NULL, "branch_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" character varying NOT NULL, "name" character varying(255) NOT NULL, "code" character varying(50), "description" character varying(500), "is_active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, CONSTRAINT "PK_job_positions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_job_position_org_name" ON "job_positions" ("organization_id", "name") `,
    );

    // --- employee_profiles ---------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."employee_profiles_gender_enum" AS ENUM('MALE', 'FEMALE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_profiles_marital_status_enum" AS ENUM('SINGLE', 'MARRIED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_profiles_employment_status_enum" AS ENUM('OFFICIAL', 'PROBATION', 'RESIGNED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_profiles_access_mode_enum" AS ENUM('FREE', 'SCHEDULED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying NOT NULL, "branch_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" character varying NOT NULL, "user_id" uuid NOT NULL, "code" character varying(50) NOT NULL, "mobile" character varying(30), "home_phone" character varying(30), "id_card_number" character varying(20), "id_card_issue_place" character varying(255), "id_card_issue_date" date, "birth_date" date, "gender" "public"."employee_profiles_gender_enum", "marital_status" "public"."employee_profiles_marital_status_enum", "employment_status" "public"."employee_profiles_employment_status_enum" NOT NULL DEFAULT 'OFFICIAL', "photo_url" character varying(500), "job_position_id" uuid, "probation_date" date, "official_date" date, "salary" numeric(18,2) NOT NULL DEFAULT '0', "deposit" numeric(18,2) NOT NULL DEFAULT '0', "original_documents_note" character varying(1000), "access_mode" "public"."employee_profiles_access_mode_enum" NOT NULL DEFAULT 'FREE', CONSTRAINT "PK_employee_profiles" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_employee_profile_user" ON "employee_profiles" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_employee_profile_org_code" ON "employee_profiles" ("organization_id", "code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_employee_profile_org_job" ON "employee_profiles" ("organization_id", "job_position_id") `,
    );

    // --- employee_addresses --------------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."employee_addresses_type_enum" AS ENUM('PERMANENT', 'CURRENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying NOT NULL, "branch_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" character varying NOT NULL, "employee_profile_id" uuid NOT NULL, "type" "public"."employee_addresses_type_enum" NOT NULL, "address" character varying(500), "country" character varying(100), "province" character varying(100), "district" character varying(100), "ward" character varying(100), CONSTRAINT "PK_employee_addresses" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_employee_address_profile_type" ON "employee_addresses" ("employee_profile_id", "type") `,
    );

    // --- employee_emergency_contacts ----------------------------------------
    await queryRunner.query(
      `CREATE TABLE "employee_emergency_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying NOT NULL, "branch_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" character varying NOT NULL, "employee_profile_id" uuid NOT NULL, "full_name" character varying(255), "relationship" character varying(100), "mobile" character varying(30), "home_phone" character varying(30), "email" character varying(255), "address" character varying(500), CONSTRAINT "PK_employee_emergency_contacts" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_employee_emergency_profile" ON "employee_emergency_contacts" ("employee_profile_id") `,
    );

    // --- employee_access_schedules ------------------------------------------
    await queryRunner.query(
      `CREATE TYPE "public"."employee_access_schedules_weekday_enum" AS ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY')`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_access_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "organization_id" character varying NOT NULL, "branch_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" character varying NOT NULL, "employee_profile_id" uuid NOT NULL, "weekday" "public"."employee_access_schedules_weekday_enum" NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "start_time" TIME NOT NULL DEFAULT '00:00', "end_time" TIME NOT NULL DEFAULT '23:59', CONSTRAINT "PK_employee_access_schedules" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_employee_access_profile_weekday" ON "employee_access_schedules" ("employee_profile_id", "weekday") `,
    );

    // --- foreign keys --------------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_employee_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" ADD CONSTRAINT "FK_employee_profiles_job_position" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_addresses" ADD CONSTRAINT "FK_employee_addresses_profile" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_emergency_contacts" ADD CONSTRAINT "FK_employee_emergency_profile" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_access_schedules" ADD CONSTRAINT "FK_employee_access_profile" FOREIGN KEY ("employee_profile_id") REFERENCES "employee_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_access_schedules" DROP CONSTRAINT "FK_employee_access_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_emergency_contacts" DROP CONSTRAINT "FK_employee_emergency_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_addresses" DROP CONSTRAINT "FK_employee_addresses_profile"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_employee_profiles_job_position"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_profiles" DROP CONSTRAINT "FK_employee_profiles_user"`,
    );

    await queryRunner.query(`DROP INDEX "public"."uq_employee_access_profile_weekday"`);
    await queryRunner.query(`DROP TABLE "employee_access_schedules"`);
    await queryRunner.query(`DROP TYPE "public"."employee_access_schedules_weekday_enum"`);

    await queryRunner.query(`DROP INDEX "public"."uq_employee_emergency_profile"`);
    await queryRunner.query(`DROP TABLE "employee_emergency_contacts"`);

    await queryRunner.query(`DROP INDEX "public"."uq_employee_address_profile_type"`);
    await queryRunner.query(`DROP TABLE "employee_addresses"`);
    await queryRunner.query(`DROP TYPE "public"."employee_addresses_type_enum"`);

    await queryRunner.query(`DROP INDEX "public"."idx_employee_profile_org_job"`);
    await queryRunner.query(`DROP INDEX "public"."uq_employee_profile_org_code"`);
    await queryRunner.query(`DROP INDEX "public"."uq_employee_profile_user"`);
    await queryRunner.query(`DROP TABLE "employee_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."employee_profiles_access_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."employee_profiles_employment_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."employee_profiles_marital_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."employee_profiles_gender_enum"`);

    await queryRunner.query(`DROP INDEX "public"."uq_job_position_org_name"`);
    await queryRunner.query(`DROP TABLE "job_positions"`);
  }
}
