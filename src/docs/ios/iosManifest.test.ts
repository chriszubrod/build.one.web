import { describe, it, expect } from "vitest";
import { iosManifest } from "../../pages/docs/iosManifest";

describe("ios-manifest freshness tripwire (U-091)", () => {
  it("freshness.class is derived", () => {
    expect(iosManifest.freshness.class).toBe("derived");
  });

  it("counts match inventory lengths", () => {
    expect(iosManifest.counts.features).toBe(iosManifest.features.length);
    expect(iosManifest.counts.services).toBe(iosManifest.services.length);
    expect(iosManifest.counts.endpoints).toBe(iosManifest.endpoints.length);
    expect(iosManifest.counts.core_data_entities).toBe(iosManifest.core_data_entities.length);
  });

  it("user_scoped_entities count matches entities flagged user_scoped", () => {
    expect(iosManifest.counts.user_scoped_entities).toBe(
      iosManifest.core_data_entities.filter((e) => e.user_scoped).length,
    );
  });
});
