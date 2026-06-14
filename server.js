const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const root = __dirname;
const port = Number(process.env.PORT || 4175);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendAiConfig(res) {
  const config = {
    provider: process.env.AI_PROVIDER || "groq",
    apiKey: process.env.MY_KEY || process.env.GROQ_API_KEY || "",
    model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
  };
  send(
    res,
    200,
    `window.JB_AI_CONFIG = ${JSON.stringify(config)};\n`,
    "text/javascript; charset=utf-8",
  );
}

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

const server = http.createServer((req, res) => {
  if (req.url === "/config.local.js") {
    sendAiConfig(res);
    return;
  }

  const filePath = resolveStaticPath(req.url || "/");
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, types[path.extname(filePath)] || "application/octet-stream");
  });
});

server.listen(port, () => {
  console.log(`JB Pacemaker running at http://127.0.0.1:${port}/`);
  console.log(`AI key loaded: ${process.env.MY_KEY || process.env.GROQ_API_KEY ? "yes" : "no"}`);
});
