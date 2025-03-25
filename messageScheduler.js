const { getTodaysBirthdays, getMessageTemplate } = require('./contactUtils');
const client = require('./whatsappClient');
const { Contact, Message, Template } = require('./models');

class MessageScheduler {
    constructor() {
        this.today = null;
        this.scheduledMessages = new Map();
        this.sentMessages = [];
        this.canceledMessages = [];
        this.retryQueue = [];
        this.retryPolicy = {
            maxAttempts: 3,
            backoffFactor: 2, // Exponential backoff
            initialDelay: 1 * 60 * 1000 // 1 minute
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
        const endOfDay = new Date(now);
        endOfDay.setHours(19, 0, 0, 0);
        
        // Allow 1 minute buffer for scheduler initialization
        if (now > endOfDay) {
            console.log('Scheduling for the next day as current time is past 19:00');
            this.today = (this.today + 1) % 31; // Simple increment, adjust for month-end
            this.initializeScheduler();
            return;
        }

        const contacts = await getTodaysBirthdays();
        const interval = 1 * 60 * 1000; // 1 minute
        
        console.log(`📅 Found ${contacts.length} birthdays to process`);
        contacts.forEach(async (contact, index) => {
            const sendTime = new Date(cutoffTime.getTime() + (index * interval));
            const delay = Math.max(sendTime - Date.now(), 1000);
            
            if (delay > 0) {
                // Fetch the latest default template from the database
                const defaultTemplate = await Template.findOne({ where: { isDefault: true } });
                const message = await getMessageTemplate(contact, defaultTemplate.description);

                // Create or find the message in the database
                let dbMessage = await Message.findOne({ 
                    where: { 
                        contactId: contact.id,
                        status: ['scheduled', 'pending']
                    }
                });

                if (!dbMessage) {
                    dbMessage = await Message.create({
                        contactId: contact.id,
                        name: contact.name,
                        surname: contact.surname,
                        phone_number: contact.phone_number,
                        message: message,
                        status: 'scheduled',
                        scheduledTime: sendTime
                    });
                } else {
                    // Update existing message instead of creating new one
                    await Message.update({
                        message: message,
                        scheduledTime: sendTime,
                        status: 'scheduled' // Reset status if rescheduling
                    }, { 
                        where: { id: dbMessage.id } 
                    });
                }

                // Store timeout ID for cancellation
                const timeoutId = setTimeout(async () => {
                    await this.sendMessage(contact);
                }, delay);

                this.scheduledMessages.set(contact.id, {
                    dbId: dbMessage.id,
                    timeoutId: timeoutId, // Store timeout reference
                    contact,
                    message,
                    status: 'scheduled',
                    scheduledTime: sendTime,
                    attempts: 0
                });
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

            // Check if message was cancelled before sending
            const dbMessage = await Message.findByPk(entry.dbId);
            if (!dbMessage || dbMessage.status !== 'scheduled') {
                console.log('Message cancelled, aborting send:', contact.name);
                this.scheduledMessages.delete(contact.id);
                return;
            }

            // Check if within valid time window
            const now = new Date();
            const cutoffTime = new Date(now);
            cutoffTime.setHours(10, 0, 0, 0);
            const endOfDay = new Date(now);
            endOfDay.setHours(19, 0, 0, 0);
            
            if (now < cutoffTime || now > endOfDay) {
                this.updateMessageStatus(contact.id, 'scheduled', 'Outside scheduling window, rescheduled for next day');
                this.today = (this.today + 1) % 31; // Simple increment, adjust for month-end
                this.initializeScheduler();
                return;
            }

            const exists = await Contact.findByPk(contact.id);
            if (!exists) {
                this.updateMessageStatus(contact.id, 'failed', 'Contact deleted');
                return;
            }

            const message = await getMessageTemplate(contact, exists.messageTemplate || 'default');
            
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

            // Update THE SAME message entry
            await Message.update({
                status: 'sent',
                sentAt: new Date()
            }, {
                where: { id: entry.dbId } // Update using the original message ID
            });

            this.updateMessageStatus(contact.id, 'sent');

        } catch (error) {
            console.error('🚨 Send error:', error.message);
            this.handleSendError(contact.id, error);
        }
    }

    async updateMessageStatus(id, status, error = null) {
        const entry = this.scheduledMessages.get(id);
        if (!entry) return;

        await Message.update({
            status: status,
            ...(status === 'sent' && { sentAt: new Date() }),
            ...(status === 'canceled' && { canceledAt: new Date() })
        }, {
            where: { contactId: id }
        });

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

    async cancelScheduledMessage(messageId) {
        const entry = Array.from(this.scheduledMessages.values())
            .find(e => e.dbId === messageId);
        
        if (entry) {
            // Clear the timeout to prevent sending
            clearTimeout(entry.timeoutId);
            this.scheduledMessages.delete(entry.contact.id);
            
            await Message.update({ 
                status: 'canceled',
                canceledAt: new Date() 
            }, { 
                where: { id: messageId } 
            });
            
            console.log(`🛑 Canceled scheduled message for ${entry.contact.name}`);
        }
    }
}

module.exports = new MessageScheduler(); 