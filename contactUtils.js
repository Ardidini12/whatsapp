const fs = require('fs');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { Contact, Template } = require('./models'); // Ensure Template is imported
const { sequelize } = require('./models');
const path = require('path');

// Remove TEMPLATE_PATH and messageTemplates
// const TEMPLATE_PATH = path.join(__dirname, 'message-templates.json');
// let messageTemplates = JSON.parse(fs.readFileSync(TEMPLATE_PATH));

// Remove refreshTemplates function
// function refreshTemplates() {
//     messageTemplates = JSON.parse(fs.readFileSync(TEMPLATE_PATH));
// }

async function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

async function parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

async function parseJSON(filePath) {
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
}

async function processContacts(contacts, filename) {
    const existingContacts = await Contact.findAll({ attributes: ['phone_number'] });
    const existingNumbers = new Set(existingContacts.map(c => c.phone_number));

    return contacts.map(contact => {
        // Normalize during import
        const cleanNumber = typeof contact.phone_number === 'string' ?
            contact.phone_number
                .replace(/\D/g, '')
                .replace(/^\+?0*/, '')
                .replace(/\s+/g, '')
                .replace(/^0+/, '') :
            '';

        const isDuplicate = existingNumbers.has(cleanNumber);
        return {
            ...contact,
            phone_number: cleanNumber, // Store normalized number
            source: `Imported from ${filename}`,
            isDuplicate
        };
    });
}

async function getTodaysBirthdays() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // Months are 0-indexed in JS
    const currentDate = now.getDate();

    const contacts = await Contact.findAll({
        where: sequelize.literal(
            `EXTRACT(MONTH FROM birthday) = ${currentMonth} AND EXTRACT(DAY FROM birthday) = ${currentDate}`
        )
    });

    return contacts;
}

async function getMessageTemplate(contact) {
    // Fetch the default template from the database
    const template = await Template.findOne({ where: { isDefault: true } });
    
    // Use the template description if found, otherwise use the fallback
    const templateDescription = template ? template.description : "Happy Birthday {name}! 🎉 Wishing you a wonderful day!";
    
    return templateDescription
        .replace(/{name}/g, contact.name)
        .replace(/{surname}/g, contact.surname);
}

module.exports = {
    parseCSV,
    parseExcel,
    parseJSON,
    processContacts,
    getTodaysBirthdays,
    getMessageTemplate // Export the updated function
};
