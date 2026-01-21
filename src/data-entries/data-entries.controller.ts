import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { DataEntriesService } from './data-entries.service';
import { CreateDataEntryDto } from './dto/create-data-entry.dto';
import { ProcessDocumentDto } from './dto/process-document.dto';
import { UpdateDataEntryDto } from './dto/update-data-entry.dto';

@Controller('data-entries')
@UseGuards(AuthGuard('jwt'))
export class DataEntriesController {
    constructor(private readonly dataEntriesService: DataEntriesService) { }

    // ============================================================================
    // OCR DOCUMENT PROCESSING
    // ============================================================================

    @Post('process-document')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(FileInterceptor('file'))
    async processDocument(
        @Req() req: any,
        @UploadedFile() file: Express.Multer.File,
        @Body() processDto: ProcessDocumentDto,
    ) {
        if (!file) {
            throw new BadRequestException('File is required');
        }

        // Validate file type
        const allowedMimeTypes = [
            'application/pdf',
            'image/jpeg',
            'image/jpg',
            'image/png',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                'Invalid file type. Only PDF, JPG, and PNG are allowed',
            );
        }

        // Validate file size (max 25MB)
        const maxSize = 25 * 1024 * 1024; // 25MB
        if (file.size > maxSize) {
            throw new BadRequestException('File size must not exceed 25MB');
        }

        return this.dataEntriesService.processDocument(
            req.user.id,
            file,
            processDto.category,
            processDto.facilityId,
            processDto.notes,
        );
    }

    // ============================================================================
    // CRUD OPERATIONS
    // ============================================================================

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Req() req: any, @Body() createDto: CreateDataEntryDto) {
        return this.dataEntriesService.create(req.user.id, createDto);
    }

    @Get()
    async findAll(
        @Req() req: any,
        @Query('facilityId') facilityId?: string,
        @Query('categoryId') categoryId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('status') status?: string,
    ) {
        return this.dataEntriesService.findAll(req.user.id, {
            facilityId,
            categoryId,
            startDate,
            endDate,
            status,
        });
    }

    @Get('stats')
    async getStats(@Req() req: any, @Query('year') year?: string) {
        const targetYear = year ? parseInt(year, 10) : undefined;
        return this.dataEntriesService.getStats(req.user.id, targetYear);
    }

    @Get(':id')
    async findOne(@Req() req: any, @Param('id') id: string) {
        return this.dataEntriesService.findOne(req.user.id, id);
    }

    @Put(':id')
    async update(
        @Req() req: any,
        @Param('id') id: string,
        @Body() updateDto: UpdateDataEntryDto,
    ) {
        return this.dataEntriesService.update(req.user.id, id, updateDto);
    }

    @Put(':id/verify')
    @HttpCode(HttpStatus.OK)
    async verify(@Req() req: any, @Param('id') id: string) {
        return this.dataEntriesService.update(req.user.id, id, {
            verificationStatus: 'verified',
        });
    }

    @Put(':id/reject')
    @HttpCode(HttpStatus.OK)
    async reject(
        @Req() req: any,
        @Param('id') id: string,
        @Body('notes') notes?: string,
    ) {
        return this.dataEntriesService.update(req.user.id, id, {
            verificationStatus: 'action_required',
            notes,
        });
    }

    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async remove(@Req() req: any, @Param('id') id: string) {
        return this.dataEntriesService.remove(req.user.id, id);
    }
}