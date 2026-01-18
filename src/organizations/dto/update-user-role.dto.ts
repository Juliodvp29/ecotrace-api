import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserRoleDto {
    @IsString()
    @IsIn(['admin', 'manager', 'user', 'viewer'])
    role: string;

    @IsString()
    @IsOptional()
    jobTitle?: string;
}