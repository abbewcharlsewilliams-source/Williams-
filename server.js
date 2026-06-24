const express = require('express');
const twilio = require('twilio');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

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
  const incoming_msg = req.body.Body;
  const sender = req.body.From;

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

    // Keep only last 10 messages to manage memory
    if (conversationHistory[sender].length > 20) {
      conversationHistory[sender] = conversationHistory[sender].slice(-20);
    }

    // Send reply via WhatsApp
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: sender,
      body: bot_reply,
    });

    res.status(200).send('Message sent successfully');
  } catch (error) {
    console.error('Error:', error);
    
    // Send error message to user
    await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: sender,
      body: 'Sorry, I encountered an error. Please try again.',
    });

    res.status(500).send('Error processing message');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Bot is running!' });
});

// Start server
app.listen(port, () => {
  console.log(`Willy WhatsApp Bot is running on port ${port}`);
});