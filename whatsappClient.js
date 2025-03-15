const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize the client with LocalAuth
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one" // Use a unique ID for each client
    })
});

client.on('qr', (qr) => {
    // Generate and display the QR code in the terminal
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

// Handle authentication failure
client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
});

// Initialize the client
client.initialize();

module.exports = client;
