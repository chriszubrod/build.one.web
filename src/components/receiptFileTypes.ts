const RECEIPT_IMAGE_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

const RECEIPT_IMAGE_EXTENSIONS = Object.keys(RECEIPT_IMAGE_TYPE_BY_EXT);
const RECEIPT_IMAGE_MIME_TYPES = [...new Set(Object.values(RECEIPT_IMAGE_TYPE_BY_EXT))];

export const RECEIPT_IMAGE_ACCEPT = [
  ...RECEIPT_IMAGE_MIME_TYPES,
  ...RECEIPT_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

/** Some browsers give HEIC/HEIF photos an empty type; the upload would then be stored
 *  as application/octet-stream and the server could not read it. Re-wrap with the type
 *  inferred from the extension. Files that already carry a type are returned as-is. */
export function withInferredReceiptType(file: File): File {
  if (file.type) return file;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const type = ext === "pdf" ? "application/pdf" : RECEIPT_IMAGE_TYPE_BY_EXT[ext];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

export function isReceiptImageFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (RECEIPT_IMAGE_MIME_TYPES.includes(t)) {
    return true;
  }
  const name = file.name.toLowerCase();
  return RECEIPT_IMAGE_EXTENSIONS.some((ext) => name.endsWith("." + ext));
}
