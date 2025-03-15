const express = require('express');
const authRoutes = require('./routes/auth'); // Import auth routes
const path = require('path');
require('./messageScheduler'); // Add near top of file
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Use authentication routes
app.use('/', authRoutes);

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
