// Audit microservice: consumes every event from RabbitMQ, stores it in its own
// database (audit_db) and lets teachers read the latest entries.
const amqp = require("amqplib");
const express = require("express");
const mysql = require("mysql2/promise");

const EXCHANGE = "edupulse.events";
const QUEUE = "audit.log";
const port = process.env.PORT || 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pool;

async function initDb() {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: 5,
  });
  for (;;) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          event_type VARCHAR(64) NOT NULL,
          actor VARCHAR(255),
          payload JSON NOT NULL,
          occurred_at DATETIME(3) NOT NULL
        )`);
      console.log("Audit database ready");
      return;
    } catch (e) {
      console.error("Waiting for database:", e.message);
      await sleep(3000);
    }
  }
}

async function consume() {
  for (;;) {
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      conn.on("error", () => {});
      const closed = new Promise((r) => conn.on("close", r));
      const ch = await conn.createChannel();
      ch.on("error", () => {});
      await ch.assertExchange(EXCHANGE, "topic", { durable: true });
      await ch.assertQueue(QUEUE, { durable: true });
      await ch.bindQueue(QUEUE, EXCHANGE, "#");
      await ch.consume(QUEUE, async (msg) => {
        if (!msg) return;
        try {
          const e = JSON.parse(msg.content.toString());
          await pool.query(
            "INSERT INTO audit_log (event_type, actor, payload, occurred_at) VALUES (?, ?, ?, ?)",
            [e.type, e.actor || null, JSON.stringify(e), new Date(e.at)]
          );
          ch.ack(msg);
        } catch (err) {
          console.error("audit insert failed:", err.message);
          setTimeout(() => ch.nack(msg, false, true), 2000); // retry later
        }
      });
      console.log("Consuming events from RabbitMQ");
      await closed;
      console.error("RabbitMQ connection closed, reconnecting");
    } catch (e) {
      await sleep(3000);
    }
  }
}

const app = express();
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.get("/healthz", (req, res) => res.json({ status: "ok" }));

// nginx has already authenticated the caller and set X-User-Role.
app.get("/api/audit", async (req, res) => {
  if (req.get("X-User-Role") !== "teacher") {
    return res.status(403).json({ message: "Teachers only" });
  }
  try {
    const [rows] = await pool.query(
      "SELECT id, event_type, actor, payload, occurred_at FROM audit_log ORDER BY id DESC LIMIT 100"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Could not read audit log" });
  }
});

initDb().then(() => {
  consume();
  app.listen(port, () => console.log(`audit-service on :${port}`));
});
