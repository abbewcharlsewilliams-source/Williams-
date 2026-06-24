const express = require('express');
const messagebird = require('messagebird').default;
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize MessageBird client
const mb = messagebird(process.env.MESSAGEBIRD_ACCESS_KEY);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Store conversation history (in production, use a database)
const conversationHistory = {};

// WhatsApp webhook endpoint
app.post('/webhook', async (req, res) => {
  const incoming_msg = req.body.message;
  const sender = req.body.from;

  // Only process WhatsApp messages
  if (!sender || !incoming_msg) {
    return res.status(200).send('OK');
  }

  try {
    // Initialize conversation history for new users
    if (!conversationHistory[sender]) {
      conversationHistory[sender] = [];
    }

    // Add user message to history
    conversationHistory[sender].push({
      role: 'user',
      content: incoming_msg,
    });

    // Get response from OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: conversationHistory[sender],
      max_tokens: 500,
      temperature: 0.7,
    });

    const bot_reply = response.choices[0].message.content;

    // Add bot response to history
    conversationHistory[sender].push({
      role: 'assistant',
      content: bot_reply,
    });

    // Keep only last 20 messages to manage memory
    if (conversationHistory[sender].length > 20) {
      conversationHistory[sender] = conversationHistory[sender].slice(-20);
    }

    // Send reply via WhatsApp using MessageBird
    const params = {
      originator: process.env.MESSAGEBIRD_WHATSAPP_NUMBER,
      recipients: [sender],
      body: bot_reply,
      type: 'whatsapp',
    };

    mb.messages.create(params, (err, response) => {
      if (err) {
        console.error('MessageBird Error:', err);
        return;
      }
      console.log('Message sent successfully:', response);
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error:', error);
    
    // Try to send error message to user
    const errorParams = {
      originator: process.env.MESSAGEBIRD_WHATSAPP_NUMBER,
      recipients: [sender],
      body: 'Sorry, I encountered an error. Please try again.',
      type: 'whatsapp',
    };

    mb.messages.create(errorParams, (err) => {
      if (err) console.error('Error sending error message:', err);
    });

    res.status(500).send('Error processing message');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Willy WhatsApp Bot is running!' });
});

// Start server
app.listen(port, () => {
  console.log(`Willy WhatsApp Bot is running on port ${port}`);
  console.log(`Webhook ready at http://localhost:${port}/webhook`);
});