import { useEffect, useRef, useState } from "react";
import { getOne, post, del, uploadFile, fetchViewAttachmentBlob, ApiError } from "../api/client";

interface AttachmentLink {
  public_id: string;
  attachment_id: number;
}

interface Attachment {
  public_id: string;
  original_filename: string;
  file_size: number;
  content_type: string;
}

interface LineItemAttachmentProps {
  /** The line item's public_id (must be saved first) */
  lineItemPublicId: string;
  /** Entity type — determines which endpoints to use */
  entityType: "bill" | "expense" | "invoice" | "bill_credit";
}

const UPLOAD_PATHS: Record<string, string> = {
  bill: "/api/v1/upload/bill-line-item-attachment",
  expense: "/api/v1/upload/attachment",
  invoice: "/api/v1/upload/attachment",
  bill_credit: "/api/v1/upload/attachment",
};

const LINK_CREATE_PATHS: Record<string, string> = {
  bill: "/api/v1/create/bill-line-item-attachment",
  expense: "/api/v1/create/expense-line-item-attachment",
  invoice: "/api/v1/create/invoice-line-item-attachment",
  bill_credit: "/api/v1/create/bill-credit-line-item-attachment",
};

const LINK_FETCH_PATHS: Record<string, string> = {
  bill: "/api/v1/get/bill-line-item-attachment/by-bill-line-item",
  expense: "/api/v1/get/expense-line-item-attachment/by-expense-line-item",
  invoice: "/api/v1/get/invoice-line-item-attachment/by-invoice-line-item",
  bill_credit: "/api/v1/get/bill-credit-line-item-attachment/by-line-item",
};

const LINK_DELETE_PREFIX: Record<string, string> = {
  bill: "/api/v1/delete/bill-line-item-attachment",
  expense: "/api/v1/delete/expense-line-item-attachment",
  invoice: "/api/v1/delete/invoice-line-item-attachment",
  bill_credit: "/api/v1/delete/bill-credit-line-item-attachment",
};

const FK_FIELD: Record<string, string> = {
  bill: "bill_line_item_public_id",
  expense: "expense_line_item_public_id",
  invoice: "invoice_line_item_public_id",
  bill_credit: "bill_credit_line_item_public_id",
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LineItemAttachment({ lineItemPublicId, entityType }: LineItemAttachmentProps) {
  const [link, setLink] = useState<AttachmentLink | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch existing link + attachment
  useEffect(() => {
    if (!lineItemPublicId) return;
    getOne<AttachmentLink>(`${LINK_FETCH_PATHS[entityType]}/${lineItemPublicId}`)
      .then((lnk) => {
        setLink(lnk);
        // Fetch attachment metadata
        return getOne<Attachment>(`/api/v1/get/attachment/id/${lnk.attachment_id}`);
      })
      .then((att) => setAttachment(att))
      .catch(() => {
        setLink(null);
        setAttachment(null);
      });
  }, [lineItemPublicId, entityType]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      // Step 1: Upload file
      const att = await uploadFile<Attachment>(UPLOAD_PATHS[entityType], file);

      // Step 2: Link to line item
      const lnk = await post<AttachmentLink>(LINK_CREATE_PATHS[entityType], {
        [FK_FIELD[entityType]]: lineItemPublicId,
        attachment_public_id: att.public_id,
      });

      setAttachment(att);
      setLink(lnk);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!link) return;
    try {
      await del(`${LINK_DELETE_PREFIX[entityType]}/${link.public_id}`);
      setLink(null);
      setAttachment(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleViewAttachment = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!attachment) return;
    setError("");
    try {
      const blob = await fetchViewAttachmentBlob(attachment.public_id);
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

  if (!lineItemPublicId) {
    return <span className="text-muted" style={{ fontSize: 11 }}>Save first</span>;
  }

  return (
    <span className="li-attachment">
      {error && <span className="field-error">{error}</span>}

      {attachment ? (
        <span className="li-att-info">
          <a
            href="#"
            className="li-att-link"
            title={`${attachment.original_filename} (${fmtSize(attachment.file_size)})`}
            onClick={handleViewAttachment}
          >
            {attachment.original_filename}
          </a>
          <button type="button" className="inline-li-remove" onClick={handleDelete} title="Remove attachment">&times;</button>
        </span>
      ) : (
        <label className="li-att-upload">
          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleUpload}
            disabled={uploading}
          />
          <span className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            {uploading ? "Uploading..." : "Attach"}
          </span>
        </label>
      )}
    </span>
  );
}
