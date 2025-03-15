const EventEmitter = require('events');
const { Contact, sequelize } = require('./models');
const { getTodaysBirthdays } = require('./contactUtils');

class BirthdayTracker extends EventEmitter {
    constructor() {
        super();
        this.currentBirthdays = new Set();
        this.setupHooks();
        this.init();
    }

    async init() {
        const birthdays = await getTodaysBirthdays();
        this.currentBirthdays = new Set(birthdays.map(c => c.id));
        this.emit('update', birthdays);
        console.log(`Found ${birthdays.length} birthdays today`);
    }

    setupHooks() {
        Contact.afterCreate(async (contact) => {
            const now = new Date();
            const bday = new Date(contact.birthday);
            
            // Only track if birthday is today and before cutoff
            if (this.isBirthdayToday(bday) && now < this.getCutoffTime()) {
                this.currentBirthdays.add(contact.id);
                this.emit('update', await getTodaysBirthdays());
            }
        });

        Contact.afterUpdate(async (contact) => {
            const wasInList = this.currentBirthdays.has(contact.id);
            const nowInList = this.isBirthdayToday(contact.birthday);
            
            if (wasInList !== nowInList) {
                nowInList ? this.currentBirthdays.add(contact.id) : this.currentBirthdays.delete(contact.id);
                this.emit('update', await getTodaysBirthdays());
            }
        });

        Contact.afterDestroy(async (contact) => {
            if (this.currentBirthdays.has(contact.id)) {
                this.currentBirthdays.delete(contact.id);
                this.emit('update', await getTodaysBirthdays());
            }
        });
    }

    isBirthdayToday(birthday) {
        const now = new Date();
        const bday = new Date(birthday);
        return (bday.getMonth() === now.getMonth()) && 
               (bday.getDate() === now.getDate());
    }

    getCutoffTime() {
        const cutoff = new Date();
        cutoff.setHours(10, 0, 0, 0);
        return cutoff;
    }
}

module.exports = new BirthdayTracker(); 