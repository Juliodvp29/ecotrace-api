import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { PG_CONNECTION } from '../database/database.module';
import {
    CreateOrganizationDto,
    InviteUserDto,
    UpdateOrganizationDto,
    UpdateUserRoleDto,
} from './dto';

@Injectable()
export class OrganizationsService {
    constructor(@Inject(PG_CONNECTION) private readonly pool: Pool) { }

    // ============================================================================
    // ORGANIZATION CRUD
    // ============================================================================

    async create(userId: string, createDto: CreateOrganizationDto) {
        const { legalName, fiscalId, industrySector, geographicLocation, defaultCurrency, distanceUnit, volumeUnit, language } = createDto;

        // Check if user already has an organization
        const userCheck = await this.pool.query(
            'SELECT organization_id FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows[0]?.organization_id) {
            throw new ConflictException('User already belongs to an organization');
        }

        // Check if fiscal_id already exists
        const fiscalCheck = await this.pool.query(
            'SELECT id FROM organizations WHERE fiscal_id = $1',
            [fiscalId]
        );

        if (fiscalCheck.rows.length > 0) {
            throw new ConflictException('An organization with this fiscal ID already exists');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create organization
            const orgResult = await client.query(
                `INSERT INTO organizations (legal_name, fiscal_id, industry_sector, geographic_location, default_currency, distance_unit, volume_unit, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
                [legalName, fiscalId, industrySector, geographicLocation, defaultCurrency || 'USD', distanceUnit || 'km', volumeUnit || 'liters', language || 'es']
            );

            const organization = orgResult.rows[0];

            // Update user with organization_id and make them admin
            await client.query(
                `UPDATE users 
         SET organization_id = $1, role = $2, updated_at = NOW()
         WHERE id = $3`,
                [organization.id, 'admin', userId]
            );

            await client.query('COMMIT');

            return {
                organization: this.formatOrganization(organization),
                message: 'Organization created successfully',
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async findByUser(userId: string) {
        const result = await this.pool.query(
            `SELECT o.*, 
              (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND is_active = true) as member_count,
              (SELECT COUNT(*) FROM facilities WHERE organization_id = o.id AND is_active = true) as facility_count
       FROM organizations o
       JOIN users u ON u.organization_id = o.id
       WHERE u.id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('User does not belong to any organization');
        }

        return this.formatOrganization(result.rows[0]);
    }

    async findOne(id: string, userId: string) {
        // Verify user belongs to this organization
        await this.verifyUserInOrganization(userId, id);

        const result = await this.pool.query(
            `SELECT o.*,
              (SELECT COUNT(*) FROM users WHERE organization_id = o.id AND is_active = true) as member_count,
              (SELECT COUNT(*) FROM facilities WHERE organization_id = o.id AND is_active = true) as facility_count
       FROM organizations o
       WHERE o.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Organization not found');
        }

        return this.formatOrganization(result.rows[0]);
    }

    async update(id: string, userId: string, updateDto: UpdateOrganizationDto) {
        // Verify user is admin of this organization
        await this.verifyUserIsAdmin(userId, id);

        const { legalName, industrySector, logoUrl, defaultCurrency, distanceUnit, volumeUnit, language } = updateDto;

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (legalName) {
            updates.push(`legal_name = $${paramCount++}`);
            values.push(legalName);
        }
        if (industrySector !== undefined) {
            updates.push(`industry_sector = $${paramCount++}`);
            values.push(industrySector);
        }
        if (logoUrl !== undefined) {
            updates.push(`logo_url = $${paramCount++}`);
            values.push(logoUrl);
        }
        if (defaultCurrency) {
            updates.push(`default_currency = $${paramCount++}`);
            values.push(defaultCurrency);
        }
        if (distanceUnit) {
            updates.push(`distance_unit = $${paramCount++}`);
            values.push(distanceUnit);
        }
        if (volumeUnit) {
            updates.push(`volume_unit = $${paramCount++}`);
            values.push(volumeUnit);
        }
        if (language) {
            updates.push(`language = $${paramCount++}`);
            values.push(language);
        }

        if (updates.length === 0) {
            throw new BadRequestException('No fields to update');
        }

        values.push(id);
        const result = await this.pool.query(
            `UPDATE organizations 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING *`,
            values
        );

        return {
            organization: this.formatOrganization(result.rows[0]),
            message: 'Organization updated successfully',
        };
    }

    // ============================================================================
    // USERS IN ORGANIZATION
    // ============================================================================

    async getUsers(organizationId: string, userId: string) {
        // Verify user belongs to this organization
        await this.verifyUserInOrganization(userId, organizationId);

        const result = await this.pool.query(
            `SELECT id, email, full_name, role, job_title, avatar_url, auth_provider, 
              is_active, last_login_at, created_at
       FROM users
       WHERE organization_id = $1
       ORDER BY created_at DESC`,
            [organizationId]
        );

        return result.rows.map(user => ({
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            jobTitle: user.job_title,
            avatarUrl: user.avatar_url,
            authProvider: user.auth_provider,
            isActive: user.is_active,
            lastLoginAt: user.last_login_at,
            createdAt: user.created_at,
        }));
    }

    async updateUserRole(
        organizationId: string,
        targetUserId: string,
        adminUserId: string,
        updateDto: UpdateUserRoleDto,
    ) {
        // Verify admin user
        await this.verifyUserIsAdmin(adminUserId, organizationId);

        // Cannot change own role
        if (targetUserId === adminUserId) {
            throw new ForbiddenException('Cannot change your own role');
        }

        // Verify target user is in organization
        const targetUser = await this.pool.query(
            'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
            [targetUserId, organizationId]
        );

        if (targetUser.rows.length === 0) {
            throw new NotFoundException('User not found in this organization');
        }

        const { role, jobTitle } = updateDto;

        const updates: string[] = ['role = $1'];
        const values: any[] = [role];
        let paramCount = 2;

        if (jobTitle !== undefined) {
            updates.push(`job_title = $${paramCount++}`);
            values.push(jobTitle);
        }

        values.push(targetUserId);

        await this.pool.query(
            `UPDATE users 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}`,
            values
        );

        return { message: 'User role updated successfully' };
    }

    async removeUser(organizationId: string, targetUserId: string, adminUserId: string) {
        // Verify admin user
        await this.verifyUserIsAdmin(adminUserId, organizationId);

        // Cannot remove self
        if (targetUserId === adminUserId) {
            throw new ForbiddenException('Cannot remove yourself from the organization');
        }

        // Check if user exists in organization
        const userCheck = await this.pool.query(
            'SELECT role FROM users WHERE id = $1 AND organization_id = $2',
            [targetUserId, organizationId]
        );

        if (userCheck.rows.length === 0) {
            throw new NotFoundException('User not found in this organization');
        }

        // Remove user from organization (set organization_id to null)
        await this.pool.query(
            'UPDATE users SET organization_id = NULL, updated_at = NOW() WHERE id = $1',
            [targetUserId]
        );

        return { message: 'User removed from organization successfully' };
    }

    // ============================================================================
    // INVITATIONS
    // ============================================================================

    async generateInviteCode(organizationId: string, userId: string) {
        // Verify user is admin
        await this.verifyUserIsAdmin(userId, organizationId);

        // Generate a random invite code
        const inviteCode = crypto.randomBytes(16).toString('hex');

        // Store it temporarily (you might want to create an invites table)
        // For now, we'll just return it
        // In production, store with expiration date

        return {
            inviteCode,
            expiresIn: '7 days',
            message: 'Share this code with users to invite them to your organization',
        };
    }

    async inviteUser(organizationId: string, adminUserId: string, inviteDto: InviteUserDto) {
        // Verify admin user
        await this.verifyUserIsAdmin(adminUserId, organizationId);

        const { email, fullName, role, jobTitle } = inviteDto;

        // Check if user already exists
        const existingUser = await this.pool.query(
            'SELECT id, organization_id FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            const user = existingUser.rows[0];

            if (user.organization_id) {
                throw new ConflictException('User already belongs to an organization');
            }

            // User exists but no organization - add them
            await this.pool.query(
                'UPDATE users SET organization_id = $1, role = $2, job_title = $3, updated_at = NOW() WHERE id = $4',
                [organizationId, role, jobTitle, user.id]
            );

            return {
                message: 'User added to organization successfully',
                userId: user.id,
            };
        }

        // User doesn't exist - send invitation email (implement later)
        // For now, just return success
        return {
            message: 'Invitation sent successfully',
            note: 'User will be added when they register',
            email,
        };
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private async verifyUserInOrganization(userId: string, organizationId: string) {
        const result = await this.pool.query(
            'SELECT organization_id FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0 || result.rows[0].organization_id !== organizationId) {
            throw new ForbiddenException('User does not belong to this organization');
        }
    }

    private async verifyUserIsAdmin(userId: string, organizationId: string) {
        const result = await this.pool.query(
            'SELECT role, organization_id FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('User not found');
        }

        const user = result.rows[0];

        if (user.organization_id !== organizationId) {
            throw new ForbiddenException('User does not belong to this organization');
        }

        if (user.role !== 'admin') {
            throw new ForbiddenException('Only administrators can perform this action');
        }
    }

    private formatOrganization(org: any) {
        return {
            id: org.id,
            legalName: org.legal_name,
            fiscalId: org.fiscal_id,
            industrySector: org.industry_sector,
            geographicLocation: org.geographic_location,
            logoUrl: org.logo_url,
            defaultCurrency: org.default_currency,
            distanceUnit: org.distance_unit,
            volumeUnit: org.volume_unit,
            language: org.language,
            memberCount: parseInt(org.member_count) || 0,
            facilityCount: parseInt(org.facility_count) || 0,
            createdAt: org.created_at,
            updatedAt: org.updated_at,
        };
    }
}