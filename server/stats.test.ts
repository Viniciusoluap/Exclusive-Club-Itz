import { describe, expect, it } from "vitest";
import { getClientStats, getAdminStats } from "./stats";

describe("Statistics", () => {
  describe("getClientStats", () => {
    it("should return client statistics structure", async () => {
      // Test with a non-existent email to verify structure
      const stats = await getClientStats("test@example.com");
      
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("totalBookings");
      expect(stats).toHaveProperty("upcomingBookings");
      expect(stats).toHaveProperty("completedBookings");
      expect(stats).toHaveProperty("cancelledBookings");
      expect(stats).toHaveProperty("favoriteVessel");
      expect(stats).toHaveProperty("monthlyUsage");
      
      expect(typeof stats.totalBookings).toBe("number");
      expect(typeof stats.upcomingBookings).toBe("number");
      expect(typeof stats.completedBookings).toBe("number");
      expect(typeof stats.cancelledBookings).toBe("number");
      expect(Array.isArray(stats.monthlyUsage)).toBe(true);
      expect(stats.monthlyUsage.length).toBe(6); // 6 months
    });

    it("should return monthly usage with correct structure", async () => {
      const stats = await getClientStats("test@example.com");
      
      stats.monthlyUsage.forEach(month => {
        expect(month).toHaveProperty("month");
        expect(month).toHaveProperty("count");
        expect(typeof month.month).toBe("string");
        expect(typeof month.count).toBe("number");
      });
    });
  });

  describe("getAdminStats", () => {
    it("should return admin statistics structure", async () => {
      const stats = await getAdminStats();
      
      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("totalBookings");
      expect(stats).toHaveProperty("totalClients");
      expect(stats).toHaveProperty("totalVessels");
      expect(stats).toHaveProperty("upcomingBookings");
      expect(stats).toHaveProperty("occupancyRate");
      expect(stats).toHaveProperty("topClients");
      
      expect(typeof stats.totalBookings).toBe("number");
      expect(typeof stats.totalClients).toBe("number");
      expect(typeof stats.totalVessels).toBe("number");
      expect(typeof stats.upcomingBookings).toBe("number");
      expect(Array.isArray(stats.occupancyRate)).toBe(true);
      expect(Array.isArray(stats.topClients)).toBe(true);
    });

    it("should return occupancy rate with correct structure", async () => {
      const stats = await getAdminStats();
      
      stats.occupancyRate.forEach(vessel => {
        expect(vessel).toHaveProperty("vesselName");
        expect(vessel).toHaveProperty("rate");
        expect(typeof vessel.vesselName).toBe("string");
        expect(typeof vessel.rate).toBe("number");
        expect(vessel.rate).toBeGreaterThanOrEqual(0);
        expect(vessel.rate).toBeLessThanOrEqual(100);
      });
    });

    it("should return top clients with correct structure", async () => {
      const stats = await getAdminStats();
      
      expect(stats.topClients.length).toBeLessThanOrEqual(5); // Top 5
      
      stats.topClients.forEach(client => {
        expect(client).toHaveProperty("clientName");
        expect(client).toHaveProperty("bookingCount");
        expect(typeof client.clientName).toBe("string");
        expect(typeof client.bookingCount).toBe("number");
        expect(client.bookingCount).toBeGreaterThan(0);
      });
    });

    it("should return top clients sorted by booking count", async () => {
      const stats = await getAdminStats();
      
      for (let i = 0; i < stats.topClients.length - 1; i++) {
        expect(stats.topClients[i].bookingCount).toBeGreaterThanOrEqual(
          stats.topClients[i + 1].bookingCount
        );
      }
    });
  });
});
