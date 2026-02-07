import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = parseInt(process.env.PORT || "3000", 10);

console.log(`🚀 CRM server starting on port ${port}`);

serve({
	fetch: app.fetch,
	port,
});

console.log(`✅ CRM server running at http://localhost:${port}`);
