// ===================================
// Smart Waste Management System - Backend Server
// Node.js + Express + MySQL2
// ===================================

require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// ===================================
// Middleware Configuration
// ===================================
app.use(cors());
app.use(express.json());

// ===================================
// MySQL Database Connection Pool
// ===================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'simonaman',
  database: process.env.DB_NAME || 'waste_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ DB connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ DB connection failed:', error.message);
  }
})();

// ===================================
// UTILITY FUNCTIONS
// ===================================

// Calculate bin status color based on fill level
const getBinStatus = (currentLevel) => {
  if (currentLevel < 50) return 'Green';
  if (currentLevel >= 50 && currentLevel <= 80) return 'Yellow';
  return 'Red';
};

// Automatically generate alert if bin level >= 80%
const checkAndGenerateAlert = async (binId, currentLevel) => {
  if (currentLevel >= 80) {
    try {
      const [existingAlert] = await pool.query(
        'SELECT * FROM Alerts WHERE bin_id = ? AND status = "Pending" AND alert_type = "Full"',
        [binId]
      );

      // Only create alert if no pending "Full" alert exists
      if (existingAlert.length === 0) {
        await pool.query(
          'INSERT INTO Alerts (bin_id, alert_type, status) VALUES (?, "Full", "Pending")',
          [binId]
        );
        console.log(`🚨 Alert generated for Bin ${binId} (Level: ${currentLevel}%)`);
      }
    } catch (error) {
      console.error('Error generating alert:', error.message);
    }
  }
};

// ===================================
// API ENDPOINTS
// ===================================

// 1. GET /bins - Retrieve all bins with location and status
app.get('/bins', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.bin_id,
        b.bin_type,
        b.capacity,
        b.current_level,
        b.last_updated,
        l.location_id,
        l.location_name,
        l.building,
        l.floor
      FROM Bins b
      INNER JOIN Locations l ON b.location_id = l.location_id
      ORDER BY b.bin_id
    `);

    // Add status color to each bin
    const binsWithStatus = rows.map(bin => ({
      ...bin,
      status: getBinStatus(bin.current_level)
    }));

    res.json({
      success: true,
      count: binsWithStatus.length,
      data: binsWithStatus
    });
  } catch (error) {
    console.error('Error fetching bins:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bins',
      error: error.message
    });
  }
});

// 2. GET /alerts - Retrieve all alerts (latest first)
app.get('/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.alert_id,
        a.bin_id,
        a.alert_type,
        a.alert_time,
        a.status,
        b.bin_type,
        b.current_level,
        l.location_name,
        l.building,
        l.floor
      FROM Alerts a
      INNER JOIN Bins b ON a.bin_id = b.bin_id
      INNER JOIN Locations l ON b.location_id = l.location_id
      ORDER BY a.alert_time DESC
    `);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching alerts:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve alerts',
      error: error.message
    });
  }
});

// 3. PUT /alerts/:id - Resolve alert and empty bin
app.put('/alerts/:id', async (req, res) => {
  const alertId = req.params.id;

  try {
    // Get alert details first
    const [alert] = await pool.query(
      'SELECT bin_id FROM Alerts WHERE alert_id = ?',
      [alertId]
    );

    if (alert.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    const binId = alert[0].bin_id;

    // Update alert status to Resolved
    await pool.query(
      'UPDATE Alerts SET status = "Resolved" WHERE alert_id = ?',
      [alertId]
    );

    // Reset bin current_level to 0
    await pool.query(
      'UPDATE Bins SET current_level = 0, last_updated = NOW() WHERE bin_id = ?',
      [binId]
    );

    console.log(`✅ Alert ${alertId} resolved. Bin ${binId} emptied.`);

    res.json({
      success: true,
      message: 'Alert resolved and bin emptied',
      alert_id: alertId,
      bin_id: binId
    });
  } catch (error) {
    console.error('Error resolving alert:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve alert',
      error: error.message
    });
  }
});

