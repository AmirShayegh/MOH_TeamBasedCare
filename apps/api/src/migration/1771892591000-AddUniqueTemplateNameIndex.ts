import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueTemplateNameIndex1771892591000 implements MigrationInterface {
  name = 'AddUniqueTemplateNameIndex1771892591000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Rename duplicate templates (same name + same HA) using unique id suffix
    await queryRunner.query(`
      UPDATE care_setting_template SET name = name || ' (duplicate-' || LEFT(sub.id::text, 8) || ')'
      FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY LOWER(name), health_authority
          ORDER BY created_at ASC, id ASC
        ) AS rn
        FROM care_setting_template
      ) sub
      WHERE care_setting_template.id = sub.id AND sub.rn > 1
    `);

    // Step 2: Create unique index on (lower(name), health_authority)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_unique_template_name_ha"
      ON "care_setting_template" (LOWER(name), health_authority)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_unique_template_name_ha"`);
  }
}
