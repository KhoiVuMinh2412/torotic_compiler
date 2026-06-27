const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { v4: uuidv4 } = require("crypto");
const { SerialPort } = require("serialport"); // Kéo thư viện lên trên cùng

const app = express();
app.use(cors());
app.use(express.json());

const FQBN = "arduino:avr:nano";

// ==========================================
// API 0: Đường dẫn gốc (Health Check)
// ==========================================
app.get("/", (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h1 style="color: #2ed573;">Torotic Backend Server đang hoạt động! 🚀</h1>
        <p>Truy cập <b><a href="/ports">/ports</a></b> để xem danh sách cổng USB.</p>
      </body>
    </html>
  `);
});

// ==========================================
// API 1: Lấy danh sách cổng USB (Đã thêm bộ lọc sạch rác)
// ==========================================
app.get("/ports", async (req, res) => {
  try {
    const ports = await SerialPort.list();

    // Lọc bỏ các cổng ttyS hệ thống, chỉ giữ lại USB/ACM (Linux) hoặc COM (Windows)
    const validPorts = ports.filter((p) => {
      return (
        p.path.includes("USB") ||
        p.path.includes("ACM") ||
        p.path.includes("COM")
      );
    });

    const portList = validPorts.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || "Unknown Device",
    }));

    res.json({ success: true, ports: portList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API 2: Nhận code từ Web IDE và Biên dịch
// ==========================================
app.post("/compile", async (req, res) => {
  const cppCode = req.body.code;

  if (!cppCode) {
    return res.status(400).json({ error: "Không tìm thấy mã nguồn." });
  }

  const sketchName = `torotic_${Date.now()}`;
  const sketchDir = path.join(__dirname, "temp", sketchName);
  const sketchPath = path.join(sketchDir, `${sketchName}.ino`);
  const buildDir = path.join(sketchDir, "build");

  try {
    fs.mkdirSync(sketchDir, { recursive: true });
    fs.writeFileSync(sketchPath, cppCode);

    const compileCommand = `arduino-cli compile --fqbn ${FQBN} --output-dir "${buildDir}" "${sketchDir}"`;

    exec(compileCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi biên dịch: ${stderr}`);
        fs.rmSync(sketchDir, { recursive: true, force: true });
        return res
          .status(500)
          .json({ error: "Biên dịch thất bại", details: stderr });
      }

      const hexFilePath = path.join(buildDir, `${sketchName}.ino.hex`);

      if (fs.existsSync(hexFilePath)) {
        const hexData = fs.readFileSync(hexFilePath, "utf8");
        fs.rmSync(sketchDir, { recursive: true, force: true });
        res.status(200).json({ success: true, hex: hexData });
      } else {
        fs.rmSync(sketchDir, { recursive: true, force: true });
        res
          .status(500)
          .json({ error: "Không tìm thấy file .hex sau khi biên dịch." });
      }
    });
  } catch (err) {
    if (fs.existsSync(sketchDir)) {
      fs.rmSync(sketchDir, { recursive: true, force: true });
    }
    res
      .status(500)
      .json({ error: "Lỗi hệ thống server", details: err.message });
  }
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Torotic Compiler Server đang chạy tại http://localhost:${PORT}`);
});
