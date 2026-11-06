// GET  /api/deer  -> gemt rækkefølge [{uid, name}]
// PUT  /api/deer  -> gem ny rækkefølge (kræver header x-setup-pin hvis SETUP_PIN er sat)
const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");

const TABLE = "rensdyr";
const KEY = { partitionKey: "post1", rowKey: "order" };

function table() {
  const cs = process.env.STORAGE_CONNECTION;
  return cs ? TableClient.fromConnectionString(cs, TABLE) : null;
}

app.http("deer", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "deer",
  handler: async (req, ctx) => {
    const tc = table();
    if (!tc) return { status: 500, jsonBody: { error: "STORAGE_CONNECTION er ikke sat i Azure" } };

    if (req.method === "GET") {
      try {
        const e = await tc.getEntity(KEY.partitionKey, KEY.rowKey);
        return { jsonBody: JSON.parse(e.data) };
      } catch (err) {
        if (err.statusCode === 404) return { jsonBody: [] };
        ctx.error(err);
        return { status: 500, jsonBody: { error: "Kunne ikke læse" } };
      }
    }

    const pin = process.env.SETUP_PIN;
    if (pin && req.headers.get("x-setup-pin") !== pin) return { status: 401, jsonBody: { error: "Forkert kode" } };

    let list;
    try { list = await req.json(); } catch { return { status: 400, jsonBody: { error: "Ugyldig JSON" } }; }
    if (!Array.isArray(list) || list.length > 50 ||
        !list.every(d => d && typeof d.uid === "string" && d.uid.length > 0 && d.uid.length < 64)) {
      return { status: 400, jsonBody: { error: "Ugyldig liste" } };
    }
    const clean = list.map((d, i) => ({ uid: d.uid.toLowerCase(), name: String(d.name || `Rensdyr ${i + 1}`).slice(0, 60) }));

    try {
      await tc.createTable().catch(() => {});   // findes den allerede, er det fint
      await tc.upsertEntity({ ...KEY, data: JSON.stringify(clean) }, "Replace");
      return { jsonBody: clean };
    } catch (err) {
      ctx.error(err);
      return { status: 500, jsonBody: { error: "Kunne ikke gemme" } };
    }
  },
});
