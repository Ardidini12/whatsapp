const express = require('express');
const router = express.Router();
const { User, Contact, Template, Message, BulkMessages, QrCode } = require('../models'); 
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Files will be stored in the 'uploads' directory
const { parseCSV, parseExcel, parseJSON, processContacts, getTodaysBirthdays } = require('../contactUtils'); // Adjust the path as necessary
const { Parser } = require('json2csv');
const XLSX = require('xlsx');
const birthdayTracker = require('../birthdayTracker');
const messageScheduler = require('../messageScheduler');
const fs = require('fs');
const path = require('path');
const MessageScheduler = require('../messageScheduler');
const db = require('../models');
const { Op } = require('sequelize');
const schedule = require('node-schedule');
const qrcode = require('qrcode');
const { client } = require('../whatsappClient'); // Import the client

// Middleware for session management
router.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    // Remove maxAge to make the session last until the browser is closed
}));

// Registration route
router.get('/register', async (req, res) => {
    const userCount = await User.count();
    if (userCount > 0) {
        return res.redirect('/login');
    }
    res.render('register'); // Render registration form
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ username, password: hashedPassword, isSuperUser: true });
    
    // Redirect to login after registration
    res.redirect('/login');
});

// Login route
router.get('/login', (req, res) => {
    res.render('login'); // Render login form
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user.id;
        
        // Check if the client is already authenticated
        const qrCode = await QrCode.findOne({ where: { id: 1 } });
        if (qrCode && qrCode.status === 'connected') {
            return res.redirect('/dashboard');
        }

        // Initialize WhatsApp client after login
        const { client } = require('../whatsappClient');

        client.once('qr', async (qr) => {
            const qrCodeDataUrl = await qrcode.toDataURL(qr);
            await QrCode.update({ qrCodeDataUrl, status: 'active' }, { where: { id: 1 } });
            res.redirect('/qr');
        });

        client.initialize();
    } else {
        res.redirect('/login');
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.redirect('/login');
    });
});

router.get('/', async (req, res) => {
    const userCount = await User.count();
    if (userCount === 0) {
        return res.redirect('/register');
    }
    res.redirect('/login');
});

// Dashboard route
router.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const qrCode = await QrCode.findOne({ where: { id: 1 } });
    if (qrCode && qrCode.status === 'connected') {
        // Render the dashboard view
        res.render('dashboard');
    } else {
        res.send('WhatsApp client is not ready. Please reload after a few seconds.');
        //here we can manage this to render the qr code page, maybe think of this later 
    }
});

// Contacts route
router.get('/contacts', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const contacts = await Contact.findAll();
    res.render('contacts', { 
        contacts, 
        error: {},
        phone_number: '' // Initialize phone_number with empty string
    });
});

router.get('/whatsappDashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    try {
        const qrCode = await QrCode.findOne({ where: { id: 1 } });
        const clientInfo = client.info; // Assuming client is accessible here
        const phoneNumber = clientInfo ? clientInfo.wid.user : 'Not connected';
        const status = qrCode && qrCode.status === 'connected';

        res.render('whatsappDashboard', {
            status,
            phone: phoneNumber
        });
    } catch (error) {
        console.error('Error retrieving WhatsApp status:', error);
        res.status(500).send('Error retrieving WhatsApp status');
    }
});

router.post('/import', upload.single('contactsFile'), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    // Determine file type and parse accordingly
    const fileType = file.mimetype;
    let contacts = [];

    try {
        if (fileType === 'text/csv') {
            contacts = await parseCSV(file.path);
        } else if (fileType.includes('spreadsheetml')) {
            contacts = await parseExcel(file.path);
        } else if (fileType === 'application/json') {
            contacts = await parseJSON(file.path);
        } else {
            return res.status(400).send('Unsupported file type.');
        }

        // Validate contacts structure
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).send('Invalid file format or empty file');
        }

        // Validate minimum required fields
        const validContacts = contacts.filter(c => c.phone_number);
        if (validContacts.length === 0) {
            return res.status(400).send('No valid contacts found (missing phone numbers)');
        }

        // Process contacts and prepare for preview
        const processedContacts = await processContacts(validContacts, file.originalname);

        // Ensure each contact has a source
        processedContacts.forEach(contact => {
            contact.source = `Imported from ${file.originalname}`;
        });

        // Add this error handling
        if (processedContacts.length === 0) {
            return res.status(400).send('No valid contacts to import');
        }

        // Render preview page with processed contacts
        res.render('preview', { contacts: processedContacts });
    } catch (error) {
        console.error('Error importing contacts:', error);
        res.status(500).send('Error importing contacts: ' + error.message);
    }
});

router.get('/export/json', async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        res.attachment('contacts.json');
        res.json(contacts);
    } catch (error) {
        console.error('Error exporting contacts:', error);
        res.status(500).send('Error exporting contacts.');
    }
});

router.get('/export/csv', async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        const fields = ['name', 'surname', 'phone_number', 'email', 'birthday', 'source'];
        const parser = new Parser({ fields });
        const csv = parser.parse(contacts);
        res.attachment('contacts.csv');
        res.send(csv);
    } catch (error) {
        console.error('Error exporting contacts:', error);
        res.status(500).send('Error exporting contacts.');
    }
});

