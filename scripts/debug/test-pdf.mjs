import { createRequire } from 'module';
import { register } from 'ts-node';
import { writeFileSync } from 'fs';

// Use ts-node to import TypeScript
register({ esm: true });

const { generateNotificationPdf } = await import('./server/_core/htmlToPdf.ts');

const buf = await generateNotificationPdf({
  clientName: 'LUCAS SANTOS MIRANDA',
  clientCpfCnpj: '123.456.789-00',
  clientEmail: 'lucas@test.com',
  debts: [
    { description: 'Mensalidade Maio/2026', dueDate: '2026-05-01', value: 350, daysOverdue: 18, type: 'monthly' },
    { description: 'Abastecimento Abril/2026', dueDate: '2026-04-15', value: 120, daysOverdue: 34, type: 'fuel' },
  ],
  totalDebt: 470,
  notificationDate: '19 de maio de 2026',
  notificationNumber: 'EC-20260519-1',
});

writeFileSync('/tmp/test-notification.pdf', buf);
console.log('✅ Notificação PDF gerada com sucesso! Tamanho:', buf.length, 'bytes');
console.log('📄 Arquivo salvo em /tmp/test-notification.pdf');
