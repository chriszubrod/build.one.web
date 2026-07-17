import { describe, it, expect } from "vitest";
import { filterProjectsBySearch } from "./projectListFilters";
import type { Project } from "../../types/api";

function project(
  overrides: Partial<Project> & Pick<Project, "id" | "public_id" | "name">,
): Project {
  return {
    row_version: "v1",
    created_datetime: null,
    modified_datetime: null,
    description: null,
    status: null,
    customer_id: null,
    abbreviation: null,
    notes: null,
    ...overrides,
  };
}

describe("filterProjectsBySearch", () => {
  const alpha = project({
    id: 1,
    public_id: "p-alpha",
    name: "Alpha Tower",
    abbreviation: "AT",
  });
  const beta = project({
    id: 2,
    public_id: "p-beta",
    name: "Beta Site",
    abbreviation: "BS",
  });
  const gamma = project({
    id: 3,
    public_id: "p-gamma",
    name: "Gamma Plaza",
    abbreviation: null,
  });
  const all = [alpha, beta, gamma];

  it("matches by name", () => {
    expect(filterProjectsBySearch(all, "tower")).toEqual([alpha]);
  });

  it("matches by abbreviation", () => {
    expect(filterProjectsBySearch(all, "BS")).toEqual([beta]);
  });

  it("is case-insensitive", () => {
    expect(filterProjectsBySearch(all, "beta")).toEqual([beta]);
    expect(filterProjectsBySearch(all, "bs")).toEqual([beta]);
  });

  it("trims the query", () => {
    expect(filterProjectsBySearch(all, "  alpha  ")).toEqual([alpha]);
  });

  it("handles null abbreviation without throwing", () => {
    expect(filterProjectsBySearch(all, "plaza")).toEqual([gamma]);
    expect(filterProjectsBySearch(all, "XX")).toEqual([]);
  });

  it("returns all projects for empty or whitespace query", () => {
    const emptyResult = filterProjectsBySearch(all, "");
    expect(emptyResult).toEqual(all);
    expect(emptyResult).not.toBe(all);

    const whitespaceResult = filterProjectsBySearch(all, "   ");
    expect(whitespaceResult).toEqual(all);
    expect(whitespaceResult).not.toBe(all);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterProjectsBySearch(all, "zzz")).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [alpha, beta];
    const before = input.map((p) => p.public_id);
    const result = filterProjectsBySearch(input, "alpha");
    expect(input.map((p) => p.public_id)).toEqual(before);
    expect(result).not.toBe(input);
  });
});
