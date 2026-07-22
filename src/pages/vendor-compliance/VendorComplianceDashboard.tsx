import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Folder, RefreshCw } from "lucide-react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, fetchWithRefresh, getOne, put } from "../../api/client";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import type {
  BusinessLicense,
  CertificateOfInsurance,
  ComplianceDocumentType,
  ComplianceVerificationStatus,
  ContractorsLicense,
  CoverageEntry,
  Vendor,
  VendorComplianceDashboard as VendorComplianceDashboardData,
  VendorComplianceRosterEntry,
  VendorComplianceSlot,
  VendorComplianceSuggestion,
} from "../../types/api";
import {
  coverageLabel,
  expiryHint,
  SLOT_LABELS,
  SLOT_ORDER,
  validityClass,
  validityLabel,
} from "./vendorComplianceLogic";
import UploadDocumentSheet from "./UploadDocumentSheet";
import PolicyManagerSheet from "./PolicyManagerSheet";
import CertificateOfInsuranceSheet from "./CertificateOfInsuranceSheet";
import VendorFolderSheet from "./VendorFolderSheet";

export const DASHBOARD_QUERY_KEY = ["vendor-compliance", "dashboard"] as const;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const VERIFY_ENTITY_SEGMENT: Record<
  Extract<
    ComplianceDocumentType,
    "BUSINESS_LICENSE" | "CONTRACTORS_LICENSE" | "CERTIFICATE_OF_INSURANCE"
  >,
  string
> = {
  BUSINESS_LICENSE: "business-license",
  CONTRACTORS_LICENSE: "contractors-license",
  CERTIFICATE_OF_INSURANCE: "certificate-of-insurance",
};

type UploadSheetTarget = {
  vendorPublicId: string;
  initialDocumentType?: "BUSINESS_LICENSE" | "CONTRACTORS_LICENSE";
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}

async function openPdfBlob(path: string) {
  // Read the token INSIDE the init factory so a 401 refresh-retry re-reads the
  // refreshed token instead of resending the stale one.
  const res = await fetchWithRefresh(`${API_BASE}${path}`, () => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return { method: "GET", headers, credentials: "include" };
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to load PDF");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    throw new ApiError(0, "Popup blocked — allow popups to view the PDF");
  }
  // Revoke after a delay so the opened tab has time to load it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function setTrackCompliance(vendorPublicId: string, track: boolean) {
  const v = await getOne<Vendor>(`/api/v1/get/vendor/${vendorPublicId}`);
  await put(`/api/v1/update/vendor/${vendorPublicId}`, {
    row_version: v.row_version,
    name: v.name,
    abbreviation: v.abbreviation,
    notes: v.notes,
    track_compliance: track,
  });
}

function coiHasCoverages(slot: VendorComplianceSlot): boolean {
  return slot.coverages != null && Object.keys(slot.coverages).length > 0;
}

function coverageExpiryText(entry: CoverageEntry): string {
  if (entry.status === "missing") return "";
  const hint = expiryHint(entry.days_until_expiry);
  if (entry.expiry_date) {
    return hint ? `${fmtDate(entry.expiry_date)} (${hint})` : fmtDate(entry.expiry_date);
  }
  return hint;
}

function CoverageRow({ entry }: { entry: CoverageEntry }) {
  const metaParts: string[] = [];
  const expiry = coverageExpiryText(entry);
  if (expiry) metaParts.push(expiry);
  if (entry.carrier) metaParts.push(entry.carrier);

  return (
    <li className="vendor-compliance-coverage-row">
      <span className="vendor-compliance-coverage-name">
        {coverageLabel(entry.coverage_type)}
      </span>
      <span
        className={`compliance-badge compliance-badge--${validityClass(entry.status)}`}
      >
        {validityLabel(entry.status)}
      </span>
      {metaParts.length > 0 && (
        <span className="vendor-compliance-coverage-meta">{metaParts.join(" · ")}</span>
      )}
    </li>
  );
}

function slotSecondaryText(slotKey: string, slot: VendorComplianceSlot): string {
  if (slotKey === "W9" || slot.status === "missing") return "";

  if (slotKey === "CERTIFICATE_OF_INSURANCE" && coiHasCoverages(slot)) return "";

  const parts: string[] = [];
  if (slot.document_number) parts.push(slot.document_number);
  if (slot.issuing_authority) parts.push(slot.issuing_authority);

  if (slot.expiry_date) {
    const hint = expiryHint(slot.days_until_expiry);
    parts.push(hint ? `${fmtDate(slot.expiry_date)} (${hint})` : fmtDate(slot.expiry_date));
  }

  if (slotKey === "CERTIFICATE_OF_INSURANCE" && slot.policy_count != null) {
    parts.push(`${slot.policy_count} polic${slot.policy_count === 1 ? "y" : "ies"}`);
  }

  return parts.join(" · ");
}

