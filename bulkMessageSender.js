const express = require('express');
const router = express.Router();
const { Contact, Template, ScheduledMessage } = require('./models');
const client = require('./whatsappClient');
const { Op } = require('sequelize');

// Route to handle bulk message sending
router.post('/sendBulkMessages', async (req, res) => {
  const { selectedContacts, selectedTemplate } = req.body;

  if (!selectedContacts || !selectedTemplate) {
    return res.status(400).send('Please select contacts and a template');
  }

  try {
    const template = await Template.findByPk(selectedTemplate);
    if (!template) {
      return res.status(400).send('Invalid template selected');
    }

    const contacts = await Contact.findAll({
      where: { id: selectedContacts }
    });

    const scheduledMessages = [];

    // Helper: Compute scheduled send time for each message based on allowed hours (10:00 - 19:00)
    function getScheduledTime(index) {
      const now = new Date();

      // Create Date objects for today's allowed start and end times.
      let allowedStart = new Date(now);
      allowedStart.setHours(10, 0, 0, 0);
      let allowedEnd = new Date(now);
      allowedEnd.setHours(19, 0, 0, 0);

      let scheduled;
      // If current time is before allowed start, begin at allowedStart
      if (now < allowedStart) {
        scheduled = new Date(allowedStart);
      }
      // If current time is after allowed end, schedule for tomorrow at allowedStart
      else if (now >= allowedEnd) {
        scheduled = new Date(now);
        scheduled.setDate(now.getDate() + 1);
        scheduled.setHours(10, 0, 0, 0);
      } else {
        // Otherwise, start now
        scheduled = new Date(now);
      }

      // Add a 1-minute interval per message (index starts at 0)
      scheduled = new Date(scheduled.getTime() + ((index + 1) * 60000));

      // If the computed time exceeds today's allowed end, move to tomorrow at allowedStart plus any overflow
      if (scheduled > allowedEnd) {
        const overflow = scheduled - allowedEnd;
        scheduled = new Date(allowedEnd);
        scheduled.setDate(scheduled.getDate() + 1);
        scheduled.setHours(10, 0, 0, 0);
        scheduled = new Date(scheduled.getTime() + overflow);
      }

      return scheduled;
    }

    // Create one scheduled message per contact, each with its computed send time.
    contacts.forEach((contact, index) => {
      const sendTime = getScheduledTime(index);
      const whatsappId = `${contact.phone_number.replace(/\D/g, '').replace(/^0+/, '')}@c.us`;

      const scheduledMessage = ScheduledMessage.build({
        contactName: contact.name,
        scheduledTime: sendTime, // use the computed sendTime
        status: 'pending',
        whatsappId,
        message: template.description
      });

      scheduledMessages.push(scheduledMessage);
    });

    // Save scheduled messages in one go
    const createdMessages = await ScheduledMessage.bulkCreate(
      scheduledMessages.map(m => m.toJSON()),
      { returning: true } // Ensure we get the actual DB records
    );

    // Schedule sends using the actual database records
    createdMessages.forEach((message, index) => {
      const delay = (index + 1) * 60000;
      
      setTimeout(async () => {
        try {
          if (!client.pupPage) {
            await message.update({ status: 'failed', error: 'Client not ready' });
            return;
          }
          
          await client.sendMessage(message.whatsappId, message.message);
          await message.update({
            status: 'sent'
          });
          
        } catch (error) {
          await message.update({ 
            status: 'failed', 
            error: error.message.substring(0, 255) 
          });
        }
      }, delay);
    });

    res.status(200).json(createdMessages);
  } catch (error) {
    console.error('Error scheduling messages:', error);
    res.status(500).send('Error scheduling messages');
  }
});

// Endpoint to get scheduled messages
router.get('/api/scheduledMessages', async (req, res) => {
  try {
    const scheduledMessages = await ScheduledMessage.findAll();
    res.json(scheduledMessages);
  } catch (error) {
    console.error('Error fetching scheduled messages:', error);
    res.status(500).send('Error fetching scheduled messages');
  }
});

async function sendScheduledMessages() {
  const now = new Date();
  const scheduledMessages = await ScheduledMessage.findAll({
    where: {
      status: 'pending',
      scheduledTime: {
        [Op.lte]: now // Only process messages where scheduledTime has passed
      }
    }
  });

  for (const message of scheduledMessages) {
    try {
      const cleanNumber = message.whatsappId.split('@')[0];
      console.log(`📤 Attempting to send to ${cleanNumber}`);

      if (!client.pupPage) {
        console.log('⚠️ WhatsApp client not ready, skipping send');
        continue;
      }

      await client.sendMessage(message.whatsappId, message.message);
      console.log(`✅ Successfully sent to ${message.contactName}`);

      await ScheduledMessage.update(
        { status: 'sent' },
        { where: { id: message.id } }
      );
    } catch (error) {
      console.error('🚨 Send error:', error.message);
      await ScheduledMessage.update(
        { status: 'failed', error: error.message },
        { where: { id: message.id } }
      );
    }
  }
}

module.exports = router;
