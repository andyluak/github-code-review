import type { RepoRefs } from "@/types/review";

export type TargetControlsCommonProps = {
  repoRefs: RepoRefs | null;
  disabled: boolean;
};
