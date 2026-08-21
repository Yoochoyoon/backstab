import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { cleanupExpiredRooms } from "./rooms.js";
import { registerSocketHandlers } from "./socketHandlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "..", "public");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(publicDir));
app.get("/", (_req, res) => res.redirect("/host"));
app.get("/player", (_req, res) => res.sendFile(path.join(publicDir, "player.html")));
app.get("/host", (_req, res) => res.sendFile(path.join(publicDir, "host.html")));

registerSocketHandlers(io);

// 끝났거나 버려진 방을 주기적으로 치운다. 방/세션이 메모리에만 있어서
// 이게 없으면 프로세스가 살아있는 내내 쌓이기만 한다.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const removed = cleanupExpiredRooms();
  if (removed.length > 0) {
    console.log(`오래된 방 ${removed.length}개 정리: ${removed.join(", ")}`);
  }
}, CLEANUP_INTERVAL_MS);
// 청소 타이머 때문에 프로세스가 종료되지 못하는 일이 없게 한다.
cleanupTimer.unref();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`Backstab 서버 실행 중: http://localhost:${PORT}`);
});
