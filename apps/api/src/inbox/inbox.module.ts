import { Module } from '@nestjs/common';
import { ImapService } from './imap.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

// MailModule is global, so MailService is injected without importing it here.
@Module({
  controllers: [InboxController],
  providers: [ImapService, InboxService],
})
export class InboxModule {}
