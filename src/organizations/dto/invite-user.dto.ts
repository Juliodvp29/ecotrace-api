import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class InviteUserDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsOptional()
    fullName?: string;

    @IsString()
    @IsIn(['admin', 'manager', 'user', 'viewer'])
    role: string;

    @IsString()
    @IsOptional()
    jobTitle?: string;
}