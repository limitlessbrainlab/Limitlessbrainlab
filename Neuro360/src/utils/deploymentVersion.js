export function needsDeploymentReset(previousBuildId, currentBuildId) {
  return previousBuildId !== currentBuildId;
}
