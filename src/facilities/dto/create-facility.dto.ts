import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateFacilityDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(255)
    name: string;

    @IsString()
    @IsOptional()
    @IsIn(['office', 'warehouse', 'factory', 'retail', 'data_center', 'other'])
    facilityType?: string;

    @IsString()
    @IsOptional()
    @MaxLength(500)
    address?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    city?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    state?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    country?: string;

    @IsString()
    @IsOptional()
    @MaxLength(20)
    postalCode?: string;

    @IsNumber()
    @IsOptional()
    @Min(-90)
    @Max(90)
    latitude?: number;

    @IsNumber()
    @IsOptional()
    @Min(-180)
    @Max(180)
    longitude?: number;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    gridRegion?: string; // e.g., "US-WECC (Seattle)"
}