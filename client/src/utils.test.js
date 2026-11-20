import { describe, it, expect } from "vitest";
import { doctorSalutation, firstName, assistantFiltersToParams } from "./utils.js";

describe("doctorSalutation", () => {
  it("does not double the Dr prefix", () => {
    expect(doctorSalutation("Dr Dana Doc")).toBe("Dr. Dana Doc");
    expect(doctorSalutation("Dr. Ravi Kumar")).toBe("Dr. Ravi Kumar");
    expect(doctorSalutation("dr ravi")).toBe("Dr. ravi");
  });
  it("adds it when missing and survives empty input", () => {
    expect(doctorSalutation("Ravi Kumar")).toBe("Dr. Ravi Kumar");
    expect(doctorSalutation("")).toBe("Doctor");
    expect(doctorSalutation(undefined)).toBe("Doctor");
  });
});

describe("firstName", () => {
  it("returns the first word or a fallback", () => {
    expect(firstName("Uma UI")).toBe("Uma");
    expect(firstName("  ")).toBe("there");
  });
});

describe("assistantFiltersToParams", () => {
  it("keeps supported filters and coerces numbers", () => {
    expect(assistantFiltersToParams({ specialization: "Cardiologist", location: "Pune", maxFee: "500", minExperience: 5, language: "Hindi" })).toEqual({
      specialization: "Cardiologist", location: "Pune", maxFee: 500, minExperience: 5, language: "Hindi",
    });
  });
  it("drops unsupported, empty and non-numeric values", () => {
    expect(assistantFiltersToParams({ availableDay: "saturday", maxFee: "lots", specialization: "", location: null, minExperience: null })).toEqual({});
    expect(assistantFiltersToParams(undefined)).toEqual({});
  });
});
