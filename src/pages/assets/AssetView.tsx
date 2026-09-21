import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import {
  getOne,
  uploadFile,
  fetchViewAttachmentBlob,
  ApiError,
} from "../../api/client";
import {
  fetchAsset,
  fetchAssetFinancingNotes,
  fetchAssetAttachments,
  deleteAsset,
  deleteAssetAttachment,
  createAssetAttachment,
  assetKeys,
  fmtAssetMoney,
  displayNetBookValue,
  ASSET_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  assetStatusBadgeClass,
  ASSETS_MODULE,
} from "../../api/asset";
import { hasModulePermission } from "../../shared/permissions";
import type { AssetFinancingNote, AssetAttachment } from "../../types/api";

interface AttachmentMeta {
  public_id: string;
  original_filename: string;
  file_size: number;
  content_type: string;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("en-US");
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetAttachmentsPanel({
  assetPublicId,
  canAttach,
  canDelete,
}: {
  assetPublicId: string;
  canAttach: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [metaByLinkId, setMetaByLinkId] = useState<Record<string, AttachmentMeta>>({});

  const attachmentsQ = useQuery({
    queryKey: assetKeys.attachments(assetPublicId),
    queryFn: () => fetchAssetAttachments(assetPublicId),
    enabled: !!assetPublicId,
  });

  const links = attachmentsQ.data ?? [];
  const linksKey = links.map((l) => `${l.public_id}:${l.attachment_id}`).join("|");

  useEffect(() => {
    let cancelled = false;
    if (links.length === 0) {
      setMetaByLinkId({});
      return;
    }
    Promise.all(
      links.map(async (link) => {
        const att = await getOne<AttachmentMeta>(
          `/api/v1/get/attachment/id/${link.attachment_id}`,
        );
        return { linkId: link.public_id, att };
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, AttachmentMeta> = {};
        rows.forEach(({ linkId, att }) => {
          next[linkId] = att;
        });
        setMetaByLinkId(next);
      })
      .catch(() => {
        if (!cancelled) setMetaByLinkId({});
      });
    return () => {
      cancelled = true;
    };
  }, [linksKey, links]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF attachments are supported.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setError("");
    try {
      const att = await uploadFile<AttachmentMeta>("/api/v1/upload/attachment", file);
      await createAssetAttachment({
        asset_public_id: assetPublicId,
        attachment_public_id: att.public_id,
      });
      await queryClient.invalidateQueries({
        queryKey: assetKeys.attachments(assetPublicId),
      });
      toast("Document attached.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach document.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleView = async (attachmentPublicId: string) => {
    setError("");
    try {
      const blob = await fetchViewAttachmentBlob(attachmentPublicId);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        URL.revokeObjectURL(url);
        setError("Pop-up blocked — allow pop-ups to view the attachment.");
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Could not open attachment.";
      setError(msg);
    }
  };

  const handleRemove = async (link: AssetAttachment) => {
    if (!confirm("Remove this document from the asset?")) return;
    try {
      await deleteAssetAttachment(link.public_id);
      await queryClient.invalidateQueries({
        queryKey: assetKeys.attachments(assetPublicId),
      });
      toast("Document removed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to remove document.", "error");
    }
  };

  return (
    <div className="detail-card" style={{ marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>Documents</h2>
      {error && <div className="form-error">{error}</div>}
      {attachmentsQ.isLoading && <p className="text-muted">Loading documents…</p>}
      {!attachmentsQ.isLoading && links.length === 0 && (
        <p className="text-muted">No documents attached.</p>
      )}
      <ul className="detail-list" style={{ listStyle: "none", padding: 0 }}>
        {links.map((link) => {
          const meta = metaByLinkId[link.public_id];
          return (
            <li key={link.public_id} style={{ marginBottom: 8 }}>
              {meta ? (
                <span className="li-att-info">
                  <a
                    href="#"
                    className="li-att-link"
                    title={`${meta.original_filename} (${fmtSize(meta.file_size)})`}
                    onClick={(e) => {
                      e.preventDefault();
                      void handleView(meta.public_id);
                    }}
                  >
                    {meta.original_filename}
                  </a>
                  {canDelete && (
                    <button
                      type="button"
                      className="inline-li-remove"
                      onClick={() => void handleRemove(link)}
                      title="Remove attachment"
                    >
                      &times;
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-muted">Loading…</span>
              )}
            </li>
          );
        })}
      </ul>
      {canAttach && (
        <label className="li-att-upload">
          <input
            type="file"
            accept=".pdf,application/pdf"
            style={{ display: "none" }}
            onChange={handleUpload}
            disabled={uploading}
          />
          <span className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            {uploading ? "Uploading…" : "Attach PDF"}
          </span>
        </label>
      )}
    </div>
  );
}

export default function AssetView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();

  const canCreate = hasModulePermission(me, ASSETS_MODULE, "can_create");
  const canDelete = hasModulePermission(me, ASSETS_MODULE, "can_delete");

  const id = publicId!;

  const assetQ = useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => fetchAsset(id),
    enabled: !!publicId,
  });

  const notesQ = useQuery({
    queryKey: assetKeys.financingNotes(id),
    queryFn: () => fetchAssetFinancingNotes(id),
    enabled: !!publicId,
  });

  const [deleting, setDeleting] = useState(false);

  if (assetQ.isLoading) return <div className="page-loading">Loading…</div>;
  if (assetQ.error)
    return (
      <div className="page-error">
        {assetQ.error instanceof Error ? assetQ.error.message : "Failed to load asset."}
      </div>
    );

  const asset = assetQ.data;
  if (!asset) return <div className="page-error">Asset not found.</div>;

  const notes = notesQ.data ?? [];
  const nbv = displayNetBookValue(
    asset.fixed_asset_account_balance,
    asset.accum_dep_account_balance,
  );

  const handleDelete = async () => {
    if (!confirm("Delete this asset from the register?")) return;
    setDeleting(true);
    try {
      await deleteAsset(id);
      queryClient.invalidateQueries({ queryKey: assetKeys.list });
      queryClient.removeQueries({ queryKey: assetKeys.detail(id) });
      toast("Asset deleted.");
      navigate("/asset/list");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete asset.", "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={asset.name}
      editPath={`/asset/${id}/edit`}
      breadcrumbs={entityCrumbs("Assets", "/asset/list", asset.name)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
          { label: "Type", value: ASSET_TYPE_LABELS[asset.asset_type] ?? asset.asset_type },
          { label: "Make", value: asset.make?.trim() ? asset.make : "—" },
          { label: "Model", value: asset.model?.trim() ? asset.model : "—" },
          {
            label: "Model year",
            value: asset.model_year != null ? String(asset.model_year) : "—",
          },
          {
            label: "Serial / VIN",
            value: asset.serial_number?.trim() ? asset.serial_number : "—",
          },
          {
            label: "Status",
            value: (
              <span className={`status-badge ${assetStatusBadgeClass(asset.status)}`}>
                {ASSET_STATUS_LABELS[asset.status] ?? asset.status}
              </span>
            ),
          },
          { label: "Acquisition date", value: fmtDate(asset.acquisition_date) },
          { label: "Disposal date", value: fmtDate(asset.disposal_date) },
          {
            label: "QBO fixed-asset account",
            value: asset.qbo_fixed_asset_account_id
              ? `${asset.fixed_asset_account_name ?? "Account"} (${asset.qbo_fixed_asset_account_id})`
              : "—",
          },
          {
            label: "QBO accum. depreciation account",
            value: asset.qbo_accum_dep_account_id
              ? `${asset.accum_dep_account_name ?? "Account"} (${asset.qbo_accum_dep_account_id})`
              : "—",
          },
        ]}
    >
      <div style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Live QBO balances</h2>
        <p className="text-muted" style={{ marginTop: 0 }}>
          Figures refresh from QuickBooks on each load — not stored on the asset row.
        </p>
        <dl className="detail-fields">
          <div className="detail-row">
            <dt>Cost (fixed asset)</dt>
            <dd className="num">{fmtAssetMoney(asset.fixed_asset_account_balance)}</dd>
          </div>
          <div className="detail-row">
            <dt>Accumulated depreciation</dt>
            <dd className="num">{fmtAssetMoney(asset.accum_dep_account_balance)}</dd>
          </div>
          <div className="detail-row">
            <dt>Net book value</dt>
            <dd className="num">{nbv != null ? fmtAssetMoney(nbv) : "—"}</dd>
          </div>
        </dl>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Financing notes</h2>
        {notesQ.isLoading && <p className="text-muted">Loading…</p>}
        {!notesQ.isLoading && notes.length === 0 && (
          <p className="text-muted">No financing notes linked.</p>
        )}
        {notes.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>QBO liability account ID</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n: AssetFinancingNote) => (
                <tr key={n.public_id}>
                  <td>{n.qbo_liability_account_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AssetAttachmentsPanel
        assetPublicId={id}
        canAttach={canCreate}
        canDelete={canDelete}
      />
    </DetailView>
  );
}
