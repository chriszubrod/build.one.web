## Distribution & release

The app ships through **TestFlight** (external Beta App Review) to field SMEs,
and to the App Store for production. It is a single Xcode target, **Build.One**,
iOS 17.0+, with no build scripts and no third-party dependencies.

### Versioning

Two numbers in `BuildOne.xcodeproj/project.pbxproj`, and they mean different
things:

- **`MARKETING_VERSION`** — the user-visible string (`0.1.0`, `1.0.0`).
  Bumping it triggers a fresh **Beta App Review** for external TestFlight.
- **`CURRENT_PROJECT_VERSION`** — the build number. Must always increment,
  never repeat. Bumping it alone (same marketing version) usually skips
  re-review for external testers.

Both must be bumped together for any new Archive upload, however small the
change. The current values are shown in the facts panel above.

> **Keep these docs honest:** the facts panel is regenerated from source by
> `scripts/gen_docs_manifest.py`. Run it on every version bump so the docs
> reflect the build you actually shipped — the snapshot age is shown in the
> freshness banner.

### App Store / TestFlight requirements

Because `GENERATE_INFOPLIST_FILE=NO`, `Info.plist` keys are set explicitly:
`CFBundlePackageType=APPL`, `CFBundleIconName=AppIcon`,
`ITSAppUsesNonExemptEncryption=false` (only HTTPS / Keychain / biometrics via
Apple OS APIs — skips the export-compliance prompt), plus the usage-description
keys for every permission the app invokes (`NSFaceIDUsageDescription`,
`NSLocationWhenInUseUsageDescription`).

The **app icon** is a single 1024×1024 PNG: sRGB, **no alpha channel** (the
App Store rejects transparency), no rounded corners (Apple applies the mask).

### Privacy manifest

`PrivacyInfo.xcprivacy` declares **no tracking** (`NSPrivacyTracking=false`),
the collected data types, and the required-reason API categories — all listed
live in the facts panel above, parsed straight from the manifest.

### Reviewer notes

External Beta App Review needs a working test account that lands on a tab with
**usable data** (not an empty `NoModulesView`) and can complete the core flow
end-to-end (clock in → create entry → sync). Field SMEs go external (any email);
only teammates needing App Store Connect access go internal.