router.get('/export/xlsx', async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        const worksheet = XLSX.utils.json_to_sheet(contacts);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.attachment('contacts.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting contacts:', error);
        res.status(500).send('Error exporting contacts.');
    }
});

router.post('/add-contact', async (req, res) => {
    const { phone_number, name, surname, email, birthday } = req.body;
    try {
        await Contact.create({
            phone_number,
            name: name || null,
            surname: surname || null,
            email: email || null,
            birthday: birthday || null,
            source: 'Manually Added'
        });
        res.redirect('/contacts');
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const contacts = await Contact.findAll();
            res.status(400).render('contacts', { contacts, error: { error: 'Duplicate phone number detected.' }, phone_number });
        } else {
            console.error('Error adding contact:', error);
            res.status(500).send('Error adding contact.');
        }
    }
});

router.post('/confirm-import', async (req, res) => {
    const contacts = req.body.contacts;
    
    if (!Array.isArray(contacts)) {
        return res.status(400).send('Invalid import data');
    }

    // Validate contacts before processing
    const validContacts = contacts.filter(c => c.phone_number);
    if (validContacts.length === 0) {
        return res.status(400).send('No valid contacts to import');
    }

    let hasDuplicates = false;
    try {
        // Iterate over the contacts and save them to the database
        for (const contact of contacts) {
            try {
                await Contact.create({
                    phone_number: contact.phone_number, // Only require phone_number
                    name: contact.name || null, // Optional fields
                    surname: contact.surname || null,
                    email: contact.email || null,
                    birthday: contact.birthday || null,
                    source: contact.source // Ensure source is set during import
                });
            } catch (error) {
                if (error.name === 'SequelizeUniqueConstraintError') {
                    contact.isDuplicate = true;
                    hasDuplicates = true;
                } else {
                    throw error;
                }
            }
        }
        if (hasDuplicates) {
            res.status(400).render('preview', { contacts });
        } else {
            res.redirect('/contacts');
        }
    } catch (error) {
        console.error('Error importing contacts:', error);
        res.status(500).send('Error importing contacts.');
    }
});

router.get('/edit-contact/:id', async (req, res) => {
    try {
        const contact = await Contact.findByPk(req.params.id);
        res.render('edit', { contact });
    } catch (error) {
        res.status(500).send('Error fetching contact');
    }
});

router.post('/edit-contact/:id', async (req, res) => {
    const { phone_number, name, surname, email, birthday } = req.body;
    try {
        await Contact.update({
            phone_number,
            name: name || null,
            surname: surname || null,
            email: email || null,
            birthday: birthday || null // Ensure birthday is null if not provided
        }, {
            where: { id: req.params.id }
        });
        res.redirect('/contacts');
    } catch (error) {
        console.error('Error updating contact:', error);
        res.status(500).send('Error updating contact.');
    }
});

router.get('/delete-contact/:id', async (req, res) => {
    try {
        await Contact.destroy({
            where: { id: req.params.id }
        });
        res.redirect('/contacts');
    } catch (error) {
        res.status(500).send('Error deleting contact');
    }
});

// Add birthday routes to existing auth routes
router.get('/todaysBirthdays', async (req, res) => {
    try {
        const birthdays = await getTodaysBirthdays();
        res.render('todaysBirthdays', { 
            birthdays: birthdays,
            formatDate: (date) => new Date(date).toLocaleDateString()
        });
    } catch (error) {
        console.error('Error fetching birthdays:', error);
        res.status(500).send('Error loading birthdays');
    }
});

router.get('/api/todaysBirthdays', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial data
    getTodaysBirthdays().then(contacts => {
        res.write(`data: ${JSON.stringify(contacts.map(c => ({
            ...c.get({ plain: true }),
            birthday: c.birthday.toISOString()
        })))}\n\n`);
    });

    // Send updates
    const handler = (contacts) => {
        res.write(`data: ${JSON.stringify(contacts.map(c => ({
            ...c.get({ plain: true }),
            birthday: c.birthday.toISOString()
        })))}\n\n`);
    };
    birthdayTracker.on('update', handler);

    req.on('close', () => {
        birthdayTracker.off('update', handler);
    });
});

