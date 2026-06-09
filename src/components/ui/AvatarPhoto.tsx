interface AvatarPhotoProps {
  initials: string;
  size?: number;
  photoUrl?: string;
  showStatusDot?: boolean;
}

export default function AvatarPhoto({
  initials,
  size = 56,
  photoUrl,
  showStatusDot,
}: AvatarPhotoProps) {
  const fontSize = Math.round(size * 0.36);

  return (
    <div
      className="avatar-photo"
      style={{ width: size, height: size, fontSize }}
    >
      {photoUrl ? <img src={photoUrl} alt="" /> : initials.toUpperCase()}
      {showStatusDot && <span className="avatar-photo-status" />}
    </div>
  );
}
