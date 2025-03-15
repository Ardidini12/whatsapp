const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { exec } = require('child_process');
const open = require('open');

const configPath = path.join(__dirname, 'config.json');

function renderEjsToHtml(filePath, data = {}) {
    return new Promise((resolve, reject) => {
        ejs.renderFile(filePath, data, {}, (err, str) => {
            if (err) reject(err);
            else resolve(str);
        });
    });
}

function startServer() {
    exec('node app.js', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error starting server: ${err}`);
            return;
        }
        console.log(`Server output: ${stdout}`);
        open('http://localhost:3000');
    });
}

async function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
        }
    });

    // Load the splash screen
    win.loadFile('splash.html');

    // Simulate server start or other initialization
    setTimeout(async () => {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        let startFile = config.isRegistered ? 'views/login.ejs' : 'views/register.ejs';
        const htmlContent = await renderEjsToHtml(startFile);
        win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    }, 3000); // Adjust the delay as needed
}

app.whenReady().then(() => {
    startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
