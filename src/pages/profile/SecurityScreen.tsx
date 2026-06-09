import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Smartphone } from "lucide-react";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import ChangePasswordSheet from "./ChangePasswordSheet";

export default function SecurityScreen() {
  const navigate = useNavigate();
  const [changeOpen, setChangeOpen] = useState(false);

  return (
    <div className="ios-page">
      <NavHeader title="Security" onBack={() => navigate("/profile")} />

      <SectionCard header="Sign-in">
        <ListRow
          icon={<KeyRound size={16} />}
          title="Change password"
          onClick={() => setChangeOpen(true)}
          trailing="chevron"
        />
      </SectionCard>

      <SectionCard header="Sessions">
        <ListRow
          icon={<Smartphone size={16} />}
          title="This device"
          subtitle="Active now"
        />
      </SectionCard>

      <ChangePasswordSheet open={changeOpen} onDismiss={() => setChangeOpen(false)} />
    </div>
  );
}
