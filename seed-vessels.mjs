import { drizzle } from "drizzle-orm/mysql2";
import { vessels } from "./drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

async function seed() {
  console.log("Limpando embarcações existentes...");
  await db.delete(vessels);
  
  console.log("Inserindo embarcações reais...");
  await db.insert(vessels).values([
    {
      name: "JETSKI SEADOO GTI SE 130HP",
      type: "jetski",
      description: "O GTI SE é onde a diversão em família fica maior e melhor. Perfeito para aventuras aquáticas emocionantes.",
      capacity: 3,
      isActive: true,
    },
    {
      name: "Focker 215 150HP",
      type: "lancha",
      description: "A Focker 215 pode receber até 7 pessoas. O seu solarium tem capacidade para toda a família aproveitar momentos inesquecíveis.",
      capacity: 7,
      isActive: true,
    },
  ]);
  
  console.log("✅ Embarcações inseridas com sucesso!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Erro ao popular banco:", err);
  process.exit(1);
});
