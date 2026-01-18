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
    CreateFacilityDto,
    GeocodeDto,
    UpdateFacilityDto,
} from './dto';
import { FacilitiesService } from './facilities.service';

@Controller('facilities')
@UseGuards(AuthGuard('jwt'))
export class FacilitiesController {
    constructor(private readonly facilitiesService: FacilitiesService) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Req() req: any, @Body() createDto: CreateFacilityDto) {
        return this.facilitiesService.create(req.user.id, createDto);
    }

    @Get()
    async findAll(@Req() req: any) {
        return this.facilitiesService.findAll(req.user.id);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: any) {
        return this.facilitiesService.findOne(id, req.user.id);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Req() req: any,
        @Body() updateDto: UpdateFacilityDto,
    ) {
        return this.facilitiesService.update(id, req.user.id, updateDto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async remove(@Param('id') id: string, @Req() req: any) {
        return this.facilitiesService.remove(id, req.user.id);
    }

    @Post('geocode')
    @HttpCode(HttpStatus.OK)
    async geocode(@Body() geocodeDto: GeocodeDto) {
        return this.facilitiesService.geocodeAddress(geocodeDto);
    }
}