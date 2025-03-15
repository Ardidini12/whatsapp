const express = require('express');
const router = express.Router();
const { User, Contact } = require('../models'); 
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
        
        // Initialize WhatsApp client after login
        const whatsappClient = require('../whatsappClient');
        
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
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
    
    const whatsappClient = require('../whatsappClient');
    if (!whatsappClient.info) {
        return res.send('WhatsApp client is not ready. Please reload after a few seconds.');
    }
    
    // Render the dashboard view
    res.render('dashboard');
});

// Contacts route
router.get('/contacts', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const contacts = await Contact.findAll();
    res.render('contacts', { contacts });
});

router.get('/whatsappDashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    const whatsappClient = require('../whatsappClient');
    res.render('whatsappDashboard', {
        status: !!whatsappClient.info,
        phone: whatsappClient.info?.wid.user || 'Not connected'
    });
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

        // Process contacts and prepare for preview
        const processedContacts = await processContacts(contacts, file.originalname);

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
        res.status(500).send('Error importing contacts.');
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
    const { name, surname, phone_number, email, birthday } = req.body;
    try {
        await Contact.create({
            name,
            surname,
            phone_number,
            email,
            birthday,
            source: 'Manually Added'
        });
        res.redirect('/contacts');
    } catch (error) {
        console.error('Error adding contact:', error);
        res.status(500).send('Error adding contact.');
    }
});

router.post('/confirm-import', async (req, res) => {
    const contacts = req.body.contacts; // Assuming contacts are sent in the request body
    try {
        // Iterate over the contacts and save them to the database
        for (const contact of contacts) {
            await Contact.create({
                name: contact.name,
                surname: contact.surname,
                phone_number: contact.phone_number,
                email: contact.email,
                birthday: contact.birthday,
                source: contact.source // Ensure source is set during import
            });
        }
        res.redirect('/contacts'); // Redirect to the contacts page after import
    } catch (error) {
        console.error('Error confirming import:', error);
        res.status(500).send('Error confirming import.');
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
    try {
        await Contact.update(req.body, {
            where: { id: req.params.id }
        });
        res.redirect('/contacts');
    } catch (error) {
        res.status(500).send('Error updating contact');
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

router.get('/whatsappMessages', (req, res) => {
    res.render('whatsappMessages', {
        scheduled: Array.from(MessageScheduler.scheduledMessages.values()),
        sent: MessageScheduler.sentMessages
    });
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

router.get('/templates', (req, res) => {
    res.render('templates', { 
        templates: require('../contactUtils').messageTemplates 
    });
});

router.post('/update-template', (req, res) => {
    const { templateName, content } = req.body;
    const templates = require('../contactUtils').messageTemplates;
    
    templates[templateName] = content;
    fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(templates, null, 2));
    
    require('../contactUtils').refreshTemplates();
    res.redirect('/templates');
});

router.delete('/delete-template/:name', (req, res) => {
    const templateName = req.params.name;
    const utils = require('../contactUtils');
    
    // Get first available template as fallback
    const fallback = Object.keys(utils.messageTemplates)[0] || 'default';
    
    // Update contacts using this template
    Contact.update(
        { messageTemplate: fallback },
        { where: { messageTemplate: templateName } }
    );

    delete utils.messageTemplates[templateName];
    
    // Preserve at least one template
    if (Object.keys(utils.messageTemplates).length === 0) {
        utils.messageTemplates.default = "Happy Birthday {name}! 🎉";
    }
    
    fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(utils.messageTemplates, null, 2));
    utils.refreshTemplates();
    res.sendStatus(200);
});

router.post('/create-template', (req, res) => {
    const { templateName, content } = req.body;
    const utils = require('../contactUtils');
    
    if (utils.messageTemplates[templateName]) {
        return res.status(400).send("Template name already exists");
    }
    
    utils.messageTemplates[templateName] = content;
    fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(utils.messageTemplates, null, 2));
    utils.refreshTemplates();
    res.redirect('/templates');
});

// Export the router with both auth and birthday routes
module.exports = router;
