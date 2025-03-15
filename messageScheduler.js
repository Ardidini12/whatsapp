const { getTodaysBirthdays, getMessageTemplate } = require('./contactUtils');
const client = require('./whatsappClient');
const { Contact } = require('./models');

class MessageScheduler {
    constructor() {
        this.today = null;
        this.scheduledMessages = new Map();
        this.sentMessages = [];
        this.retryQueue = [];
        this.retryPolicy = {
            maxAttempts: 3,
            backoffFactor: 2, // Exponential backoff
            initialDelay: 5 * 60 * 1000 // 5 minutes
        };
        this.scheduleDailyJob();
        setInterval(() => this.cleanupMessages(), 60000);
    }

    scheduleDailyJob() {
        // Check every minute if we've crossed into a new day
        setInterval(() => this.checkDateChange(), 60000);
        this.initializeScheduler();
    }

    initializeScheduler() {
        this.today = new Date().getDate();
        const scheduleTime = '0 10 * * *'; // 10:00 AM daily
        
        require('node-schedule').scheduleJob(scheduleTime, () => {
            console.log('🎉 Birthday message job triggered at', new Date());
            if (new Date().getDate() === this.today) {
                this.processBirthdayMessages();
            }
        });
        
        // Immediately process if before 10 AM on startup
        const now = new Date();
        if (now.getHours() < 10) {
            console.log('⏳ Initial early morning schedule check');
            this.processBirthdayMessages();
        }
    }

    checkDateChange() {
        const currentDate = new Date().getDate();
        if (currentDate !== this.today) {
            console.log('New day detected - resetting scheduler');
            this.today = currentDate;
            this.scheduledMessages.clear();
            this.initializeScheduler();
        }
    }

    async processBirthdayMessages() {
        console.log('🔍 Starting birthday message processing...');
        const now = new Date();
        console.log('⏰ Current time:', now.toLocaleTimeString());

        const cutoffTime = new Date(now);
        cutoffTime.setHours(10, 0, 0, 0);
        
        // Allow 1 minute buffer for scheduler initialization
        if (now > cutoffTime + 60000) {
            console.log('Skipping scheduling - past cutoff time');
            return;
        }

        const contacts = await getTodaysBirthdays();
        const interval = 5 * 60 * 1000; // 5 minutes
        
        console.log(`📅 Found ${contacts.length} birthdays to process`);
        contacts.forEach((contact, index) => {
            const sendTime = new Date(cutoffTime.getTime() + (index * interval));
            
            // Ensure minimum 1 second delay
            const delay = Math.max(sendTime - Date.now(), 1000);
            
            if (delay > 0) {
                this.scheduledMessages.set(contact.id, {
                    contact,
                    status: 'scheduled',
                    scheduledTime: sendTime,
                    attempts: 0
                });

                setTimeout(async () => {
                    await this.sendMessage(contact);
                    this.sendStatusUpdate(); // Trigger UI update
                }, delay);
            }
            console.log(`⏳ Scheduled ${contact.name} for ${sendTime.toLocaleTimeString()}`);
        });
    }

    async sendMessage(contact) {
        try {
            const entry = this.scheduledMessages.get(contact.id);
            if (!entry) {
                console.log('⚠️ Message already processed for:', contact.name);
                return;
            }

            const now = new Date();
            const cutoffTime = new Date(now);
            cutoffTime.setHours(10, 0, 0, 0);
            
            // Check if within valid time window
            if (now < cutoffTime || now > cutoffTime.setHours(23, 59, 59, 999)) {
                this.updateMessageStatus(contact.id, 'failed', 'Outside scheduling window');
                return;
            }

            const exists = await Contact.findByPk(contact.id);
            if (!exists) {
                this.updateMessageStatus(contact.id, 'failed', 'Contact deleted');
                return;
            }

            const message = getMessageTemplate(contact, exists.messageTemplate || 'default');
            
            // Robust phone number normalization
            const cleanNumber = contact.phone_number
                .replace(/\D/g, '')          // Remove all non-digit characters
                .replace(/^\+?0*/, '')       // Remove leading + and any zeros after it
                .replace(/\s+/g, '')         // Remove any remaining whitespace
                .replace(/^0+/, '');         // Remove any leading zeros that still exist

            if (!cleanNumber) {
                throw new Error('Invalid phone number after normalization');
            }
            
            const whatsappId = `${cleanNumber}@c.us`;
            console.log(`📤 Attempting to send to ${cleanNumber}`);

            await client.sendMessage(whatsappId, message);
            console.log(`✅ Successfully sent to ${contact.name}`);
            this.updateMessageStatus(contact.id, 'sent');

        } catch (error) {
            console.error('🚨 Send error:', error.message);
            this.handleSendError(contact.id, error);
        }
    }

    updateMessageStatus(id, status, error = null) {
        const entry = this.scheduledMessages.get(id);
        entry.status = status;
        entry.error = error;
        entry.updatedAt = new Date();
        
        if (status === 'sent') {
            this.sentMessages.push(entry);
            this.scheduledMessages.delete(id);
        }
    }

    handleSendError(id, error) {
        const entry = this.scheduledMessages.get(id);
        
        // Add null check for entry
        if (!entry) {
            console.error('⚠️ Message entry not found for ID:', id);
            return;
        }

        entry.attempts++;
        
        if (entry.attempts <= this.retryPolicy.maxAttempts) {
            const delay = this.retryPolicy.initialDelay * 
                        Math.pow(this.retryPolicy.backoffFactor, entry.attempts - 1);
            
            console.log(`🔄 Retrying ${entry.contact.name} (Attempt ${entry.attempts}) in ${delay/1000}s`);
            setTimeout(() => this.sendMessage(entry.contact), delay);
        } else {
            console.error(`❌ Failed to send to ${entry.contact.name} after ${entry.attempts} attempts`);
            this.updateMessageStatus(id, 'failed', error.message);
        }
    }

    sendStatusUpdate() {
        this.sentMessages = this.sentMessages.slice(-100); // Keep last 100 messages
    }

    cleanupMessages() {
        const now = Date.now();
        // Remove stale scheduled messages
        this.scheduledMessages.forEach((value, key) => {
            if (value.scheduledTime < now - 3600000) { // 1 hour old
                this.scheduledMessages.delete(key);
            }
        });
    }
}

module.exports = new MessageScheduler(); 