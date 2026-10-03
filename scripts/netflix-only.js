const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("data/streammarket.db");
db.exec("UPDATE services SET status = 'inactive' WHERE id != 'svc-netflix'");
const rows = db.prepare("SELECT name, status FROM services ORDER BY name").all();
rows.forEach((r) => console.log(r.status, r.name));
db.close();
