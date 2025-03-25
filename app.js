const express = require('express');
const authRoutes = require('./routes/auth'); // Import auth routes
const bulkMessageSenderRoutes = require('./bulkMessageSender'); // Import bulkMessageSender routes
const path = require('path');
require('./messageScheduler'); // Add near top of file
require('dotenv').config();
const { Contact, Template } = require('./models'); // Assuming you have a Contact and Template model

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

// Use bulkMessageSender routes
app.use('/', bulkMessageSenderRoutes);

app.get('/api/bulkData', async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        const templates = await Template.findAll();
        const groupedContacts = contacts.reduce((acc, contact) => {
            if (!acc[contact.source]) {
                acc[contact.source] = [];
            }
            acc[contact.source].push(contact);
            return acc;
        }, {});

        res.json({ groupedContacts, templates });
    } catch (error) {
        console.error('Error fetching contacts or templates:', error);
        res.status(500).send('Error fetching contacts or templates');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
