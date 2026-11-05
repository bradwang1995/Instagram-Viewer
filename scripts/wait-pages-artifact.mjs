// Pages discovers artifacts through an index that may lag a successful upload.
const {
  GITHUB_API_URL = "https://api.github.com",
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
  GH_TOKEN,
  PAGES_ARTIFACT_ID,
  PAGES_ARTIFACT_NAME,
} = process.env;
if (
  !GITHUB_REPOSITORY ||
  !GITHUB_RUN_ID ||
  !PAGES_ARTIFACT_ID ||
  !PAGES_ARTIFACT_NAME
)
  throw new Error("Missing Pages artifact identity");
const url = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100`;
for (let attempt = 0; attempt < 24; attempt++) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
    },
  });
  if (!response.ok)
    throw new Error(`Artifact lookup returned HTTP ${response.status}`);
  const { artifacts } = await response.json();
  if (
    artifacts.some(
      (artifact) =>
        String(artifact.id) === PAGES_ARTIFACT_ID &&
        artifact.name === PAGES_ARTIFACT_NAME &&
        !artifact.expired,
    )
  ) {
    console.log(`Pages artifact ${PAGES_ARTIFACT_ID} is indexed`);
    process.exit(0);
  }
  console.log("Waiting for Pages artifact indexing…");
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
throw new Error("Pages artifact was not indexed within two minutes");
