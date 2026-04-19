import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { rawRequest, post, del as apiDel } from "../../api/client";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import FolderPicker from "../../components/FolderPicker";
import type { Project } from "../../types/api";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

interface LinkedFolder {
  name: string;
  web_url: string;
  item_id: string;
  ms_drive_id: number;
}

interface LinkedExcel {
  name: string;
  web_url: string;
  worksheet_name: string;
  item_id: string;
  ms_drive_id: number;
}

interface ModuleFolder {
  name: string;
  web_url: string;
}

interface DriveInfo {
  public_id: string;
  name: string;
  drive_type: string;
}

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Project>(`/api/v1/get/project/${id}`);
  const [deleting, setDeleting] = useState(false);

  // SharePoint state
  const [linkedFolder, setLinkedFolder] = useState<LinkedFolder | null>(null);
  const [linkedExcel, setLinkedExcel] = useState<LinkedExcel | null>(null);
  const [moduleFolders, setModuleFolders] = useState<Record<string, ModuleFolder>>({});
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [modules, setModules] = useState<{ public_id: string; name: string }[]>([]);
  const [drivePublicId, setDrivePublicId] = useState<string | null>(null);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"project" | "module" | "excel">("project");
  const [pickerModuleId, setPickerModuleId] = useState<string | null>(null);
  const [pickerModuleName, setPickerModuleName] = useState("");

  // Load SharePoint data
  useEffect(() => {
    if (!item) return;
    const projectId = item.id;

    // Linked project folder — now standard: { data: {...} } or 404
    rawRequest<any>(`/api/v1/ms/sharepoint/driveitem/connector/project/${projectId}`)
      .then((res) => {
        const folder = res.data;
        setLinkedFolder(folder);
        // Look up drive public_id from the driveitem's ms_drive_id
        if (folder?.ms_drive_id) {
          rawRequest<any>(`/api/v1/ms/sharepoint/drive`)
            .then((driveRes) => {
              const driveList = driveRes.data ?? [];
              const drive = driveList.find((d: any) => d.id === folder.ms_drive_id);
              if (drive) setDrivePublicId(drive.public_id);
            })
            .catch(() => {});
        }
      })
      .catch(() => setLinkedFolder(null));

    // Module folders — now standard: { data: { moduleId: {...}, ... } }
    rawRequest<any>(`/api/v1/ms/sharepoint/driveitem/connector/project-module/${projectId}`)
      .then((res) => {
        const rawFolders = res.data || {};
        const parsed: Record<string, ModuleFolder> = {};
        for (const [publicId, folder] of Object.entries(rawFolders)) {
          const f = folder as any;
          parsed[publicId] = { name: f.name, web_url: f.web_url };
        }
        setModuleFolders(parsed);
      })
      .catch(() => setModuleFolders({}));

    // Linked Excel — now standard: { data: {...} } or 404
    rawRequest<any>(`/api/v1/ms/sharepoint/driveitem/connector/project-excel/${projectId}`)
      .then((res) => {
        setLinkedExcel(res.data ?? null);
      })
      .catch(() => setLinkedExcel(null));

    // Available drives — standard: { data: [...], count: N }
    rawRequest<any>(`/api/v1/ms/sharepoint/drive`)
      .then((res) => setDrives(res.data ?? []))
      .catch(() => setDrives([]));

    // Modules
    rawRequest<any>(`/api/v1/lookups?include=modules`)
      .then((res) => setModules(res.data?.modules ?? []))
      .catch(() => setModules([]));
  }, [item]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this project?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/project/${id}`);
      toast("Project deleted.");
      navigate("/project/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  const openPicker = (mode: "project" | "module" | "excel", moduleId?: string, moduleName?: string) => {
    setPickerMode(mode);
    setPickerModuleId(moduleId ?? null);
    setPickerModuleName(moduleName ?? "");
    setPickerOpen(true);
  };

  const handleLinkFolder = async (graphItemId: string, drivePublicIdSelected: string) => {
    try {
      await post("/api/v1/ms/sharepoint/driveitem/connector/project", {
        project_id: item.id,
        drive_public_id: drivePublicIdSelected,
        graph_item_id: graphItemId,
      });
      setPickerOpen(false);
      toast("Folder linked.");
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleUnlinkFolder = async () => {
    if (!confirm("Unlink this folder from the project?")) return;
    try {
      await apiDel(`/api/v1/ms/sharepoint/driveitem/connector/project/${item.id}`);
      toast("Folder unlinked.");
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleLinkModuleFolder = async (graphItemId: string) => {
    if (!pickerModuleId) return;
    try {
      await post("/api/v1/ms/sharepoint/driveitem/connector/project-module", {
        project_id: item.id,
        module_public_id: pickerModuleId,
        graph_item_id: graphItemId,
      });
      setPickerOpen(false);
      toast(`${pickerModuleName} folder linked.`);
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleUnlinkModuleFolder = async (moduleId: string, moduleName: string) => {
    if (!confirm(`Unlink the ${moduleName} folder?`)) return;
    try {
      await apiDel(`/api/v1/ms/sharepoint/driveitem/connector/project-module/${item.id}/${moduleId}`)
      // moduleId is now public_id
      toast(`${moduleName} folder unlinked.`);
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleLinkExcel = async (graphItemId: string, drivePublicIdSelected: string, worksheetName: string) => {
    try {
      await post("/api/v1/ms/sharepoint/driveitem/connector/project-excel", {
        project_id: item.id,
        drive_public_id: drivePublicIdSelected,
        graph_item_id: graphItemId,
        worksheet_name: worksheetName,
      });
      setPickerOpen(false);
      toast("Excel workbook linked.");
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleUnlinkExcel = async () => {
    if (!confirm("Unlink this Excel workbook?")) return;
    try {
      await apiDel(`/api/v1/ms/sharepoint/driveitem/connector/project-excel/${item.id}`);
      toast("Workbook unlinked.");
      window.location.reload();
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handlePickerSelect = (graphItemId: string, drivePublicIdSelected: string, worksheetName?: string) => {
    if (pickerMode === "project") {
      handleLinkFolder(graphItemId, drivePublicIdSelected);
    } else if (pickerMode === "module") {
      handleLinkModuleFolder(graphItemId);
    } else if (pickerMode === "excel" && worksheetName) {
      handleLinkExcel(graphItemId, drivePublicIdSelected, worksheetName);
    }
  };

  const activeModules = modules.filter((m) => ["Bills", "Expenses", "Invoices"].includes(m.name));

  return (
    <DetailView
      title={item.name}
      editPath={`/project/${id}/edit`}
      breadcrumbs={entityCrumbs("Projects", "/project/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Abbreviation", value: item.abbreviation },
        { label: "Status", value: item.status },
        { label: "Description", value: item.description },
        { label: "Public ID", value: <code>{item.public_id}</code> },
        { label: "Created", value: fmtDate(item.created_datetime) },
        { label: "Last Modified", value: fmtDate(item.modified_datetime) },
      ]}
    >
      {/* Project Folder */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">Project Folder</h3>
        {linkedFolder ? (
          <div className="detail-fields">
            <div className="detail-row">
              <dt>Folder Name</dt>
              <dd>{linkedFolder.name}</dd>
            </div>
            <div className="detail-row">
              <dt />
              <dd>
                <a href={linkedFolder.web_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  Open Folder
                </a>
              </dd>
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleUnlinkFolder}>Unlink Folder</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-muted" style={{ marginBottom: 12 }}>No folder linked to this project.</p>
            {drives.length > 0 ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openPicker("project")}>Link Folder</button>
            ) : (
              <p className="text-muted">No drives are linked. Link a drive to a company first.</p>
            )}
          </div>
        )}
      </div>

      {/* Module Folders */}
      {linkedFolder && activeModules.length > 0 && (
        <div className="detail-card" style={{ marginTop: 16 }}>
          <h3 className="line-items-heading">Module Folders</h3>
          {activeModules.map((mod) => {
            const mf = moduleFolders[mod.public_id];
            return (
              <div key={mod.public_id} style={{ borderBottom: "1px solid var(--color-border)", padding: "12px 0" }}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>{mod.name}</div>
                {mf ? (
                  <div>
                    <div className="text-muted" style={{ fontSize: 13, marginBottom: 4 }}>Folder: {mf.name}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a href={mf.web_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        Open Folder
                      </a>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleUnlinkModuleFolder(mod.public_id, mod.name)}>
                        Unlink
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openPicker("module", mod.public_id, mod.name)}>
                    Link {mod.name} Folder
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Excel Workbook */}
      <div className="detail-card" style={{ marginTop: 16 }}>
        <h3 className="line-items-heading">Excel Workbook</h3>
        {linkedExcel ? (
          <div className="detail-fields">
            <div className="detail-row">
              <dt>Workbook</dt>
              <dd>{linkedExcel.name}</dd>
            </div>
            <div className="detail-row">
              <dt>Worksheet</dt>
              <dd>{linkedExcel.worksheet_name}</dd>
            </div>
            <div className="detail-row">
              <dt />
              <dd>
                <a href={linkedExcel.web_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                  Open Workbook
                </a>
              </dd>
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-danger btn-sm" onClick={handleUnlinkExcel}>Unlink Workbook</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-muted" style={{ marginBottom: 12 }}>No Excel workbook linked to this project.</p>
            {drives.length > 0 ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openPicker("excel")}>Link Excel Workbook</button>
            ) : (
              <p className="text-muted">No drives are linked. Link a drive to a company first.</p>
            )}
          </div>
        )}
      </div>

      <InlineContacts parentEntity="project" parentId={item.id} readOnly />

      {/* Folder/Excel Picker */}
      <FolderPicker
        open={pickerOpen}
        mode={pickerMode}
        drives={drives}
        rootItemId={linkedFolder?.item_id ?? null}
        rootDrivePublicId={drivePublicId}
        moduleName={pickerModuleName}
        onSelect={handlePickerSelect}
        onClose={() => setPickerOpen(false)}
      />
    </DetailView>
  );
}
