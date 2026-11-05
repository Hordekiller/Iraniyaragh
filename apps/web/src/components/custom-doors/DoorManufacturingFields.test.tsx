import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DoorManufacturingFields } from "./DoorManufacturingFields";
import { emptyManufacturing, manufacturingEntry, readManufacturing } from "./manufacturing-entry";

const chosen = () => ({
  ...emptyManufacturing(),
  profileColor: "BRONZE" as const,
  handleSide: "LEFT" as const,
  hingeSide: "RIGHT" as const,
});
function Form() {
  const [value, setValue] = useState(emptyManufacturing());
  const [height, setHeight] = useState("2000");
  return (
    <>
      <label>
        ارتفاع آزمون
        <input
          value={height}
          onChange={(event) => setHeight(event.target.value)}
        />
      </label>
      <DoorManufacturingFields
        value={value}
        heightMm={Number(height)}
        onChange={setValue}
      />
    </>
  );
}
describe("door manufacturing fields", () => {
  it("offers four colors and handle directions; custom fields start blank with both reference edges", () => {
    render(<Form />);
    for (const label of ["مشکی", "سفید", "طلایی", "برنز"])
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    expect(
      screen.queryByLabelText("فاصلهٔ سوراخ ۱ (سانت)"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("حالت سوراخ‌کاری"), {
      target: { value: "CUSTOM" },
    });
    expect(screen.getByLabelText("فاصلهٔ سوراخ ۱ (سانت)")).toHaveValue("");
    expect(
      screen.getAllByText("حداکثر ۲۰۰ سانت (بیشتر از ارتفاع درب مجاز نیست)"),
    ).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("ارتفاع آزمون"), {
      target: { value: "1800" },
    });
    expect(
      screen.getAllByText("حداکثر ۱۸۰ سانت (بیشتر از ارتفاع درب مجاز نیست)"),
    ).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("مرجع سوراخ ۱"), {
      target: { value: "BOTTOM" },
    });
    expect(screen.getByLabelText("مرجع سوراخ ۱")).toHaveValue("BOTTOM");
  });
  it("converts Persian cm exactly to integer mm and preserves edit round trips", () => {
    const input = {
      ...chosen(),
      drillingMode: "CUSTOM" as const,
      holes: ["۱۲٫۵", "۷۱", "۱۲۹", "۱۸۸"].map((distance) => ({
        distance,
        reference: "TOP" as const,
      })),
    };
    const result = readManufacturing(input, 2000);
    expect(result.holes.map((hole) => hole.distanceMm)).toEqual([
      125, 710, 1290, 1880,
    ]);
    expect(readManufacturing(manufacturingEntry(result), 2000)).toEqual(result);
    expect(() => readManufacturing(input, 1800)).toThrow(/ارتفاع/);
  });
  it("rejects empty choices, incomplete distances, excess precision and duplicate physical positions", () => {
    expect(() => readManufacturing(emptyManufacturing(), 2000)).toThrow();
    for (const first of ["", "0", "-1", "201", "12.55"]) {
      expect(() =>
        readManufacturing(
          {
            ...chosen(),
            drillingMode: "CUSTOM",
            holes: [first, "71", "129", "188"].map((distance) => ({
              distance,
              reference: "TOP",
            })),
          },
          2000,
        ),
      ).toThrow();
    }
    const holes = [12, 71, 129, 188].map((distance) => ({
      distance: String(distance),
      reference: "TOP" as "TOP" | "BOTTOM",
    }));
    holes[3].reference = "BOTTOM";
    expect(() =>
      readManufacturing({ ...chosen(), drillingMode: "CUSTOM", holes }, 2000),
    ).toThrow(/یکسان/);
  });
  it("does not submit hidden custom holes when switching back to standard", () => {
    expect(readManufacturing(chosen(), 1000).holes).toEqual([]);
  });
});
