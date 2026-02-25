import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { PlanningSession } from 'src/planning-session/entity/planning-session.entity';
import { CareSettingTemplate } from 'src/unit/entity/care-setting-template.entity';
import {
  GeneralKPIsRO,
  CarePlansBySettingRO,
  KPIsOverviewRO,
  KPIFilterDTO,
  KPICareSettingRO,
  Role,
} from '@tbcm/common';

@Injectable()
export class KpiService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PlanningSession)
    private readonly planningSessionRepo: Repository<PlanningSession>,
    @InjectRepository(CareSettingTemplate)
    private readonly templateRepo: Repository<CareSettingTemplate>,
  ) {}

  /** Returns null for admins (no HA restriction), or the user's org for content admins. */
  getEffectiveHealthAuthority(user: { roles?: Role[]; organization?: string }): string | null {
    const isAdmin = user.roles?.some(r => r === Role.ADMIN);
    if (isAdmin) return null;
    return user.organization || '';
  }

  async getGeneralKPIs(healthAuthority?: string): Promise<GeneralKPIsRO> {
    // Active Users (logged in at least once, not revoked)
    const activeUsersQuery = this.userRepo
      .createQueryBuilder('u')
      .where('u.keycloakId IS NOT NULL')
      .andWhere('u.revokedAt IS NULL');

    if (healthAuthority) {
      activeUsersQuery.andWhere('u.organization = :healthAuthority', { healthAuthority });
    }

    const activeUsers = await activeUsersQuery.getCount();

    // Pending Users (invited but not yet logged in)
    const pendingUsersQuery = this.userRepo
      .createQueryBuilder('u')
      .where('u.keycloakId IS NULL')
      .andWhere('u.revokedAt IS NULL');

    if (healthAuthority) {
      pendingUsersQuery.andWhere('u.organization = :healthAuthority', { healthAuthority });
    }

    const pendingUsers = await pendingUsersQuery.getCount();

    // Total Care Plans — when filtering by HA, count plans created by users in that HA
    const carePlansQuery = this.planningSessionRepo
      .createQueryBuilder('ps')
      .innerJoin('ps.careSettingTemplate', 'cst');

    if (healthAuthority) {
      carePlansQuery
        .innerJoin('ps.createdBy', 'creator')
        .where('creator.organization = :healthAuthority', { healthAuthority });
    }

    const totalCarePlans = await carePlansQuery.getCount();

    return new GeneralKPIsRO({
      activeUsers,
      pendingUsers,
      totalCarePlans,
    });
  }

  async getCarePlansBySetting(filter: KPIFilterDTO): Promise<CarePlansBySettingRO[]> {
    const queryBuilder = this.templateRepo
      .createQueryBuilder('cst')
      .leftJoin(PlanningSession, 'ps', 'ps.care_setting_template_id = cst.id')
      .select('cst.id', 'careSettingId')
      .addSelect('cst.name', 'careSettingName')
      .addSelect('cst.healthAuthority', 'healthAuthority')
      .addSelect('cst.isMaster', 'isMaster')
      .addSelect('COALESCE(COUNT(ps.id), 0)', 'count')
      .groupBy('cst.id')
      .addGroupBy('cst.name')
      .addGroupBy('cst.healthAuthority')
      .addGroupBy('cst.isMaster')
      .orderBy('count', 'DESC');

    // Apply health authority filter (uses template's HA, not creator's org)
    if (filter.healthAuthority) {
      queryBuilder.andWhere('cst.healthAuthority IN (:...authorities)', {
        authorities: [filter.healthAuthority, 'GLOBAL'],
      });
    }

    // Apply care setting filter (now a template ID)
    if (filter.careSettingId) {
      queryBuilder.andWhere('cst.id = :careSettingId', {
        careSettingId: filter.careSettingId,
      });
    }

    const results = await queryBuilder.getRawMany();

    return results.map(
      r =>
        new CarePlansBySettingRO({
          careSettingId: r.careSettingId,
          careSettingName: r.careSettingName,
          healthAuthority: r.healthAuthority || 'Unknown',
          isMaster: r.isMaster,
          count: parseInt(r.count, 10),
        }),
    );
  }

  async getKPIsOverview(filter: KPIFilterDTO): Promise<KPIsOverviewRO> {
    const [general, carePlansBySetting] = await Promise.all([
      this.getGeneralKPIs(filter.healthAuthority),
      this.getCarePlansBySetting(filter),
    ]);

    return new KPIsOverviewRO({
      general,
      carePlansBySetting,
    });
  }

  async getCareSettings(healthAuthority?: string | null): Promise<KPICareSettingRO[]> {
    const queryBuilder = this.templateRepo
      .createQueryBuilder('cst')
      .select('cst.id', 'id')
      .addSelect('cst.name', 'displayName')
      .addSelect('cst.healthAuthority', 'healthAuthority')
      .addSelect('cst.isMaster', 'isMaster');

    // Content admins see their HA + GLOBAL templates; admins see all (healthAuthority = null)
    if (healthAuthority !== undefined && healthAuthority !== null) {
      if (healthAuthority) {
        queryBuilder.where('cst.healthAuthority IN (:...authorities)', {
          authorities: [healthAuthority, 'GLOBAL'],
        });
      } else {
        queryBuilder.where('cst.healthAuthority = :global', { global: 'GLOBAL' });
      }
    }

    queryBuilder.orderBy('cst.name', 'ASC').addOrderBy('cst.healthAuthority', 'ASC');

    const results = await queryBuilder.getRawMany();
    return results.map(
      r =>
        new KPICareSettingRO({
          id: r.id,
          displayName: r.displayName,
          healthAuthority: r.healthAuthority,
          isMaster: r.isMaster,
        }),
    );
  }
}
