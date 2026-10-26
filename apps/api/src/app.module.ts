import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { AuditService } from './common/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { UsersController } from './users/users.controller';
import { GradesController } from './grades/grades.controller';
import { FinanceController } from './finance/finance.controller';
import { AcademicController } from './academic/academic.controller';
import { ScheduleController } from './schedule/schedule.controller';
import { TicketsController } from './tickets/tickets.controller';
import { ResourcesController } from './resources/resources.controller';
import { StorageService } from './files/storage.service';
import { SessionsController } from './sessions/sessions.controller';
import { AnnouncementsController } from './announcements/announcements.controller';
import { ContentController } from './content/content.controller';
import { PushController } from './push/push.controller';
import { PushService } from './push/push.service';
import { ExamsController } from './schedule/exams.controller';
import { AdminController } from './admin/admin.controller';
import { BackupController } from './backup/backup.controller';
import { BackupService } from './backup/backup.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { ProfileController } from './profile/profile.controller';
import { MediaController } from './media/media.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }], skipIf: () => process.env.RATE_LIMIT_DISABLED === 'true' })],
  controllers: [AuthController, UsersController, GradesController, FinanceController, AcademicController, ScheduleController, TicketsController, ResourcesController, SessionsController, AnnouncementsController, ContentController, PushController, ExamsController, AdminController, BackupController, DashboardController, ProfileController, MediaController, HealthController],
  providers: [
    PrismaService, AuditService, AuthService, StorageService, BackupService, PushService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },   // authentication first
    { provide: APP_GUARD, useClass: RolesGuard },   // then role/permission checks
  ],
})
export class AppModule {}
