-- ===================================
-- Smart Waste Management System
-- MySQL Database Schema & Seed Data
-- ===================================

-- Create Database
CREATE DATABASE IF NOT EXISTS waste_management;
USE waste_management;

-- ===================================
-- 1. Locations Table
-- ===================================
CREATE TABLE IF NOT EXISTS Locations (
  location_id INT PRIMARY KEY AUTO_INCREMENT,
  location_name VARCHAR(100) NOT NULL,
  building VARCHAR(100) NOT NULL,
  floor VARCHAR(50) NOT NULL
);

-- ===================================
-- 2. Bins Table
-- ===================================
CREATE TABLE IF NOT EXISTS Bins (
  bin_id INT PRIMARY KEY AUTO_INCREMENT,
  location_id INT NOT NULL,
  bin_type ENUM('Plastic', 'Organic', 'E-waste', 'General') NOT NULL,
  capacity INT NOT NULL,
  current_level INT DEFAULT 0 CHECK (current_level >= 0 AND current_level <= 100),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES Locations(location_id) ON DELETE CASCADE
);

-- ===================================
-- 3. Staff Table
-- ===================================
CREATE TABLE IF NOT EXISTS Staff (
  staff_id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  role ENUM('Collector', 'Supervisor') NOT NULL,
  contact_no VARCHAR(15) NOT NULL
);

-- ===================================
-- 4. Waste_Collection Table
-- ===================================
CREATE TABLE IF NOT EXISTS Waste_Collection (
  collection_id INT PRIMARY KEY AUTO_INCREMENT,
  bin_id INT NOT NULL,
  collected_by INT NOT NULL,
  collection_date DATE NOT NULL,
  waste_weight FLOAT NOT NULL,
  FOREIGN KEY (bin_id) REFERENCES Bins(bin_id) ON DELETE CASCADE,
  FOREIGN KEY (collected_by) REFERENCES Staff(staff_id) ON DELETE CASCADE
);

-- ===================================
-- 5. Alerts Table
-- ===================================
CREATE TABLE IF NOT EXISTS Alerts (
  alert_id INT PRIMARY KEY AUTO_INCREMENT,
  bin_id INT NOT NULL,
  alert_type ENUM('Full', 'Overflow', 'Damage') NOT NULL,
  alert_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('Pending', 'Resolved') DEFAULT 'Pending',
  FOREIGN KEY (bin_id) REFERENCES Bins(bin_id) ON DELETE CASCADE
);

-- ===================================
-- SEED DATA
-- ===================================

-- Insert 6 Locations (University Areas)
INSERT INTO Locations (location_name, building, floor) VALUES
('CSE Block', 'Computer Science Building', 'Ground Floor'),
('Library', 'Central Library', 'First Floor'),
('Hostel', 'Boys Hostel Block A', 'Ground Floor'),
('Admin Block', 'Administration Building', 'Ground Floor'),
('Mechanical Dept', 'Mechanical Engineering Block', 'Second Floor'),
('Canteen', 'Student Canteen', 'Ground Floor');

-- Insert 6 Bins (One for each location)
INSERT INTO Bins (location_id, bin_type, capacity, current_level) VALUES
(1, 'Plastic', 50, 45),      -- CSE Block - Yellow zone
(2, 'Organic', 60, 85),       -- Library - Red zone (will trigger alert)
(3, 'General', 55, 30),       -- Hostel - Green zone
(4, 'E-waste', 40, 90),       -- Admin Block - Red zone (will trigger alert)
(5, 'Plastic', 50, 65),       -- Mechanical Dept - Yellow zone
(6, 'Organic', 70, 20);       -- Canteen - Green zone

-- Insert 3 Staff Members
INSERT INTO Staff (name, role, contact_no) VALUES
('Rajesh Kumar', 'Collector', '9876543210'),
('Priya Sharma', 'Collector', '9876543211'),
('Anil Verma', 'Supervisor', '9876543212');

-- Insert Sample Waste Collection Records
INSERT INTO Waste_Collection (bin_id, collected_by, collection_date, waste_weight) VALUES
(1, 1, '2025-11-08', 15.5),
(2, 2, '2025-11-08', 20.0),
(3, 1, '2025-11-07', 12.3),
(5, 2, '2025-11-07', 18.7),
(6, 1, '2025-11-06', 25.0);

-- Insert Sample Alerts (For bins with level >= 80%)
INSERT INTO Alerts (bin_id, alert_type, status) VALUES
(2, 'Full', 'Pending'),      -- Library bin at 85%
(4, 'Full', 'Pending');      -- Admin Block bin at 90%

-- ===================================
-- VERIFICATION QUERIES
-- ===================================

-- View all bins with their locations
SELECT 
  b.bin_id,
  b.bin_type,
  b.capacity,
  b.current_level,
  l.location_name,
  l.building
FROM Bins b
INNER JOIN Locations l ON b.location_id = l.location_id;

-- View all pending alerts
SELECT 
  a.alert_id,
  a.alert_type,
  a.status,
  b.bin_type,
  l.location_name,
  b.current_level
FROM Alerts a
INNER JOIN Bins b ON a.bin_id = b.bin_id
INNER JOIN Locations l ON b.location_id = l.location_id
WHERE a.status = 'Pending';

-- View all staff members
SELECT * FROM Staff;

-- View recent waste collections
SELECT 
  wc.collection_id,
  wc.collection_date,
  wc.waste_weight,
  b.bin_type,
  l.location_name,
  s.name AS collected_by
FROM Waste_Collection wc
INNER JOIN Bins b ON wc.bin_id = b.bin_id
INNER JOIN Locations l ON b.location_id = l.location_id
INNER JOIN Staff s ON wc.collected_by = s.staff_id
ORDER BY wc.collection_date DESC;