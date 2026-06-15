/**
 * Target caterer for public lead form submissions (`POST /api/leads`).
 * Set `LEAD_INTAKE_CATERER_ID` to the real caterer row id — not a placeholder intake account.
 */
export async function getIntakeCatererId(): Promise<string> {
  const id = process.env.LEAD_INTAKE_CATERER_ID?.trim();
  if (!id) {
    throw new Error(
      "LEAD_INTAKE_CATERER_ID is not set. " +
        "Set it to your caterer ID from the database (see apps/api/.env.example)."
    );
  }
  return id;
}
