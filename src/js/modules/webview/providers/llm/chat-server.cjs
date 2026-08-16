const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.LLM_PORT || 9876;
const HTML_PATH = path.join(__dirname, "public", "index.html");

const server = http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    fs.readFile(HTML_PATH, "utf8", (err, data) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`LLM chat server: http://127.0.0.1:${PORT}`);
});
