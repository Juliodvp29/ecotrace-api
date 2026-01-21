import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_CONNECTION } from '../database/database.module';
import {
    CreateFacilityDto,
    GeocodeDto,
    UpdateFacilityDto,
} from './dto';

@Injectable()
export class FacilitiesService {
    constructor(@Inject(PG_CONNECTION) private readonly pool: Pool) { }

    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================

    async create(userId: string, createDto: CreateFacilityDto) {
        // Get user's organization
        const orgResult = await this.pool.query(
            'SELECT organization_id, role FROM users WHERE id = $1',
            [userId]
        );

        if (orgResult.rows.length === 0) {
            throw new NotFoundException('User not found');
        }

        const { organization_id, role } = orgResult.rows[0];

        if (!organization_id) {
            throw new ForbiddenException('User must belong to an organization to create facilities');
        }

        // Only admins and managers can create facilities
        if (!['admin', 'manager'].includes(role)) {
            throw new ForbiddenException('Only admins and managers can create facilities');
        }

        const {
            name,
            facilityType,
            address,
            city,
            state,
            country,
            postalCode,
            latitude,
            longitude,
            gridRegion,
        } = createDto;

        // Auto-detect grid region if coordinates provided but no grid region
        let finalGridRegion = gridRegion;
        if (latitude && longitude && !gridRegion) {
            finalGridRegion = this.detectGridRegion(latitude, longitude);
        }

        const result = await this.pool.query(
            `INSERT INTO facilities (
        organization_id, name, facility_type, address, city, state, country,
        postal_code, latitude, longitude, grid_region
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
            [
                organization_id,
                name,
                facilityType,
                address,
                city,
                state,
                country,
                postalCode,
                latitude,
                longitude,
                finalGridRegion,
            ]
        );

        return {
            facility: this.formatFacility(result.rows[0]),
            message: 'Facility created successfully',
        };
    }

    async findAll(userId: string) {
        // Get user's organization
        const orgResult = await this.pool.query(
            'SELECT organization_id FROM users WHERE id = $1',
            [userId]
        );

        if (orgResult.rows.length === 0 || !orgResult.rows[0].organization_id) {
            throw new ForbiddenException('User must belong to an organization');
        }

        const organizationId = orgResult.rows[0].organization_id;

        const result = await this.pool.query(
            `SELECT * FROM facilities 
       WHERE organization_id = $1 
       ORDER BY created_at DESC`,
            [organizationId]
        );

        return result.rows.map(facility => this.formatFacility(facility));
    }

    async findOne(id: string, userId: string) {
        const facility = await this.getFacilityAndVerifyAccess(id, userId);
        return this.formatFacility(facility);
    }

    async update(id: string, userId: string, updateDto: UpdateFacilityDto) {
        const facility = await this.getFacilityAndVerifyAccess(id, userId);

        // Check if user is admin or manager
        const userResult = await this.pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        if (!['admin', 'manager'].includes(userResult.rows[0].role)) {
            throw new ForbiddenException('Only admins and managers can update facilities');
        }

        const {
            name,
            facilityType,
            address,
            city,
            state,
            country,
            postalCode,
            latitude,
            longitude,
            gridRegion,
            isActive,
        } = updateDto;

        const updates: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (facilityType !== undefined) {
            updates.push(`facility_type = $${paramCount++}`);
            values.push(facilityType);
        }
        if (address !== undefined) {
            updates.push(`address = $${paramCount++}`);
            values.push(address);
        }
        if (city !== undefined) {
            updates.push(`city = $${paramCount++}`);
            values.push(city);
        }
        if (state !== undefined) {
            updates.push(`state = $${paramCount++}`);
            values.push(state);
        }
        if (country !== undefined) {
            updates.push(`country = $${paramCount++}`);
            values.push(country);
        }
        if (postalCode !== undefined) {
            updates.push(`postal_code = $${paramCount++}`);
            values.push(postalCode);
        }
        if (latitude !== undefined) {
            updates.push(`latitude = $${paramCount++}`);
            values.push(latitude);
        }
        if (longitude !== undefined) {
            updates.push(`longitude = $${paramCount++}`);
            values.push(longitude);
        }
        if (gridRegion !== undefined) {
            updates.push(`grid_region = $${paramCount++}`);
            values.push(gridRegion);
        } else if (latitude !== undefined && longitude !== undefined) {
            // Auto-detect grid region if coordinates changed
            const detectedRegion = this.detectGridRegion(latitude, longitude);
            updates.push(`grid_region = $${paramCount++}`);
            values.push(detectedRegion);
        }
        if (isActive !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(isActive);
        }

        if (updates.length === 0) {
            throw new BadRequestException('No fields to update');
        }

        values.push(id);
        const result = await this.pool.query(
            `UPDATE facilities 
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING *`,
            values
        );

        return {
            facility: this.formatFacility(result.rows[0]),
            message: 'Facility updated successfully',
        };
    }

    async remove(id: string, userId: string) {
        await this.getFacilityAndVerifyAccess(id, userId);

        // Check if user is admin or manager
        const userResult = await this.pool.query(
            'SELECT role FROM users WHERE id = $1',
            [userId]
        );

        if (!['admin', 'manager'].includes(userResult.rows[0].role)) {
            throw new ForbiddenException('Only admins and managers can delete facilities');
        }

        // Soft delete (set is_active to false)
        await this.pool.query(
            'UPDATE facilities SET is_active = false, updated_at = NOW() WHERE id = $1',
            [id]
        );

        return { message: 'Facility deleted successfully' };
    }

    // ============================================================================
    // GEOCODING
    // ============================================================================

    async geocodeAddress(geocodeDto: GeocodeDto) {
        const { address } = geocodeDto;

        // Simple geocoding simulation
        // In production, use a real geocoding service like Google Maps API, Mapbox, or OpenStreetMap
        // For now, return mock data based on common cities
        const mockGeocode = this.mockGeocoding(address);

        if (!mockGeocode) {
            throw new NotFoundException('Could not geocode address. Please provide coordinates manually.');
        }

        return {
            address,
            latitude: mockGeocode.latitude,
            longitude: mockGeocode.longitude,
            gridRegion: mockGeocode.gridRegion,
            message: 'Address geocoded successfully',
        };
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private async getFacilityAndVerifyAccess(facilityId: string, userId: string) {
        const result = await this.pool.query(
            `SELECT f.*, u.organization_id as user_org_id
       FROM facilities f
       JOIN users u ON u.id = $2
       WHERE f.id = $1`,
            [facilityId, userId]
        );

        if (result.rows.length === 0) {
            throw new NotFoundException('Facility not found');
        }

        const facility = result.rows[0];

        if (facility.organization_id !== facility.user_org_id) {
            throw new ForbiddenException('You do not have access to this facility');
        }

        return facility;
    }

    private formatFacility(facility: any) {
        return {
            id: facility.id,
            organizationId: facility.organization_id,
            name: facility.name,
            facilityType: facility.facility_type,
            address: facility.address,
            city: facility.city,
            state: facility.state,
            country: facility.country,
            postalCode: facility.postal_code,
            latitude: facility.latitude ? parseFloat(facility.latitude) : null,
            longitude: facility.longitude ? parseFloat(facility.longitude) : null,
            gridRegion: facility.grid_region,
            isActive: facility.is_active,
            createdAt: facility.created_at,
            updatedAt: facility.updated_at,
        };
    }

    private detectGridRegion(latitude: number, longitude: number): string {
        // Simplified grid region detection for USA
        // In production, use a proper grid mapping service

        // Western US (WECC)
        if (longitude < -100 && latitude > 32) {
            if (latitude > 47) return 'US-WECC (Seattle)';
            if (latitude > 37) return 'US-WECC (San Francisco)';
            return 'US-WECC (Los Angeles)';
        }

        // Eastern US (Eastern Interconnection)
        if (longitude > -100 && latitude > 32) {
            if (latitude > 40) return 'US-EAST (New York)';
            return 'US-EAST (Florida)';
        }

        // Texas (ERCOT)
        if (latitude > 26 && latitude < 37 && longitude > -107 && longitude < -93) {
            return 'US-ERCOT (Texas)';
        }

        // Default
        return 'Unknown Region';
    }

    private mockGeocoding(address: string): { latitude: number; longitude: number; gridRegion: string } | null {
        // Mock geocoding for common cities
        // In production, replace with real geocoding API
        const mockData: { [key: string]: { latitude: number; longitude: number; gridRegion: string } } = {
            'seattle': { latitude: 47.6062, longitude: -122.3321, gridRegion: 'US-WECC (Seattle)' },
            'san francisco': { latitude: 37.7749, longitude: -122.4194, gridRegion: 'US-WECC (San Francisco)' },
            'los angeles': { latitude: 34.0522, longitude: -118.2437, gridRegion: 'US-WECC (Los Angeles)' },
            'new york': { latitude: 40.7128, longitude: -74.0060, gridRegion: 'US-EAST (New York)' },
            'chicago': { latitude: 41.8781, longitude: -87.6298, gridRegion: 'US-EAST (Chicago)' },
            'houston': { latitude: 29.7604, longitude: -95.3698, gridRegion: 'US-ERCOT (Texas)' },
            'austin': { latitude: 30.2672, longitude: -97.7431, gridRegion: 'US-ERCOT (Texas)' },
            'miami': { latitude: 25.7617, longitude: -80.1918, gridRegion: 'US-EAST (Florida)' },
        };

        const addressLower = address.toLowerCase();

        for (const city in mockData) {
            if (addressLower.includes(city)) {
                return mockData[city];
            }
        }

        return null;
    }
}