import { hostingerFetch } from "./hostinger-api-client.mjs";

const data = await hostingerFetch("/api/hosting/v1/websites");
console.log(JSON.stringify(data, null, 2));