router.get('/whatsappMessages', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of the day

        // Fetch today's messages
        const todaysScheduled = await Message.findAll({
            where: {
                status: 'scheduled',
                scheduledTime: {
                    [Op.gte]: today
                }
            },
            include: [{ model: Contact, as: 'contact' }]
        });
        const todaysSent = await Message.findAll({
            where: {
                status: 'sent',
                sentAt: {
                    [Op.gte]: today
                }
            },
            include: [{ model: Contact, as: 'contact' }]
        });
        const todaysCancelled = await Message.findAll({
            where: {
                status: 'canceled',
                canceledAt: {
                    [Op.gte]: today
                }
            },
            include: [{ model: Contact, as: 'contact' }]
        });

        // Fetch overall history
        const overallScheduled = await Message.findAll({
            where: { status: 'scheduled' },
            include: [{ model: Contact, as: 'contact' }]
        });
        const overallSent = await Message.findAll({
            where: { status: 'sent' },
            include: [{ model: Contact, as: 'contact' }]
        });
        const overallCancelled = await Message.findAll({
            where: { status: 'canceled' },
            include: [{ model: Contact, as: 'contact' }]
        });

        res.render('whatsappMessages', {
            todaysScheduled,
            todaysSent,
            todaysCancelled,
            overallScheduled,
            overallSent,
            overallCancelled
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/api/message-status', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    
    const sendUpdate = () => {
        res.write(`data: ${JSON.stringify({
            scheduled: Array.from(messageScheduler.scheduledMessages.values()),
            sent: messageScheduler.sentMessages
        })}\n\n`);
    };
    
    sendUpdate();
    const interval = setInterval(sendUpdate, 5000);
    
    req.on('close', () => clearInterval(interval));
});

router.post('/set-template/:id', async (req, res) => {
    try {
        await Contact.update(
            { messageTemplate: req.body.template },
            { where: { id: req.params.id } }
        );
        res.redirect('/contacts');
    } catch (error) {
        res.status(500).send('Error updating template');
    }
});

router.get('/templates', async (req, res) => {
    const templates = await db.Template.findAll();
    res.render('templates', { templates });
});

router.post('/create-template', async (req, res) => {
    try {
        await db.Template.create(req.body);
        res.redirect('/templates');
    } catch (error) {
        res.status(400).send('Error creating template');
    }
});

router.post('/update-template/:id', async (req, res) => {
    try {
        const template = await db.Template.findByPk(req.params.id);
        const updateData = {
            description: req.body.description
        };

        if (!template.isDefault) {
            updateData.templateName = req.body.templateName;
        }

        await db.Template.update(updateData, {
            where: { id: req.params.id }
        });
        
        res.redirect('/templates');
    } catch (error) {
        res.status(400).send('Error updating template: ' + error.message);
    }
});

router.delete('/delete-template/:id', async (req, res) => {
    try {
        const template = await db.Template.findByPk(req.params.id);
        
        // Prevent deletion of default template
        if (template.isDefault) {
            return res.status(400).send('Cannot delete default template');
        }

        const totalTemplates = await db.Template.count();
        
        if (totalTemplates === 1) {
            // Last template - show warning
            return res.json({
                warning: true,
                message: 'This is the last template. Deleting it will cause birthday messages to use the system default.'
            });
        }

        await db.Template.destroy({ where: { id: req.params.id } });
        res.sendStatus(200);
    } catch (error) {
        res.status(400).send('Error deleting template');
    }
});

router.get('/templates/:id/delete-warning', async (req, res) => {
    try {
        const total = await db.Template.count();
        res.json({
            warning: total === 1,
            message: total === 1 
                ? 'This is the last template. Deleting it will cause birthday messages to use the system default.'
                : 'Are you sure you want to delete this template?'
        });
    } catch (error) {
        res.status(400).json({ error: 'Error checking templates' });
    }
});

// Fetch scheduled messages
router.get('/api/scheduled-messages', (req, res) => {
    const scheduledMessages = Array.from(messageScheduler.scheduledMessages.values());
    res.json(scheduledMessages);
});

// Cancel a scheduled message
router.post('/api/cancel-message/:messageId', async (req, res) => {
    try {
        await Message.update(
            { status: 'canceled', canceledAt: new Date() },
            { where: { id: req.params.messageId } }
        );
        messageScheduler.cancelScheduledMessage(req.params.messageId);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error canceling message:', error);
        res.status(500).send('Error canceling message');
    }
});

// Add a route for /bulkMessageSender
router.get('/bulkMessageSender', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    // Render the bulkMessageSender view
    res.render('bulkMessageSender');
});

// Route to display the QR code
router.get('/qr', async (req, res) => {
    try {
        // Retrieve the active QR code from the database
        const qrCode = await QrCode.findOne({ where: { status: 'active' } });

        if (qrCode) {
            console.log('QR code data URL retrieved:', qrCode.qrCodeDataUrl);
            res.render('qr', { qrCodeDataUrl: qrCode.qrCodeDataUrl });
        } else {
            console.error('No active QR code found.');
            res.render('qr', { qrCodeDataUrl: null });
        }
    } catch (error) {
        console.error('Error retrieving QR code:', error);
        res.status(500).send('Error retrieving QR code');
    }
});

router.get('/qr-updates', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendQrCodeUpdate = async () => {
        const qrCode = await QrCode.findOne({ where: { id: 1 } });
        if (qrCode) {
            const clientInfo = client.info; // Use the imported client
            const phoneNumber = clientInfo ? clientInfo.wid.user : 'Not connected';
            res.write(`data: ${JSON.stringify({ qrCodeDataUrl: qrCode.qrCodeDataUrl, status: qrCode.status, phoneNumber })}\n\n`);
            if (qrCode.status === 'connected') {
                clearInterval(interval);
                res.end();
            }
        }
    };

    // Send updates every 5 seconds
    const interval = setInterval(sendQrCodeUpdate, 5000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

module.exports = router;
