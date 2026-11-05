/**
 * Server Entry Point for NomCherry Café
 * Clean Architecture Web Application
 */

const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, '../public')));

// Explicit Login Page Routes
app.get(['/login', '/masuk'], (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Mount API Routes
app.use('/api', apiRoutes);

// SPA Fallback Middleware
app.use((req, res) => {
    // If request is not an API call, serve index.html
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
        res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║               🍒 NOMCHERRY CAFÉ - WEB SYSTEM 🍒                 ║
║      Sistem Informasi Pemesanan & Kasir Kafe Berbasis Web        ║
╠══════════════════════════════════════════════════════════════════╣
║  🚀 Server running at: http://localhost:${PORT}                    ║
║  🎨 Design Reference: Parley Messaging Dashboard                 ║
║  📦 Database: SQLite 3.53 (Native Node.js DatabaseSync)          ║
║  📍 Multi-Cabang: Surabaya Pusat (CBG001) & Timur (CBG002)       ║
╠══════════════════════════════════════════════════════════════════╣
║  Akun Default Login:                                             ║
║  • Admin:   username: admin    | password: admin123 (Full Akses) ║
║  • Kasir 1: username: daps     | password: 135      (Cabang 1)   ║
║  • Kasir 2: username: kasir    | password: 123      (Cabang 2)   ║
║  • Manager: username: manager1 | password: 123      (Stok/Menu)  ║
║  • Owner:   username: owner1   | password: 123      (Laporan)    ║
╚══════════════════════════════════════════════════════════════════╝
    `);
});
