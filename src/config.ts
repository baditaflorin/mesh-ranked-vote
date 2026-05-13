import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-ranked-vote",
  description:
    "Instant-runoff ranked-choice voting with round-by-round elimination, no account, mesh-synced",
  accentHex: "#a855f7",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