export default function VendorComplianceDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<UploadSheetTarget | null>(null);
  const [coiFor, setCoiFor] = useState<{ vendorPublicId: string } | null>(null);
  const [policiesFor, setPoliciesFor] = useState<{
    docPublicId: string;
    label: string;
  } | null>(null);
  const [folderFor, setFolderFor] = useState<{
    vendorPublicId: string;
    vendorName: string;
  } | null>(null);

  const dashboardQuery = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () =>
      getOne<VendorComplianceDashboardData>("/api/v1/get/vendor-compliance/dashboard"),
  });

  const refreshDashboard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY });
  }, [queryClient]);

  const handleGeneratePacket = async (vendorPublicId: string) => {
    const key = `packet:${vendorPublicId}`;
    setBusyKey(key);
    try {
      await openPdfBlob(`/api/v1/generate/vendor-compliance/${vendorPublicId}/packet`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to generate packet";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleViewDocument = async (attachmentPublicId: string) => {
    const key = `view:${attachmentPublicId}`;
    setBusyKey(key);
    try {
      await openPdfBlob(`/api/v1/view/attachment/${attachmentPublicId}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load document";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUnflag = async (vendorPublicId: string) => {
    const key = `unflag:${vendorPublicId}`;
    setBusyKey(key);
    try {
      await setTrackCompliance(vendorPublicId, false);
      toast("Vendor removed from compliance tracking", "success");
      refreshDashboard();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to unflag vendor";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleTrack = async (vendorPublicId: string) => {
    const key = `track:${vendorPublicId}`;
    setBusyKey(key);
    try {
      await setTrackCompliance(vendorPublicId, true);
      toast("Vendor added to compliance tracking", "success");
      refreshDashboard();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to track vendor";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const handleVerifyChange = async (
    documentType: ComplianceDocumentType,
    documentPublicId: string,
    verificationStatus: ComplianceVerificationStatus,
  ) => {
    const key = `verify:${documentPublicId}`;
    setBusyKey(key);
    try {
      const seg = VERIFY_ENTITY_SEGMENT[documentType as keyof typeof VERIFY_ENTITY_SEGMENT];
      if (!seg) {
        throw new ApiError(0, "Verification is not supported for this document type");
      }
      type VerifyDoc = BusinessLicense | ContractorsLicense | CertificateOfInsurance;
      const doc = await getOne<VerifyDoc>(`/api/v1/get/${seg}/${documentPublicId}`);
      await put(`/api/v1/update/${seg}/${documentPublicId}`, {
        row_version: doc.row_version,
        verification_status: verificationStatus,
      });
      toast("Verification updated", "success");
      refreshDashboard();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to update verification";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const loading = dashboardQuery.isLoading;
  const error =
    dashboardQuery.error instanceof Error ? dashboardQuery.error.message : null;
  const roster = dashboardQuery.data?.roster ?? [];
  const suggestions = dashboardQuery.data?.suggestions ?? [];

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page vendor-compliance-page">
      <PageHeader title="Vendor Compliance" count={roster.length}>
        {me?.is_admin && (
          <Link
            to="/vendor-compliance/required-coverages"
            className="btn btn-secondary btn-sm"
          >
            Required coverages
          </Link>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={refreshDashboard}
          disabled={dashboardQuery.isFetching}
        >
          <RefreshCw size={14} aria-hidden />
          Refresh
        </button>
      </PageHeader>

      {roster.map((entry) => (
        <RosterCard
          key={entry.vendor_public_id}
          entry={entry}
          busyKey={busyKey}
          onGeneratePacket={() => void handleGeneratePacket(entry.vendor_public_id)}
          onUnflag={() => void handleUnflag(entry.vendor_public_id)}
          onViewDocument={(attachmentPublicId) => void handleViewDocument(attachmentPublicId)}
          onAddDocument={() =>
            setUploadFor({ vendorPublicId: entry.vendor_public_id })
          }
          onAddSlotDocument={(slotKey) => {
            if (slotKey === "CERTIFICATE_OF_INSURANCE") {
              setCoiFor({ vendorPublicId: entry.vendor_public_id });
              return;
            }
            setUploadFor({
              vendorPublicId: entry.vendor_public_id,
              initialDocumentType: slotKey as "BUSINESS_LICENSE" | "CONTRACTORS_LICENSE",
            });
          }}
          onManagePolicies={(docPublicId) =>
            setPoliciesFor({ docPublicId, label: entry.vendor_name })
          }
          onVerifyChange={(documentType, documentPublicId, verificationStatus) =>
            void handleVerifyChange(documentType, documentPublicId, verificationStatus)
          }
          onOpenFolder={() =>
            setFolderFor({
              vendorPublicId: entry.vendor_public_id,
              vendorName: entry.vendor_name,
            })
          }
        />
      ))}

      <SuggestionsCard
        suggestions={suggestions}
        busyKey={busyKey}
        onTrack={(vendorPublicId) => void handleTrack(vendorPublicId)}
      />

      {uploadFor && (
        <UploadDocumentSheet
          vendorPublicId={uploadFor.vendorPublicId}
          initialDocumentType={uploadFor.initialDocumentType}
          onClose={() => setUploadFor(null)}
          onSaved={refreshDashboard}
        />
      )}
      {coiFor && (
        <CertificateOfInsuranceSheet
          vendorPublicId={coiFor.vendorPublicId}
          onClose={() => setCoiFor(null)}
          onSaved={refreshDashboard}
        />
      )}
      {policiesFor && (
        <PolicyManagerSheet
          certificatePublicId={policiesFor.docPublicId}
          coiLabel={policiesFor.label}
          onClose={() => setPoliciesFor(null)}
          onChanged={refreshDashboard}
        />
      )}
      {folderFor && (
        <VendorFolderSheet
          vendorPublicId={folderFor.vendorPublicId}
          vendorName={folderFor.vendorName}
          isOpen
          onClose={() => setFolderFor(null)}
          onChanged={refreshDashboard}
        />
      )}
    </div>
  );
}

interface RosterCardProps {
  entry: VendorComplianceRosterEntry;
  busyKey: string | null;
  onGeneratePacket: () => void;
  onUnflag: () => void;
  onViewDocument: (attachmentPublicId: string) => void;
  onAddDocument: () => void;
  onAddSlotDocument: (slotKey: string) => void;
  onManagePolicies: (docPublicId: string) => void;
  onVerifyChange: (
    documentType: ComplianceDocumentType,
    documentPublicId: string,
    verificationStatus: ComplianceVerificationStatus,
  ) => void;
  onOpenFolder: () => void;
}

function RosterCard({
  entry,
  busyKey,
  onGeneratePacket,
  onUnflag,
  onViewDocument,
  onAddDocument,
  onAddSlotDocument,
  onManagePolicies,
  onVerifyChange,
  onOpenFolder,
}: RosterCardProps) {
  const vendorLabel = entry.vendor_abbreviation
    ? `${entry.vendor_name} (${entry.vendor_abbreviation})`
    : entry.vendor_name;
  const packetBusy = busyKey === `packet:${entry.vendor_public_id}`;
  const unflagBusy = busyKey === `unflag:${entry.vendor_public_id}`;

  return (
    <SectionCard
      header={
        <div className="vendor-compliance-card-header">
          <span>{vendorLabel}</span>
          <div className="vendor-compliance-card-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={packetBusy || unflagBusy}
              onClick={onOpenFolder}
            >
              <Folder size={14} aria-hidden />
              Folder
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={packetBusy || unflagBusy}
              onClick={onAddDocument}
            >
              Add document
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={packetBusy || unflagBusy}
              onClick={onGeneratePacket}
            >
              {packetBusy ? "Generating…" : "Generate packet"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={packetBusy || unflagBusy}
              onClick={onUnflag}
            >
              {unflagBusy ? "Saving…" : "Unflag"}
            </button>
          </div>
        </div>
      }
    >
      <ul className="vendor-compliance-slots">
        {SLOT_ORDER.map((slotKey) => {
          const slot = entry.slots[slotKey] ?? { status: "missing" };
          const secondary = slotSecondaryText(slotKey, slot);
          const viewBusy = slot.attachment_public_id
            ? busyKey === `view:${slot.attachment_public_id}`
            : false;
          const verifyBusy = slot.document_public_id
            ? busyKey === `verify:${slot.document_public_id}`
            : false;
          const showView =
            slotKey !== "W9" && Boolean(slot.attachment_public_id);
          const showManagePolicies =
            slotKey === "CERTIFICATE_OF_INSURANCE" &&
            slot.status !== "missing" &&
            Boolean(slot.document_public_id);
          const showVerification =
            slotKey !== "W9" &&
            slot.status !== "missing" &&
            slot.verification_status;
          const showAddSlot =
            slotKey === "BUSINESS_LICENSE" ||
            slotKey === "CONTRACTORS_LICENSE" ||
            slotKey === "CERTIFICATE_OF_INSURANCE";
          const slotMissing = slot.status === "missing";
          const verifyDocumentType = slotKey as ComplianceDocumentType;
          const coiBreakdown =
            slotKey === "CERTIFICATE_OF_INSURANCE" && coiHasCoverages(slot);

          return (
            <li key={slotKey} className="vendor-compliance-slot">
              {coiBreakdown ? (
                <>
                  <div className="vendor-compliance-slot-main">
                    <span className="vendor-compliance-slot-label">
                      {SLOT_LABELS[slotKey]}
                    </span>
                    <span
                      className={`compliance-badge compliance-badge--${validityClass(slot.status)}`}
                    >
                      {validityLabel(slot.status)}
                    </span>
                    <span
                      className={`vendor-compliance-compliant vendor-compliance-compliant--${slot.compliant ? "yes" : "no"}`}
                    >
                      {slot.compliant ? "Compliant" : "Not compliant"}
                    </span>
                  </div>
                  <ul className="vendor-compliance-coverage-list">
                    {Object.entries(slot.coverages!).map(([key, entry]) => (
                      <CoverageRow key={key} entry={entry} />
                    ))}
                  </ul>
                  {slot.extra_coverages != null && slot.extra_coverages.length > 0 && (
                    <>
                      <p className="vendor-compliance-coverage-extra-label">Also on file</p>
                      <ul className="vendor-compliance-coverage-list">
                        {slot.extra_coverages.map((entry) => (
                          <CoverageRow
                            key={`extra-${entry.coverage_type}`}
                            entry={entry}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="vendor-compliance-slot-main">
                    <span className="vendor-compliance-slot-label">{SLOT_LABELS[slotKey]}</span>
                    <span
                      className={`compliance-badge compliance-badge--${validityClass(slot.status)}`}
                    >
                      {validityLabel(slot.status)}
                    </span>
                  </div>
                  {secondary && (
                    <p className="vendor-compliance-slot-secondary">{secondary}</p>
                  )}
                </>
              )}
              {showVerification && (
                <p className="vendor-compliance-slot-verification">
                  Verification:
                  <select
                    className="form-select"
                    value={slot.verification_status ?? "Received"}
                    disabled={verifyBusy}
                    onChange={(e) =>
                      onVerifyChange(
                        verifyDocumentType,
                        slot.document_public_id!,
                        e.target.value as ComplianceVerificationStatus,
                      )
                    }
                  >
                    <option value="Received">Received</option>
                    <option value="Verified">Verified</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </p>
              )}
              {showAddSlot && slotMissing && slotKey === "CERTIFICATE_OF_INSURANCE" && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onAddSlotDocument(slotKey)}
                >
                  Add
                </button>
              )}
              {showAddSlot &&
                slotMissing &&
                (slotKey === "BUSINESS_LICENSE" || slotKey === "CONTRACTORS_LICENSE") && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onAddSlotDocument(slotKey)}
                  >
                    Add
                  </button>
                )}
              {showManagePolicies && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={verifyBusy}
                  onClick={() => onManagePolicies(slot.document_public_id!)}
                >
                  Manage policies
                </button>
              )}
              {showView && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={viewBusy}
                  onClick={() => onViewDocument(slot.attachment_public_id!)}
                >
                  {viewBusy ? "Loading…" : "View"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

interface SuggestionsCardProps {
  suggestions: VendorComplianceSuggestion[];
  busyKey: string | null;
  onTrack: (vendorPublicId: string) => void;
}

function SuggestionsCard({ suggestions, busyKey, onTrack }: SuggestionsCardProps) {
  return (
    <SectionCard header="Suggested (Tradesman, not yet tracked)">
      {suggestions.length === 0 ? (
        <p className="vendor-compliance-muted">None</p>
      ) : (
        <ul className="vendor-compliance-suggestions">
          {suggestions.map((s) => {
            const trackBusy = busyKey === `track:${s.vendor_public_id}`;
            return (
              <li key={s.vendor_public_id} className="vendor-compliance-suggestion">
                <span>
                  {s.vendor_name}
                  <span className="vendor-compliance-muted"> · {s.vendor_type}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={trackBusy}
                  onClick={() => onTrack(s.vendor_public_id)}
                >
                  {trackBusy ? "Saving…" : "Track"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
