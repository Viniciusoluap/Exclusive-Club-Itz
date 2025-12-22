import { relations } from "drizzle-orm/relations";
import { users, fuelPurchases } from "./schema";

export const fuelPurchasesRelations = relations(fuelPurchases, ({one}) => ({
	user: one(users, {
		fields: [fuelPurchases.purchasedBy],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	fuelPurchases: many(fuelPurchases),
}));