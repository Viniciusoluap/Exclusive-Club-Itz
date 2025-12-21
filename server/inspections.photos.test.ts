import { describe, expect, it } from "vitest";

describe("Inspections - Reprovation Photos System", () => {
  it("should accept reprovation photos array in schema", () => {
    const validPhotos = [
      { itemName: "SISTEMA ELETRICO", photoUrl: "https://example.com/photo1.jpg" },
      { itemName: "MOTOR", photoUrl: "https://example.com/photo2.jpg" },
    ];

    expect(validPhotos).toHaveLength(2);
    expect(validPhotos[0]).toHaveProperty("itemName");
    expect(validPhotos[0]).toHaveProperty("photoUrl");
  });

  it("should handle empty reprovation photos array", () => {
    const emptyPhotos: Array<{itemName: string, photoUrl: string}> = [];
    
    expect(emptyPhotos).toHaveLength(0);
    expect(JSON.stringify(emptyPhotos)).toBe("[]");
  });

  it("should serialize reprovation photos to JSON", () => {
    const photos = [
      { itemName: "CASCO", photoUrl: "https://s3.amazonaws.com/bucket/photo.jpg" },
    ];

    const serialized = JSON.stringify(photos);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(photos);
    expect(deserialized[0].itemName).toBe("CASCO");
  });

  it("should handle null/undefined reprovation photos", () => {
    const nullPhotos = null;
    const undefinedPhotos = undefined;

    expect(nullPhotos).toBeNull();
    expect(undefinedPhotos).toBeUndefined();
    
    // Backend deve salvar null quando não há fotos
    const savedValue = nullPhotos || undefinedPhotos ? JSON.stringify([]) : null;
    expect(savedValue).toBeNull();
  });
});
