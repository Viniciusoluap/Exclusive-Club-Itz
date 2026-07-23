import { drizzle } from "drizzle-orm/mysql2";
import { allowedClients, clientQuotas, vessels } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { confirmDestructive } from "./_confirmDestructive.mjs";

await confirmDestructive("seed-clients.mjs (insere/atualiza clientes e cotas)");

const db = drizzle(process.env.DATABASE_URL);

const clientsData = [
  {
    name: "DIOGO BERTO",
    email: "diogodosberto@hotmail.com",
    phone: "+55 99981215020",
    quotas: [
      { vesselType: "lancha", quotaNumber: 2, quotaType: "half" },
      { vesselType: "jetski", quotaNumber: 1, quotaType: "half" },
    ]
  },
  {
    name: "DIOGO LEMOS",
    email: "diogobritolemos@gmail.com",
    phone: "+55 99984376932",
    quotas: [
      { vesselType: "jetski", quotaNumber: 2, quotaType: "half" },
      { vesselType: "lancha", quotaNumber: 2, quotaType: "half" },
    ]
  },
  {
    name: "EDILSON DA CONCEICAO",
    email: "motomais.acailandia@gmail.com",
    phone: "+55 99991640088",
    quotas: [
      { vesselType: "jetski", quotaNumber: 2, quotaType: "half" },
    ]
  },
  {
    name: "EMERSON SETUBAL",
    email: "emerson_setubal@hotmail.com",
    phone: "+55 99991735800",
    quotas: [
      { vesselType: "lancha", quotaNumber: 1, quotaType: "full" },
    ]
  },
  {
    name: "ERINALDO ALVES SILVA",
    email: "Erinaldo7717@gmail.com",
    phone: "+55 99981102372",
    quotas: [
      { vesselType: "jetski", quotaNumber: 3, quotaType: "half" },
    ]
  },
  {
    name: "ERISVALDO ALVES SILVA",
    email: "via.vips@hotmail.com",
    phone: "+55 99991234592",
    quotas: [
      { vesselType: "lancha", quotaNumber: 3, quotaType: "half" },
    ]
  },
  {
    name: "ERNANY",
    email: "ernanyoimp@gmail.com",
    phone: "+55 991979745",
    quotas: [
      { vesselType: "lancha", quotaNumber: 3, quotaType: "half" },
    ]
  },
  {
    name: "FILIPPE A V B MURTA",
    email: "filippeamurta@gmail.com",
    phone: "+55 99988020105",
    quotas: [
      { vesselType: "lancha", quotaNumber: 6, quotaType: "full" },
    ]
  },
  {
    name: "FRANCISCO CLAUDIO",
    email: "Franciscoclaudio293@gmail.com",
    phone: "+55 (99) 98487-9705",
    quotas: [
      { vesselType: "lancha", quotaNumber: 3, quotaType: "half" },
    ]
  },
  {
    name: "KAIO RICHARD",
    email: "Kaioaraujo2233@icloud.com",
    phone: "+55 99985027938",
    quotas: [
      { vesselType: "jetski", quotaNumber: 3, quotaType: "half" },
    ]
  },
  {
    name: "LAECIO SOUSA SILVA",
    email: "laecio.silversat@gmail.com",
    phone: "+55 99981018960",
    quotas: [
      { vesselType: "lancha", quotaNumber: 7, quotaType: "half" },
    ]
  },
  {
    name: "LUCIANO GABRIEL",
    email: "gabnercorporation@gmail.com",
    phone: "+55 (99) 99213-5289",
    quotas: [
      { vesselType: "jetski", quotaNumber: 6, quotaType: "half" },
    ]
  },
  {
    name: "MAHMED",
    email: "Mhamedfeiz@hotmail.com",
    phone: "+55 99981102160",
    quotas: [
      { vesselType: "lancha", quotaNumber: 5, quotaType: "full" },
    ]
  },
  {
    name: "MATEUS REHBEIN",
    email: "Teteu_rehbein@icloud.com",
    phone: "+55 99981446050",
    quotas: [
      { vesselType: "lancha", quotaNumber: 4, quotaType: "half" },
    ]
  },
  {
    name: "RONALDO BIANCHINI",
    email: "rbq1992@gmail.com",
    phone: "+55 99992135550",
    quotas: [
      { vesselType: "lancha", quotaNumber: 4, quotaType: "half" },
    ]
  },
  {
    name: "RODRIGO 'FAGNER'",
    email: "Rodrigosantana.14300@gmail.com",
    phone: "+55 99984081625",
    quotas: [
      { vesselType: "jetski", quotaNumber: 5, quotaType: "half" },
    ]
  },
];

async function seedClients() {
  console.log("🌱 Iniciando seed de clientes...");

  // Get vessels
  const allVessels = await db.select().from(vessels);
  const lanchaVessel = allVessels.find(v => v.type === "lancha");
  const jetskiVessel = allVessels.find(v => v.type === "jetski");

  if (!lanchaVessel || !jetskiVessel) {
    console.error("❌ Embarcações não encontradas no banco!");
    process.exit(1);
  }

  console.log(`✅ Lancha ID: ${lanchaVessel.id}`);
  console.log(`✅ Jetski ID: ${jetskiVessel.id}`);

  for (const clientData of clientsData) {
    console.log(`\n📝 Processando: ${clientData.name} (${clientData.email})`);

    // Check if client already exists
    const existing = await db.select().from(allowedClients).where(eq(allowedClients.email, clientData.email)).limit(1);
    
    let clientId;
    if (existing.length > 0) {
      console.log(`   ⚠️  Cliente já existe, atualizando...`);
      clientId = existing[0].id;
      
      // Update client info
      await db.update(allowedClients)
        .set({
          name: clientData.name,
          phone: clientData.phone,
          isActive: true,
        })
        .where(eq(allowedClients.id, clientId));
      
      // Delete existing quotas
      await db.delete(clientQuotas).where(eq(clientQuotas.clientId, clientId));
    } else {
      console.log(`   ✨ Criando novo cliente...`);
      
      // Create client
      const result = await db.insert(allowedClients).values({
        email: clientData.email,
        name: clientData.name,
        phone: clientData.phone,
        isActive: true,
      });
      
      // Get the created client ID
      const newClient = await db.select().from(allowedClients).where(eq(allowedClients.email, clientData.email)).limit(1);
      clientId = newClient[0].id;
    }

    // Create quotas
    for (const quota of clientData.quotas) {
      const vesselId = quota.vesselType === "lancha" ? lanchaVessel.id : jetskiVessel.id;
      
      await db.insert(clientQuotas).values({
        clientId,
        vesselId,
        quotaNumber: quota.quotaNumber,
        quotaType: quota.quotaType,
        isActive: true,
      });
      
      console.log(`   ✅ Cota criada: ${quota.vesselType} #${quota.quotaNumber} (${quota.quotaType === "full" ? "Inteira" : "Meia"})`);
    }
  }

  console.log("\n\n🎉 Seed concluído com sucesso!");
  console.log(`📊 Total de clientes processados: ${clientsData.length}`);
}

seedClients()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Erro ao executar seed:", error);
    process.exit(1);
  });
