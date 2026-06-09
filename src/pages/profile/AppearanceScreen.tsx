import { useNavigate } from "react-router-dom";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";

export default function AppearanceScreen() {
  const navigate = useNavigate();

  return (
    <div className="ios-page">
      <NavHeader title="Appearance" onBack={() => navigate("/profile")} />
      <SectionCard
        header="Theme"
        footer="Dark mode is on the roadmap; web is light-only for now."
      >
        <ListRow title="Light" selected />
      </SectionCard>
    </div>
  );
}
