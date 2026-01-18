import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(255)
    legalName: string;

    @IsString()
    @IsNotEmpty()
    @MinLength(5)
    @MaxLength(100)
    fiscalId: string; // Tax ID / NIT / RFC

    @IsString()
    @IsOptional()
    @MaxLength(100)
    industrySector?: string;

    @IsString()
    @IsOptional()
    @MaxLength(200)
    geographicLocation?: string; // "New York 103", "Seattle, WA", etc.

    @IsString()
    @IsOptional()
    @IsIn(['USD', 'EUR', 'GBP', 'MXN', 'COP', 'BRL'])
    defaultCurrency?: string;

    @IsString()
    @IsOptional()
    @IsIn(['km', 'miles'])
    distanceUnit?: string;

    @IsString()
    @IsOptional()
    @IsIn(['liters', 'gallons'])
    volumeUnit?: string;
}
