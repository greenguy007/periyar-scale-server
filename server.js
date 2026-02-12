const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT, path: "/ws" });

// Data storage
const historyFile = path.join(__dirname, "weight_history.json");
let weightHistory = [];

// Load existing history
if (fs.existsSync(historyFile)) {
  try {
    weightHistory = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    console.log(`Loaded ${weightHistory.length} history records`);
  } catch (err) {
    console.error("Error loading history:", err);
    weightHistory = [];
  }
}

// Save history periodically
function saveHistory() {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(weightHistory, null, 2));
  } catch (err) {
    console.error("Error saving history:", err);
  }
}

console.log("======================================");
console.log("  PERIYAR SCALE WEBSOCKET SERVER");
console.log("======================================");
console.log("WebSocket server running on port", PORT);
console.log("WebSocket path: /ws");
console.log("======================================\n");

wss.on("connection", (ws) => {
  const clientId = Date.now();
  console.log(`[${new Date().toISOString()}] Client connected (ID: ${clientId})`);
  console.log(`Active connections: ${wss.clients.size}`);

  // Send recent history to new client
  if (weightHistory.length > 0) {
    const recentHistory = weightHistory.slice(-100); // Last 100 readings
    ws.send(JSON.stringify({
      type: "history",
      data: recentHistory
    }));
  }

  ws.on("message", (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Received:`, message.toString());

    try {
      const data = JSON.parse(message.toString());
      
      // Add timestamp if not present
      if (!data.timestamp) {
        data.timestamp = Date.now();
      }
      
      // Add to history
      weightHistory.push({
        weight: data.weight,
        timestamp: data.timestamp,
        datetime: timestamp
      });

      // Keep only last 10,000 records
      if (weightHistory.length > 10000) {
        weightHistory = weightHistory.slice(-10000);
      }

      // Save every 10 records
      if (weightHistory.length % 10 === 0) {
        saveHistory();
      }

      // Broadcast to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "weight",
            data: data
          }));
        }
      });
    } catch (err) {
      console.error("Error processing message:", err);
      
      // If not JSON, broadcast as-is
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    }
  });

  ws.on("close", () => {
    console.log(`[${new Date().toISOString()}] Client disconnected (ID: ${clientId})`);
    console.log(`Active connections: ${wss.clients.size}`);
  });

  ws.on("error", (error) => {
    console.error(`[${new Date().toISOString()}] WebSocket error:`, error);
  });
});

// Save history on exit
process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  saveHistory();
  console.log("History saved. Goodbye!");
  process.exit(0);
});
