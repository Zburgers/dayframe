/** The Sites runtime supplies this virtual module at deployment time. */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