// 4. POST /waste - Add new waste collection record
app.post('/waste', async (req, res) => {
  const { bin_id, collected_by, waste_weight } = req.body;

  // Validation
  if (!bin_id || !collected_by || !waste_weight) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: bin_id, collected_by, waste_weight'
    });
  }

  try {
    // Get bin capacity
    const [bin] = await pool.query(
      'SELECT capacity, current_level FROM Bins WHERE bin_id = ?',
      [bin_id]
    );

    if (bin.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bin not found'
      });
    }

    const capacity = bin[0].capacity;
    
    // Calculate new level based on weight (assuming weight in kg, capacity in kg)
    // Formula: new_level = (waste_weight / capacity) * 100
    const levelIncrease = (waste_weight / capacity) * 100;
    const newLevel = Math.min(100, Math.round(bin[0].current_level + levelIncrease));

    // Insert waste collection record
    const [result] = await pool.query(
      `INSERT INTO Waste_Collection (bin_id, collected_by, collection_date, waste_weight)
       VALUES (?, ?, CURDATE(), ?)`,
      [bin_id, collected_by, waste_weight]
    );

    // Update bin current_level
    await pool.query(
      'UPDATE Bins SET current_level = ?, last_updated = NOW() WHERE bin_id = ?',
      [newLevel, bin_id]
    );

    console.log(`📦 New waste record added: Bin ${bin_id}, Weight: ${waste_weight}kg, New Level: ${newLevel}%`);

    // Check if alert should be generated
    await checkAndGenerateAlert(bin_id, newLevel);

    res.json({
      success: true,
      message: 'Waste collection record added',
      collection_id: result.insertId,
      bin_id: bin_id,
      new_level: newLevel
    });
  } catch (error) {
    console.error('Error adding waste record:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to add waste collection record',
      error: error.message
    });
  }
});

// 5. GET /locations - Get all locations (for dropdown)
app.get('/locations', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        l.location_id,
        l.location_name,
        l.building,
        l.floor,
        COUNT(b.bin_id) as bin_count
      FROM Locations l
      LEFT JOIN Bins b ON l.location_id = b.location_id
      GROUP BY l.location_id
      ORDER BY l.location_name
    `);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching locations:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve locations',
      error: error.message
    });
  }
});

// 6. GET /staff - Get all staff members
app.get('/staff', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Staff ORDER BY name');

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('Error fetching staff:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve staff',
      error: error.message
    });
  }
});

// 7. GET /dashboard/stats - Get dashboard statistics
app.get('/dashboard/stats', async (req, res) => {
  try {
    const [binStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_bins,
        SUM(CASE WHEN current_level >= 80 THEN 1 ELSE 0 END) as full_bins,
        SUM(CASE WHEN current_level >= 50 AND current_level < 80 THEN 1 ELSE 0 END) as medium_bins,
        SUM(CASE WHEN current_level < 50 THEN 1 ELSE 0 END) as empty_bins,
        AVG(current_level) as avg_fill_level
      FROM Bins
    `);

    const [alertStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_alerts,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_alerts
      FROM Alerts
    `);

    const [recentCollections] = await pool.query(`
      SELECT COUNT(*) as today_collections
      FROM Waste_Collection
      WHERE collection_date = CURDATE()
    `);

    res.json({
      success: true,
      data: {
        bins: binStats[0],
        alerts: alertStats[0],
        collections: recentCollections[0]
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard statistics',
      error: error.message
    });
  }
});

// ===================================
// Root Endpoint
// ===================================
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Waste Management System API',
    version: '1.0.0',
    endpoints: {
      bins: 'GET /bins',
      alerts: 'GET /alerts',
      resolveAlert: 'PUT /alerts/:id',
      addWaste: 'POST /waste',
      locations: 'GET /locations',
      staff: 'GET /staff',
      stats: 'GET /dashboard/stats'
    }
  });
});

// ===================================
// Start Server
// ===================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});