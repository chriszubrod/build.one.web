import { useState } from "react";
import { post } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";

interface ChangePasswordSheetProps {
  open: boolean;
  onDismiss: () => void;
}

const MIN_LEN = 8;

export default function ChangePasswordSheet({ open, onDismiss }: ChangePasswordSheetProps) {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirmPw("");
  };

  const valid =
    current.length > 0 &&
    next.length >= MIN_LEN &&
    next === confirmPw;

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await post("/api/v1/mobile/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast("Password updated", "success");
      reset();
      onDismiss();
    } catch (err) {
      console.error("Change password failed", err);
      toast(err instanceof Error ? err.message : "Could not change password", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (current || next || confirmPw) {
      if (!confirm("Discard changes?")) return;
    }
    reset();
    onDismiss();
  };

  return (
    <Sheet open={open} onDismiss={handleCancel}>
      <SheetHeader
        title="Change password"
        onCancel={handleCancel}
        onSave={handleSave}
        saveDisabled={!valid || saving}
      />
      <div className="sheet-body">
        <div className="sheet-hint">You'll be signed out of every other device.</div>
        <SectionCard>
          <Field
            label="Current password"
            type="password"
            value={current}
            onChange={setCurrent}
            placeholder="Current password"
            autoComplete="current-password"
            autoFocus
          />
          <Field
            label="New password"
            type="password"
            value={next}
            onChange={setNext}
            placeholder="New password"
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirmPw}
            onChange={setConfirmPw}
            placeholder="Type it again"
            autoComplete="new-password"
          />
        </SectionCard>
        <div className="sheet-hint">
          {next.length === 0
            ? `${MIN_LEN}+ characters; mix letters, numbers, and symbols.`
            : next.length < MIN_LEN
            ? `${MIN_LEN - next.length} more character${MIN_LEN - next.length === 1 ? "" : "s"} required.`
            : confirmPw.length > 0 && next !== confirmPw
            ? "Passwords don't match."
            : "Strong enough."}
        </div>
      </div>
    </Sheet>
  );
}
