import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
    @IsString()
    @IsOptional()
    @MinLength(2)
    @MaxLength(255)
    legalName?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    industrySector?: string;

    @IsString()
    @IsOptional()
    @IsUrl()
    logoUrl?: string;

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