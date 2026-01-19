const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

// ✅ API
app.get("/api/hello", (req, res) => {
  const name = req.query.name || "toi";
  res.json({ message: `Bonjour, ${name} !` });
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
