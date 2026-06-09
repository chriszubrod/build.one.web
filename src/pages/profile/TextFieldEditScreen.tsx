import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOne, put } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import type { User } from "../../types/api";

const FIELD_LABELS: Record<string, { label: string; title: string; userField: keyof User }> = {
  firstname: { label: "First name", title: "First name", userField: "firstname" },
  lastname: { label: "Last name", title: "Last name", userField: "lastname" },
};

export default function TextFieldEditScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { fieldKey } = useParams<{ fieldKey: string }>();
  const { data: me } = useCurrentUser();
  const userPublicId = me?.user?.public_id;
  const config = fieldKey ? FIELD_LABELS[fieldKey] : undefined;

  const userQuery = useQuery<User>({
    queryKey: ["user", userPublicId],
    queryFn: () => getOne<User>(`/api/v1/get/user/${userPublicId}`),
    enabled: !!userPublicId,
  });

  const initial = config && userQuery.data ? (userQuery.data[config.userField] as string | null) ?? "" : "";
  const [value, setValue] = useState(initial);
  const initialRef = useRef(initial);

  useEffect(() => {
    if (userQuery.data && config) {
      const current = (userQuery.data[config.userField] as string | null) ?? "";
      setValue(current);
      initialRef.current = current;
    }
  }, [userQuery.data, config]);

  const handleBack = async () => {
    const trimmed = value.trim();
    if (config && userQuery.data && trimmed !== initialRef.current.trim()) {
      try {
        await put<User>(`/api/v1/update/user/${userPublicId}`, {
          row_version: userQuery.data.row_version,
          [config.userField]: trimmed,
        });
        queryClient.invalidateQueries({ queryKey: ["user", userPublicId] });
        queryClient.invalidateQueries({ queryKey: ["me"] });
      } catch (err) {
        console.error("Failed to save", err);
        alert("Save failed — please try again.");
        return;
      }
    }
    navigate("/profile/details");
  };

  if (!config) {
    return (
      <div className="ios-page">
        <NavHeader title="Edit" onBack={() => navigate("/profile/details")} />
        <div className="page-error">Unknown field.</div>
      </div>
    );
  }

  return (
    <div className="ios-page">
      <NavHeader title={config.title} onBack={handleBack} />
      <SectionCard>
        <Field
          label={config.label}
          value={value}
          onChange={setValue}
          autoFocus
        />
      </SectionCard>
    </div>
  );
}
