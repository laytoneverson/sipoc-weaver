/** Stable OU ids shared between seed data, sample workspace, and migrations. */
export const OU_IDS = {
  sales: "ou-sales",
  enrollment: "ou-enrollment",
  fulfillment: "ou-fulfillment",
  platform: "ou-platform",
  claims: "ou-claims",
  data: "ou-data",
} as const;

export const OWNER_TO_OU: Record<string, string> = {
  "Sales Ops": OU_IDS.sales,
  "Enrollment Ops": OU_IDS.enrollment,
  Fulfillment: OU_IDS.fulfillment,
  "Benefits Platform": OU_IDS.platform,
  "Claims Operations": OU_IDS.claims,
  "Data Engineering": OU_IDS.data,
};
