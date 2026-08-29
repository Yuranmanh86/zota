import { Module } from '@nestjs/common';
import { AuthenticationModule } from './modules/authentication/authentication.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { SavingsModule } from './modules/savings/savings.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { LoansModule } from './modules/loans/loans.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ChatModule } from './modules/chat/chat.module';
import { CommunityModule } from './modules/community/community.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { CustomerSupportModule } from './modules/customer-support/customer-support.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SecurityModule } from './modules/security/security.module';

@Module({
  imports: [
    AuthenticationModule,
    UsersModule,
    WalletModule,
    SavingsModule,
    InvestmentsModule,
    LoansModule,
    TransactionsModule,
    NotificationsModule,
    ChatModule,
    CommunityModule,
    AiAssistantModule,
    CustomerSupportModule,
    AdministrationModule,
    ReportsModule,
    SecurityModule,
  ],
})
export class AppModule {}
