/**
 * Asset register API surface (U-490) — typed wrappers over the shared client
 * helpers plus react-query keys. Money from QBO joins is always a string on
 * the wire; never coerce stored figures through float.
 */
import { getOne, getList, post, put, del } from "./client";
import type { ModuleName } from "../shared/modules";
import { Modules } from "../shared/modules";
import type {
  Asset,
  AssetWithQbo,
  AssetFinancingNote,
  AssetAttachment,
  AssetAccountExclusion,
} from "../types/api";

/** RBAC module gating every asset surface; mirrors the API's `Modules.ASSETS`. */
export const ASSETS_MODULE: ModuleName = Modules.ASSETS;

/* ---- react-query keys -------------------------------------------------- */
export const assetKeys = {
  list: ["asset-list"] as const,
  detail: (publicId: string) => ["asset", publicId] as const,
  financingNotes: (assetPublicId: string) =>
    ["asset-financing-notes", assetPublicId] as const,
  attachments: (assetPublicId: string) =>
    ["asset-attachments", assetPublicId] as const,
  accountExclusions: ["asset-account-exclusions"] as const,
  divergenceCheck: ["asset-divergence-check"] as const,
};

/* ---- reads ------------------------------------------------------------- */
export async function fetchAssets(): Promise<Asset[]> {
  return (await getList<Asset>("/api/v1/get/assets")).data;
}

export function fetchAsset(publicId: string): Promise<AssetWithQbo> {
  return getOne<AssetWithQbo>(`/api/v1/get/asset/${publicId}`);
}

export async function fetchAssetFinancingNotes(
  assetPublicId: string,
): Promise<AssetFinancingNote[]> {
  return (
    await getList<AssetFinancingNote>(
      `/api/v1/get/asset-financing-notes/${assetPublicId}`,
    )
  ).data;
}

export async function fetchAssetAttachments(
  assetPublicId: string,
): Promise<AssetAttachment[]> {
  return (
    await getList<AssetAttachment>(
      `/api/v1/get/asset-attachments/${assetPublicId}`,
    )
  ).data;
}

export async function fetchAssetAccountExclusions(): Promise<
  AssetAccountExclusion[]
> {
  return (
    await getList<AssetAccountExclusion>("/api/v1/get/asset-account-exclusions")
  ).data;
}

export function fetchAssetDivergenceCheck(): Promise<Record<string, unknown>> {
  return getOne<Record<string, unknown>>("/api/v1/get/assets/divergence-check");
}

/* ---- mutations --------------------------------------------------------- */
export function createAsset(body: {
  name: string;
  asset_type: string;
  make?: string | null;
  model?: string | null;
  model_year?: number | null;
  serial_number?: string | null;
  status?: string;
  acquisition_date?: string | null;
  disposal_date?: string | null;
  qbo_fixed_asset_account_id?: string | null;
  qbo_accum_dep_account_id?: string | null;
}): Promise<Asset> {
  return post<Asset>("/api/v1/create/asset", body);
}

export function updateAsset(
  publicId: string,
  body: {
    row_version: string;
    name?: string | null;
    asset_type?: string | null;
    make?: string | null;
    model?: string | null;
    model_year?: number | null;
    serial_number?: string | null;
    status?: string | null;
    acquisition_date?: string | null;
    disposal_date?: string | null;
    qbo_fixed_asset_account_id?: string | null;
    qbo_accum_dep_account_id?: string | null;
  },
): Promise<Asset> {
  return put<Asset>(`/api/v1/update/asset/${publicId}`, body);
}

export function deleteAsset(publicId: string): Promise<unknown> {
  return del(`/api/v1/delete/asset/${publicId}`);
}

export function createAssetFinancingNote(body: {
  asset_public_id: string;
  qbo_liability_account_id: string;
}): Promise<AssetFinancingNote> {
  return post<AssetFinancingNote>("/api/v1/create/asset-financing-note", body);
}

export function deleteAssetFinancingNote(publicId: string): Promise<unknown> {
  return del(`/api/v1/delete/asset-financing-note/${publicId}`);
}

export function createAssetAccountExclusion(body: {
  qbo_account_id: string;
  reason: string;
}): Promise<AssetAccountExclusion> {
  return post<AssetAccountExclusion>(
    "/api/v1/create/asset-account-exclusion",
    body,
  );
}

export function deleteAssetAccountExclusion(publicId: string): Promise<unknown> {
  return del(`/api/v1/delete/asset-account-exclusion/${publicId}`);
}

export function createAssetAttachment(body: {
  asset_public_id: string;
  attachment_public_id: string;
}): Promise<AssetAttachment> {
  return post<AssetAttachment>("/api/v1/create/asset-attachment", body);
}

export function deleteAssetAttachment(publicId: string): Promise<unknown> {
  return del(`/api/v1/delete/asset-attachment/${publicId}`);
}

/* ---- display helpers --------------------------------------------------- */

/** Format QBO money for display. `"0"` is a real balance — never blank. */
export function fmtAssetMoney(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function moneyToCents(value: string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const hundredths = abs % 100;
  return `${sign}${dollars}.${String(hundredths).padStart(2, "0")}`;
}

/**
 * Display-only net book value from live QBO cost + accumulated depreciation.
 * Not persisted — recomputed at render from the detail payload.
 */
export function displayNetBookValue(
  cost: string | null | undefined,
  accumDep: string | null | undefined,
): string | null {
  if (cost == null && accumDep == null) return null;
  const cents = moneyToCents(cost) + moneyToCents(accumDep);
  return centsToAmount(cents);
}

export const ASSET_TYPE_LABELS: Record<string, string> = {
  vehicle: "Vehicle",
  machinery: "Machinery",
  equipment: "Equipment",
};

export const ASSET_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  disposed: "Disposed",
};

export function assetStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "active";
    case "disposed":
      return "declined";
    default:
      return "";
  }
}
