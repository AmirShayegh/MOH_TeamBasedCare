import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueTemplateNameIndex1770100000000 implements MigrationInterface {
  name = 'AddUniqueTemplateNameIndex1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Rename duplicate templates using unique id suffix to avoid collisions
    await queryRunner.query(`
      UPDATE care_setting_template SET name = name || ' (dup-' || LEFT(sub.id::text, 8) || ')'
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY LOWER(name), unit_id, health_authority
          ORDER BY created_at ASC, id ASC
        ) AS rn
        FROM care_setting_template
      ) sub
      WHERE care_setting_template.id = sub.id AND sub.rn > 1
    `);

    // Step 2: Safety backfill — ensure isMaster is true for GLOBAL templates
    await queryRunner.query(`
      UPDATE care_setting_template SET is_master = true
      WHERE health_authority = 'GLOBAL' AND is_master = false
    `);

    // Step 3: Create unique index on (lower(name), unit_id, health_authority)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_unique_template_name_unit_ha"
      ON "care_setting_template" (LOWER(name), unit_id, health_authority)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_unique_template_name_unit_ha"`);
  }
}
