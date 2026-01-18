import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
    CreateOrganizationDto,
    InviteUserDto,
    UpdateOrganizationDto,
    UpdateUserRoleDto,
} from './dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(AuthGuard('jwt'))
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService) { }

    // ============================================================================
    // ORGANIZATION MANAGEMENT
    // ============================================================================

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Req() req: any, @Body() createDto: CreateOrganizationDto) {
        return this.organizationsService.create(req.user.id, createDto);
    }

    @Get('me')
    async getMyOrganization(@Req() req: any) {
        return this.organizationsService.findByUser(req.user.id);
    }

    @Get(':id')
    async getOrganization(@Param('id') id: string, @Req() req: any) {
        return this.organizationsService.findOne(id, req.user.id);
    }

    @Put(':id')
    async updateOrganization(
        @Param('id') id: string,
        @Req() req: any,
        @Body() updateDto: UpdateOrganizationDto,
    ) {
        return this.organizationsService.update(id, req.user.id, updateDto);
    }

    // ============================================================================
    // USER MANAGEMENT
    // ============================================================================

    @Get(':id/users')
    async getOrganizationUsers(@Param('id') id: string, @Req() req: any) {
        return this.organizationsService.getUsers(id, req.user.id);
    }

    @Post(':id/invite')
    @HttpCode(HttpStatus.OK)
    async inviteUser(
        @Param('id') id: string,
        @Req() req: any,
        @Body() inviteDto: InviteUserDto,
    ) {
        return this.organizationsService.inviteUser(id, req.user.id, inviteDto);
    }

    @Put(':id/users/:userId/role')
    async updateUserRole(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Req() req: any,
        @Body() updateDto: UpdateUserRoleDto,
    ) {
        return this.organizationsService.updateUserRole(id, userId, req.user.id, updateDto);
    }

    @Delete(':id/users/:userId')
    @HttpCode(HttpStatus.OK)
    async removeUser(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Req() req: any,
    ) {
        return this.organizationsService.removeUser(id, userId, req.user.id);
    }

    @Post(':id/invite-code')
    @HttpCode(HttpStatus.OK)
    async generateInviteCode(@Param('id') id: string, @Req() req: any) {
        return this.organizationsService.generateInviteCode(id, req.user.id);
    }
}