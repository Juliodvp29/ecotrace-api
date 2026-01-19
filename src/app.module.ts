import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DataEntriesModule } from './data-entries/data-entries.module';
import { DatabaseModule } from './database/database.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    FacilitiesModule,
    DataEntriesModule
  ],
})
export class AppModule { }