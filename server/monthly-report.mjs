/**
 * Script para gerar e enviar relatório mensal automático
 * 
 * Uso:
 * node server/monthly-report.mjs
 * 
 * Cron (executar no dia 1 de cada mês às 9h):
 * 0 9 1 * * cd /home/ubuntu/exclusive-club-reservas && node server/monthly-report.mjs
 */

import { sendEmail } from "./_core/emailService.ts";
import * as db from "./db.ts";

async function generateMonthlyReport() {
  console.log("[Monthly Report] Gerando relatório mensal...");
  
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  
  const monthName = lastMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  
  // Buscar reservas do mês passado
  const bookings = await db.getBookings({
    startDate: lastMonth.getTime(),
    endDate: lastMonthEnd.getTime(),
  });
  
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const usedBookings = bookings.filter(b => b.status === 'used');
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled');
  
  // Calcular estatísticas
  const totalBookings = bookings.length;
  const occupationRate = totalBookings > 0 ? Math.round((usedBookings.length / totalBookings) * 100) : 0;
  
  // Top 5 clientes mais ativos
  const clientStats = {};
  usedBookings.forEach(booking => {
    const email = booking.clientEmail;
    if (!clientStats[email]) {
      clientStats[email] = { name: booking.clientName, count: 0 };
    }
    clientStats[email].count++;
  });
  
  const topClients = Object.entries(clientStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([email, data]) => ({ email, ...data }));
  
  // Buscar manutenções do mês
  const allMaintenances = await db.getAllMaintenances();
  const monthMaintenances = allMaintenances.filter(m => {
    const start = new Date(m.startDate);
    return start >= lastMonth && start <= lastMonthEnd;
  });
  
  // Gerar HTML do relatório
  const subject = `Relatório Mensal - ${monthName} - Exclusive Club`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #f9fafb;">
      <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); padding: 40px 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Exclusive Club</h1>
        <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">Relatório Mensal - ${monthName}</p>
      </div>
      
      <div style="background-color: white; padding: 40px 30px; border-radius: 8px; margin: 20px;">
        <h2 style="color: #0891b2; margin-top: 0;">Resumo do Mês</h2>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 30px 0;">
          <div style="background-color: #f0f9ff; border-left: 4px solid #0891b2; padding: 20px; border-radius: 4px;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Total de Reservas</p>
            <p style="margin: 10px 0 0 0; color: #1f2937; font-size: 32px; font-weight: bold;">${totalBookings}</p>
          </div>
          
          <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 20px; border-radius: 4px;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Reservas Utilizadas</p>
            <p style="margin: 10px 0 0 0; color: #1f2937; font-size: 32px; font-weight: bold;">${usedBookings.length}</p>
          </div>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 4px;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Cancelamentos</p>
            <p style="margin: 10px 0 0 0; color: #1f2937; font-size: 32px; font-weight: bold;">${cancelledBookings.length}</p>
          </div>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 4px;">
            <p style="margin: 0; color: #6b7280; font-size: 14px;">Taxa de Ocupação</p>
            <p style="margin: 10px 0 0 0; color: #1f2937; font-size: 32px; font-weight: bold;">${occupationRate}%</p>
          </div>
        </div>
        
        <h3 style="color: #0891b2; font-size: 20px; margin-top: 40px;">Top 5 Clientes Mais Ativos</h3>
        
        ${topClients.length > 0 ? `
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px;">Cliente</th>
                <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 14px;">Email</th>
                <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 14px;">Utilizações</th>
              </tr>
            </thead>
            <tbody>
              ${topClients.map((client, index) => `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 12px; color: #1f2937;">${index + 1}. ${client.name}</td>
                  <td style="padding: 12px; color: #6b7280;">${client.email}</td>
                  <td style="padding: 12px; text-align: center; color: #059669; font-weight: bold;">${client.count}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <p style="color: #6b7280; font-style: italic; margin-top: 20px;">Nenhum cliente utilizou embarcações este mês.</p>
        `}
        
        <h3 style="color: #0891b2; font-size: 20px; margin-top: 40px;">Manutenções Realizadas</h3>
        
        ${monthMaintenances.length > 0 ? `
          <ul style="list-style: none; padding: 0; margin-top: 20px;">
            ${monthMaintenances.map(m => {
              const startDate = new Date(m.startDate).toLocaleDateString('pt-BR');
              const endDate = new Date(m.endDate).toLocaleDateString('pt-BR');
              return `
                <li style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 10px; border-radius: 4px;">
                  <strong style="color: #1f2937;">${m.vesselName}</strong><br>
                  <span style="color: #6b7280; font-size: 14px;">${startDate} a ${endDate}</span><br>
                  ${m.description ? `<span style="color: #6b7280; font-size: 14px;">${m.description}</span>` : ''}
                </li>
              `;
            }).join('')}
          </ul>
        ` : `
          <p style="color: #6b7280; font-style: italic; margin-top: 20px;">Nenhuma manutenção realizada este mês.</p>
        `}
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0;">
        
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Atenciosamente,<br>
          <strong>Sistema Exclusive Club</strong>
        </p>
      </div>
    </div>
  `;
  
  return { subject, html, stats: { totalBookings, usedBookings: usedBookings.length, occupationRate } };
}

async function main() {
  try {
    const { subject, html, stats } = await generateMonthlyReport();
    
    // Enviar para o admin (usar variável de ambiente)
    const adminEmail = process.env.ADMIN_EMAIL || 'paulovinicius92@hotmail.com';
    
    console.log(`[Monthly Report] Enviando relatório para ${adminEmail}...`);
    
    const success = await sendEmail({
      to: adminEmail,
      subject,
      html,
    });
    
    if (success) {
      console.log(`[Monthly Report] ✅ Relatório enviado com sucesso!`);
      console.log(`[Monthly Report] Estatísticas: ${stats.totalBookings} reservas, ${stats.usedBookings} utilizadas, ${stats.occupationRate}% ocupação`);
      process.exit(0);
    } else {
      console.error(`[Monthly Report] ❌ Falha ao enviar relatório`);
      process.exit(1);
    }
  } catch (error) {
    console.error("[Monthly Report] Erro fatal:", error);
    process.exit(1);
  }
}

main();
