const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
// const qrcodeTerminal = require('qrcode-terminal');
const { User, QrCode } = require('./models'); // Ensure User and QrCode models are imported

// Initialize the client with LocalAuth
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "client-one" // Use a unique ID for each client
    })
});

// client.on('qr', (qr) => {
//     // Generate and display the QR code in the terminal
//     qrcode.generate(qr, { small: true });
// });

let qrCodeDataUrl; // Global variable to store the QR code data URL

client.on('qr', async (qr) => {
    console.log('QR code received, generating data URL...');
    const qrCodeDataUrl = await qrcode.toDataURL(qr);
    console.log('QR code data URL generated:', qrCodeDataUrl);

    // Update the existing QR code row
    try {
        const [updated] = await QrCode.update(
            { qrCodeDataUrl, status: 'active' },
            { where: { id: 1 } } // Assuming the row ID is 1
        );
        if (updated) {
            console.log('QR code data URL successfully updated in the database.');
        } else {
            console.error('Failed to update QR code data URL in the database.');
        }
    } catch (error) {
        console.error('Error updating QR code in database:', error);
    }

    // Uncomment the following line to generate and display the QR code in the terminal
    // qrcodeTerminal.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    // Notify the client-side to redirect to the dashboard if needed
});

// Handle authentication failure
client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
});

client.on('authenticated', async () => {
    console.log('QR code scanned and authenticated.');

    // Update the status to 'connected'
    try {
        await QrCode.update({ status: 'connected' }, { where: { id: 1 } });
        console.log('QR code status updated to connected.');
    } catch (error) {
        console.error('Error updating QR code status:', error);
    }

    // Stop further QR code generation
    client.removeAllListeners('qr');
});

// Initialize the client
client.initialize();

// Export the client and the QR code data URL
module.exports = { client, getQrCodeDataUrl: () => qrCodeDataUrl };
