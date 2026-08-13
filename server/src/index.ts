import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { registerSocketHandlers } from "./socketHandlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(publicDir));
app.get("/player", (_req, res) => res.sendFile(path.join(publicDir, "player.html")));
app.get("/tv", (_req, res) => res.sendFile(path.join(publicDir, "tv.html")));
app.get("/host", (_req, res) => res.sendFile(path.join(publicDir, "host.html")));

registerSocketHandlers(io);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`Backstab 서버 실행 중: http://localhost:${PORT}`);
});
