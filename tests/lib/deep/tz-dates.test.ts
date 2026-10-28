import { describe, it, expect } from "vitest";
/**
 * Time-zone sensitive date arithmetic. Every assertion here is what a hotel
 * expects regardless of the process TZ. Run with:
 *   TZ=UTC | Africa/Cairo | America/Los_Angeles | Pacific/Kiritimati
 * Failures that appear only under some TZ prove TZ-dependent code.
 */
import { calculateNights } from "@/lib/booking-engine";
import { getOccupancyReport } from "@/lib/reports-engine";
import { predict, type TrainedModel } from "@/lib/prediction-model";
import { createFakeSupabase } from "../../__mocks__/supabase-fake";

const TZ = process.env.TZ || "(unset)";

describe(`calculateNights under TZ=${TZ}`, () => {
  // Egypt DST 2026: starts Fri 24 Apr 00:00, ends Thu 29 Oct 24:00.
  it("counts 2 nights across Egypt's DST end (28 -> 30 Oct 2026)", () => {
    expect(calculateNights("2026-10-28", "2026-10-30")).toBe(2);
  });
  it("counts 3 nights across Egypt's DST end (27 -> 30 Oct 2026, the date used by the existing suite)", () => {
    expect(calculateNights("2026-10-27", "2026-10-30")).toBe(3);
  });
  it("counts 2 nights across US DST end (31 Oct -> 2 Nov 2026)", () => {
    expect(calculateNights("2026-10-31", "2026-11-02")).toBe(2);
  });
  it("counts 1 night for 29 -> 30 Oct 2026 (bookings route rejects nights <= 0)", () => {
    expect(calculateNights("2026-10-29", "2026-10-30")).toBe(1);
  });
  it("counts 1 night for 31 Oct -> 1 Nov 2026", () => {
    expect(calculateNights("2026-10-31", "2026-11-01")).toBe(1);
  });
  it("counts 7 nights across Egypt DST start (20 -> 27 Apr 2026)", () => {
    expect(calculateNights("2026-04-20", "2026-04-27")).toBe(7);
  });
});

describe(`reports-engine daily date series under TZ=${TZ}`, () => {
  const db = () => ({ apartments: [{ id: "a1", floor: 1, buildings: { name: "A" }, apartment_types: { name: "Studio" } }], bookings: [] });

  it("lists each date in 22..26 Apr 2026 exactly once (spans Egypt DST start)", async () => {
    const r = await getOccupancyReport(createFakeSupabase(db()), "2026-04-22", "2026-04-26");
    expect(r.daily.map((d) => d.date)).toEqual(["2026-04-22", "2026-04-23", "2026-04-24", "2026-04-25", "2026-04-26"]);
  });

  it("lists each date in 6..10 Mar 2026 exactly once (spans US DST start)", async () => {
    const r = await getOccupancyReport(createFakeSupabase(db()), "2026-03-06", "2026-03-10");
    expect(r.daily.map((d) => d.date)).toEqual(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
  });
});

describe(`prediction-model day-of-week under TZ=${TZ}`, () => {
  const model: TrainedModel = {
    trend_slope: 0, trend_intercept: 50, dow_coefficients: [0, 0, 0, 0, 0, 10, 20], avg_rate: 50,
    avg_rate_sensitivity: 0, momentum_weight: 0, residual_std: 5, training_samples: 10,
    training_date: "2026-10-01", training_start_date: "2026-09-01", total_apartments: 10,
    accuracy_mae: 0, accuracy_mape: 0, accuracy_rmse: 0, accuracy_r_squared: 0,
  };
  it("labels Friday 30 Oct 2026 as Friday and applies the Friday coefficient", () => {
    const p = predict(model, "2026-10-30");
    expect(p.day_of_week).toBe("Friday");
    expect(p.predicted_occupancy_pct).toBe(60);
  });
});
