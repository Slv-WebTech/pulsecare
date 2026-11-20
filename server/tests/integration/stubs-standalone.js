// Run the fake Cloudinary + ai-service on their own (for manual / browser testing):
//   node tests/integration/stubs-standalone.js
import { startStubs } from "./stubs.js";

const s = await startStubs();
console.log("stubs listening: cloudinary https://127.0.0.1:5098, ai-service http://127.0.0.1:5097");
process.on("SIGINT", async () => { await s.close(); process.exit(0); });
