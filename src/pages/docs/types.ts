/**
 * Shape of build.one.ios/docs/ios-manifest.json — produced by
 * build.one.ios/scripts/gen_docs_manifest.py and vendored into
 * src/docs/ios/. Keep in sync with that generator's output.
 */
export interface IosFreshness {
  class: string;
  live: boolean;
  source_commit: string | null;
  source_commit_date: string | null;
  source_branch: string | null;
  generated_at: string;
  note: string;
}

export interface IosApp {
  name: string;
  bundle_id: string;
  marketing_version: string | null;
  build: string | null;
  min_ios: string | null;
}

export interface IosArchitecture {
  pattern: string;
  networking: string;
  persistence: string;
  third_party_dependencies: number;
}

export interface IosEndpoint {
  name: string;
  method: string;
  path: string | null;
  file: string;
}

export interface IosCoreDataEntity {
  name: string;
  user_scoped: boolean;
}

export interface IosPrivacy {
  tracking: boolean;
  collected_data_types: string[];
  required_reason_apis: string[];
}

export interface IosCounts {
  features: number;
  services: number;
  endpoints: number;
  core_data_entities: number;
  user_scoped_entities: number;
}

export interface IosManifest {
  repo: string;
  freshness: IosFreshness;
  app: IosApp;
  architecture: IosArchitecture;
  features: string[];
  services: string[];
  endpoints: IosEndpoint[];
  core_data_entities: IosCoreDataEntity[];
  privacy: IosPrivacy;
  counts: IosCounts;
}
