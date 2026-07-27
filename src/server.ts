import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { searchAllSites } from "./search.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/search", async (req, res) => {
  const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
  if (!term) {
    res.status(400).json({ error: "Query parameter 'term' is required." });
    return;
  }

  const result = await searchAllSites(term);
  res.json(result);
});

app.listen(config.port, () => {
  console.log(`price-checker listening on http://localhost:${config.port}`);
});
