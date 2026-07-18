import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Set up PostgreSQL Pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Neon DB connections
  }
});

// Test DB connection and run migrations
const initializeDatabase = async () => {
  try {
    const client = await pool.connect();
    console.log('✓ Successfully connected to Neon DB PostgreSQL!');
    
    // Create leads table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        phone VARCHAR(30),
        email VARCHAR(100),
        company VARCHAR(100),
        status VARCHAR(20) DEFAULT 'Pending',
        score INTEGER DEFAULT 0,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        criteria JSONB DEFAULT '{}'::jsonb
      );
    `);
    
    // Add visitor_id column if not exists
    await client.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(50);
    `);
    console.log('✓ leads table visitor_id migration verified.');

    // Create chat_messages table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        lead_id VARCHAR(50) REFERENCES leads(id) ON DELETE CASCADE,
        sender VARCHAR(10) NOT NULL,
        message_text TEXT NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ chat_messages table verified.');

    client.release();
  } catch (err) {
    console.error('✗ Database initialization failed:', err.message);
  }
};

// ----------------------------------------------------
// Smart Local Fallback qualification logic
// ----------------------------------------------------
const generateLocalFallbackResponse = (message, history, currentLead) => {
  const text = message.toLowerCase();
  const criteria = { ...currentLead.criteria };
  let name = currentLead.name || '';
  let phone = currentLead.phone || '';
  let email = currentLead.email || '';
  let company = currentLead.company || '';

  // Extract Product
  if (!criteria.product) {
    if (text.includes('coir pot') || text.includes('pot') || text.includes('pots')) {
      criteria.product = '4 Inch Coir Pot (1pc) (TA100438)';
    } else if (text.includes('amaryllis') || text.includes('lily') || text.includes('bulb') || text.includes('bulbs')) {
      criteria.product = 'Amaryllis & Rain Lily Bulbs Combo (TA101109)';
    } else if (text.includes('betel') || text.includes('paan') || text.includes('betel paan')) {
      criteria.product = 'Betel Paan Sapling (TA100483)';
    } else if (text.includes('jasmine') || text.includes('jasmin')) {
      criteria.product = 'Arabian Jasmine Plant Sapling (TA100579)';
    } else if (text.includes('garden kit') || text.includes('kit') || text.includes('kits')) {
      criteria.product = text.includes('pro') ? "Beginner's Pro Garden Kit (TA100025)" : "Beginner's Basic Garden Kit (TA100023)";
    } else if (text.includes('bottle') || text.includes('cork')) {
      criteria.product = '15ml Glass Bottle with Cork (TA100001)';
    } else if (text.includes('comb') || text.includes('wooden comb')) {
      criteria.product = 'Anti Hairfall Neem Wooden Comb (TA100009)';
    } else if (text.includes('palm') || text.includes('areca')) {
      criteria.product = 'Areca Palm Sapling (TA100482)';
    } else if (text.includes('seeds') || text.includes('seed')) {
      criteria.product = text.includes('adenium') ? 'Adenium Seeds (TA100379)' : 'All Season Veggies Seeds Pack (TA100004)';
    } else if (text.length > 5 && !text.includes('budget') && !text.includes('cost') && !text.includes('timeline') && !text.includes('month') && !text.includes('phone') && !text.includes('+')) {
      criteria.product = message.substring(0, 50);
    }
  }

  // Extract Budget
  if (!criteria.budget) {
    const budgetMatch = message.match(/(\$\d+[\d,]*\s*(k|m|million)?|\d+\s*(usd|dollars|inr|rupees|rs))/i) 
      || text.match(/(budget|cost|price|pricing)\s*(is|around|about)?\s*(\d+[\d,]*)/i);
    if (budgetMatch) {
      criteria.budget = budgetMatch[0];
    } else if (text.includes('low') || text.includes('personal') || text.includes('hobby') || text.includes('cheap')) {
      criteria.budget = 'Under Rs. 1,000';
    } else if (text.includes('no budget') || text.includes('don\'t have')) {
      criteria.budget = 'None / Unspecified';
    }
  }

  // Extract Quantity
  if (!criteria.quantity) {
    const qtyMatch = message.match(/(\d+)\s*(units|pots|saplings|bulbs|packs|items|kits|seeds)?/i)
      || text.match(/(qty|quantity|scale|amount|how many)\s*(is|about)?\s*(\d+)/i);
    if (qtyMatch) {
      criteria.quantity = qtyMatch[0];
    } else if (text.includes('small') || text.includes('just one') || text.includes('single')) {
      criteria.quantity = '1 Unit';
    } else if (text.includes('bulk') || text.includes('nursery') || text.includes('hundreds') || text.includes('thousands')) {
      criteria.quantity = 'Bulk order (Nursery/Commercial)';
    }
  }

  // Extract Timeline
  if (!criteria.timeline) {
    if (text.includes('immediate') || text.includes('now') || text.includes('asap') || text.includes('this week') || text.includes('today')) {
      criteria.timeline = 'Immediate (under 30 days)';
    } else if (text.includes('month') || text.includes('next month') || text.includes('weeks')) {
      criteria.timeline = 'Short-term (1-2 months)';
    } else if (text.includes('season') || text.includes('planting season') || text.includes('monsoon') || text.includes('spring')) {
      criteria.timeline = 'Seasonal (based on planting cycle)';
    } else if (text.includes('research') || text.includes('looking') || text.includes('no rush') || text.includes('future')) {
      criteria.timeline = 'Research / Planning';
    }
  }

  // Extract Phone, Email, Name
  const phoneMatch = message.match(/(\+\d{1,4}[ -]?)?\d{3,4}[ -]?\d{3,4}[ -]?\d{3,9}/);
  if (phoneMatch && !phone) phone = phoneMatch[0].trim();

  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && !email) email = emailMatch[0];

  const nameMatch = text.match(/(my name is|i am|this is|call me)\s+([a-zA-Z]+(\s+[a-zA-Z]+)?)/i);
  if (nameMatch && !name) name = nameMatch[2].replace(/\b\w/g, c => c.toUpperCase());

  if (!criteria.location) {
    const locKeywords = ['bangalore', 'mumbai', 'delhi', 'pune', 'chennai', 'hyderabad', 'kolkata', 'noida', 'gurgaon', 'kerala'];
    const foundLoc = locKeywords.find(loc => text.includes(loc));
    if (foundLoc) criteria.location = foundLoc.charAt(0).toUpperCase() + foundLoc.slice(1);
  }

  if (!company) {
    const compMatch = text.match(/(work at|nursery name is|nursery|garden center|company)\s+([a-zA-Z0-9\s.]{3,30})/i);
    if (compMatch) company = compMatch[2].trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  // Calculate Score
  let score = 0;
  if (criteria.product) score += 15;
  if (criteria.quantity) {
    score += 15;
    if (criteria.quantity.toLowerCase().includes('bulk') || criteria.quantity.toLowerCase().includes('hundreds') || parseInt(criteria.quantity) > 50) {
      score += 10;
    }
  }
  if (criteria.budget) {
    score += 20;
    const cleanBudget = criteria.budget.replace(/[^0-9]/g, '');
    if (cleanBudget && (parseInt(cleanBudget, 10) >= 5000 || criteria.budget.toLowerCase().includes('k'))) {
      score += 10;
    }
  }
  if (criteria.timeline) {
    score += 15;
    if (criteria.timeline.toLowerCase().includes('immediate') || criteria.timeline.toLowerCase().includes('now')) {
      score += 15;
    }
  }
  if (phone) score += 10;
  if (name) score += 5;
  if (email) score += 5;

  score = Math.min(score, 100);

  // Qualify dialogue tree
  let reply = '';
  const isGreeting = text.match(/\b(hi|hello|hey|greetings|good morning|namaste)\b/);

  if (isGreeting && history.length <= 1) {
    reply = "Hello! I am the QualiFlow lead qualification assistant. I'm here to understand your requirements and pass them to our gardening sales specialists. What plant varieties, seeds, or gardening accessories are you interested in?";
  } else if (!criteria.product) {
    reply = "I understand you are interested in gardening supplies. Which specific products (seeds, coir pots, lily bulbs, betel paan saplings, or garden kits) are you looking to source?";
  } else if (!criteria.quantity) {
    reply = `Got it, you're interested in ${criteria.product}. To help qualify your request, what is the approximate quantity or volume you are looking to purchase?`;
  } else if (!criteria.budget) {
    reply = "Thank you. Do you have an estimated budget range allocated for this gardening/nursery project?";
  } else if (!criteria.timeline) {
    reply = "Understood. What is your target timeline or planting season for having these delivered?";
  } else if (!name && !phone) {
    reply = "Perfect, I have collected your primary gardening requirements. To pass this profile over to our sales team so they can call you directly, could you please share your full name, location, and phone number?";
  } else if (!phone) {
    reply = `Thanks ${name || 'there'}! May I also get your direct contact number so our sales specialist can call you?`;
  } else if (!criteria.location) {
    reply = "Thank you. And which city or region should we ship these botanical items to?";
  } else {
    reply = `Thank you, ${name || 'sir/ma\'am'}. I have successfully qualified your requirements. Our sales team will review this and call you directly at ${phone || 'your phone number'} within 24 hours to coordinate shipping. Have a wonderful day!`;
  }

  return {
    reply,
    score,
    extractedData: { name, phone, email, company, criteria }
  };
};

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------



// 1b. Look Up or Create Lead by Phone/Email (Pre-Chat Lead Form)
app.post('/api/leads/lookup', async (req, res) => {
  const { name, phone, email, visitorId } = req.body;
  const initialGreeting = "Hello! I am the QualiFlow lead qualification assistant. I'm here to understand your requirements and pass them to our gardening sales specialists. What plant varieties, seeds, or gardening accessories are you interested in?";

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  const cleanPhone = phone.trim();
  const cleanEmail = email ? email.trim() : '';

  try {
    // 1. Query for existing lead by phone or email
    let query = `SELECT * FROM leads WHERE (phone = $1 AND phone != '')`;
    let params = [cleanPhone];

    if (cleanEmail) {
      query += ` OR (email = $2 AND email != '')`;
      params.push(cleanEmail);
    }
    
    query += ` ORDER BY timestamp DESC LIMIT 1`;

    const lookupRes = await pool.query(query, params);

    if (lookupRes.rows.length > 0) {
      // Returning user found!
      const lead = lookupRes.rows[0];
      
      // Update details if they were empty but are now provided
      let updatedName = lead.name || name || '';
      let updatedEmail = lead.email || cleanEmail;
      
      if (updatedName !== lead.name || updatedEmail !== lead.email) {
        await pool.query(
          `UPDATE leads SET name = $1, email = $2 WHERE id = $3`,
          [updatedName, updatedEmail, lead.id]
        );
        lead.name = updatedName;
        lead.email = updatedEmail;
      }

      // Fetch message history for this lead
      const messagesRes = await pool.query(
        'SELECT sender, message_text as text, timestamp FROM chat_messages WHERE lead_id = $1 ORDER BY id ASC',
        [lead.id]
      );

      return res.json({
        ...lead,
        transcript: messagesRes.rows
      });
    }

    // 2. New user! Create a new lead row
    const leadId = `lead-${Date.now()}`;
    const initialScore = 15; // Starting score for providing Name and Phone!

    await pool.query(
      `INSERT INTO leads (id, visitor_id, name, phone, email, company, status, score, criteria) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        leadId,
        visitorId || null,
        name || '',
        cleanPhone,
        cleanEmail,
        '',
        'Pending',
        initialScore,
        JSON.stringify({ product: '', quantity: '', budget: '', timeline: '', location: '' })
      ]
    );

    await pool.query(
      `INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)`,
      [leadId, 'bot', initialGreeting]
    );

    res.status(201).json({
      id: leadId,
      visitor_id: visitorId || null,
      name: name || '',
      phone: cleanPhone,
      email: cleanEmail,
      company: '',
      status: 'Pending',
      score: initialScore,
      timestamp: new Date().toISOString(),
      criteria: { product: '', quantity: '', budget: '', timeline: '', location: '' },
      transcript: [{ sender: 'bot', text: initialGreeting }]
    });
  } catch (err) {
    console.error('Error during lead lookup:', err);
    res.status(500).json({ error: 'Failed to look up or create lead.' });
  }
});

// 1. Create a New Lead Chat Session
app.post('/api/leads', async (req, res) => {
  const { visitorId } = req.body;
  const leadId = `lead-${Date.now()}`;
  const initialGreeting = "Hello! I am the QualiFlow lead qualification assistant. I'm here to understand your requirements and pass them to our gardening sales specialists. What plant varieties, seeds, or gardening accessories are you interested in?";
  
  try {
    let existingName = '';
    let existingPhone = '';
    let existingEmail = '';
    let existingCompany = '';
    let location = '';

    if (visitorId) {
      const profileRes = await pool.query(
        `SELECT name, phone, email, company, criteria->>'location' as location 
         FROM leads 
         WHERE visitor_id = $1 AND name IS NOT NULL AND name != '' 
         ORDER BY timestamp DESC LIMIT 1`,
        [visitorId]
      );
      if (profileRes.rows.length > 0) {
        const row = profileRes.rows[0];
        existingName = row.name || '';
        existingPhone = row.phone || '';
        existingEmail = row.email || '';
        existingCompany = row.company || '';
        location = row.location || '';
      }
    }

    await pool.query(
      `INSERT INTO leads (id, visitor_id, name, phone, email, company, status, score, criteria) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        leadId, 
        visitorId || null, 
        existingName, 
        existingPhone, 
        existingEmail, 
        existingCompany, 
        'Pending', 
        0, 
        JSON.stringify({ product: '', quantity: '', budget: '', timeline: '', location: location })
      ]
    );

    await pool.query(
      `INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)`,
      [leadId, 'bot', initialGreeting]
    );

    res.status(201).json({
      id: leadId,
      visitor_id: visitorId || null,
      name: existingName,
      phone: existingPhone,
      email: existingEmail,
      company: existingCompany,
      status: 'Pending',
      score: 0,
      timestamp: new Date().toISOString(),
      criteria: { product: '', quantity: '', budget: '', timeline: '', location: location },
      transcript: [{ sender: 'bot', text: initialGreeting }]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create new lead chat.' });
  }
});

// 2. Get All Leads (Admin Feed - Grouped by Visitor ID)
app.get('/api/leads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (COALESCE(visitor_id, id)) *
        FROM leads
        ORDER BY COALESCE(visitor_id, id), timestamp DESC
      ) AS unique_leads
      ORDER BY timestamp DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leads.' });
  }
});

// 3. Get All Chat Sessions for a Visitor
app.get('/api/leads/visitor/:visitorId/sessions', async (req, res) => {
  const { visitorId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, score, timestamp, criteria, status 
       FROM leads 
       WHERE visitor_id = $1 
       ORDER BY timestamp DESC`,
      [visitorId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visitor sessions.' });
  }
});

// 3. Get Detailed Lead & Message History
app.get('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    const messagesResult = await pool.query(
      'SELECT sender, message_text as text, timestamp FROM chat_messages WHERE lead_id = $1 ORDER BY id ASC',
      [id]
    );

    const lead = leadResult.rows[0];
    res.json({
      ...lead,
      transcript: messagesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lead details.' });
  }
});

// 4. Send Message & Run Qualification (Local or Gemini)
app.post('/api/leads/:id/messages', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    // 1. Insert User message
    await pool.query(
      'INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)',
      [id, 'user', text]
    );

    // 2. Fetch Lead profile & full transcript history
    const leadResult = await pool.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    const currentLead = leadResult.rows[0];

    const messagesResult = await pool.query(
      'SELECT sender, message_text as text FROM chat_messages WHERE lead_id = $1 ORDER BY id ASC',
      [id]
    );
    const history = messagesResult.rows;

    let reply = '';
    let score = currentLead.score;
    let extracted = {
      name: currentLead.name || '',
      phone: currentLead.phone || '',
      email: currentLead.email || '',
      company: currentLead.company || '',
      criteria: currentLead.criteria || {}
    };

    const hasGeminiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '';

    if (hasGeminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-3.1-flash-lite",
          generationConfig: { responseMimeType: "application/json" }
        });

        const systemInstruction = `
You are a lead qualification agent named "QualiFlow Botanical Assistant". Your sole task is to carry a polite conversation with a user to qualify their gardening requirements for our sales team.
You are NOT a sales rep trying to sell actively. Your purpose is to gather details, structure them, and pass them along.

You must gather the following items:
1. Product interest. Must match or be relevant to our catalog (seeds, bulbs, coir pots, betel paan, jasmine saplings, garden kits, Neem wooden combs).
2. Quantity, scale, or count (e.g. 500 pots, 20 garden kits).
3. Budget or annual spending range (critical).
4. Timeline (e.g., Immediate, planting season, 1-3 months).
5. Lead's Name and Phone Number (CRITICAL: Sales team will call them).
6. Location (City, country).

Guidelines:
- Start with a polite greeting if applicable.
- Ask questions naturally. Do not interrogate. Ask 1-2 questions at a time.
- If the user provides info, acknowledge and ask for the next missing piece.
- Calculate an overall qualification score (0-100) based on conversion likelihood. Large nursery setups, bulk quantities, commercial landscaping, and immediate timelines should receive high scores (>70%). Vague personal hobby inquiries with no budget should receive low scores (<40%).

You MUST respond ONLY with a JSON object matching this schema:
{
  "reply": "Your next conversational message to the user, politely guiding them through the qualification steps",
  "score": 85, // Current calculated qualification score (integer 0-100)
  "extractedData": {
    "name": "Extracted name (or empty string if not known)",
    "phone": "Extracted phone number (or empty string if not known)",
    "email": "Extracted email (or empty string if not known)",
    "company": "Extracted nursery/company name (or empty string if not known)",
    "criteria": {
      "product": "Extracted product/SKU name (or empty string)",
      "quantity": "Extracted quantity/scale (or empty string)",
      "budget": "Extracted budget/pricing info (or empty string)",
      "timeline": "Extracted timeline info (or empty string)",
      "location": "Extracted city/region/country (or empty string)"
    }
  }
}

Current known parameters:
- Name: "${currentLead.name || ''}"
- Phone: "${currentLead.phone || ''}"
- Email: "${currentLead.email || ''}"
- Company: "${currentLead.company || ''}"
- Product: "${currentLead.criteria?.product || ''}"
- Quantity: "${currentLead.criteria?.quantity || ''}"
- Budget: "${currentLead.criteria?.budget || ''}"
- Timeline: "${currentLead.criteria?.timeline || ''}"
- Location: "${currentLead.criteria?.location || ''}"
`;

        const firstUserIndex = history.findIndex(msg => msg.sender === 'user');
        const geminiHistory = (firstUserIndex === -1 ? [] : history.slice(firstUserIndex, -1)).map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        }));

        const chat = model.startChat({ history: geminiHistory });
        const promptText = `${systemInstruction}\n\nUser Message: "${text}"\nAnalyze the conversation, extract variables, compute the score, and generate your conversational response in the JSON structure.`;

        const result = await chat.sendMessage(promptText);
        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);

        reply = parsed.reply;
        score = parsed.score;
        extracted = {
          name: parsed.extractedData.name || currentLead.name,
          phone: parsed.extractedData.phone || currentLead.phone,
          email: parsed.extractedData.email || currentLead.email,
          company: parsed.extractedData.company || currentLead.company,
          criteria: { ...currentLead.criteria, ...parsed.extractedData.criteria }
        };
      } catch (geminiErr) {
        console.error('Gemini API Error, falling back:', geminiErr);
        const fallback = generateLocalFallbackResponse(text, history, currentLead);
        reply = `[Gemini API Error: ${geminiErr.message}. Local Assistant fallback active]\n\n` + fallback.reply;
        score = fallback.score;
        extracted = fallback.extractedData;
      }
    } else {
      // Local fallback
      const fallback = generateLocalFallbackResponse(text, history, currentLead);
      reply = fallback.reply;
      score = fallback.score;
      extracted = fallback.extractedData;
    }

    // 3. Insert Bot response
    await pool.query(
      'INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)',
      [id, 'bot', reply]
    );

    // 4. Update Lead profile
    const threshold = 70; // Default threshold, updates status if score passes threshold
    const finalStatus = score >= threshold ? 'Qualified' : currentLead.status;

    await pool.query(
      `UPDATE leads SET name = $1, phone = $2, email = $3, company = $4, score = $5, status = $6, criteria = $7 WHERE id = $8`,
      [extracted.name, extracted.phone, extracted.email, extracted.company, score, finalStatus, JSON.stringify(extracted.criteria), id]
    );

    res.json({
      id,
      name: extracted.name,
      phone: extracted.phone,
      email: extracted.email,
      company: extracted.company,
      score,
      status: finalStatus,
      criteria: extracted.criteria,
      reply
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process message.' });
  }
});

// 5. Update Lead Status (Qualified, Pending, Archived)
app.post('/api/leads/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  try {
    await pool.query('UPDATE leads SET status = $1 WHERE id = $2', [status, id]);
    res.json({ success: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// 6. Admin Authentication Route
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
  }
});

// 7. Seed Sandbox Mock Leads
app.post('/api/admin/seed', async (req, res) => {
  const { type } = req.body;
  const randomId = Math.floor(Math.random() * 10000);

  if (type === 'hot') {
    const leadId = `lead-hot-${randomId}`;
    const criteria = {
      product: 'Areca Palm Sapling (Pack of 7) (TA101103)',
      quantity: '500 Packs (3500 Saplings)',
      budget: 'Rs. 2,40,000',
      timeline: 'Immediate (before Monsoon)',
      location: 'Pune, India'
    };
    
    try {
      await pool.query(
        `INSERT INTO leads (id, name, phone, email, company, status, score, criteria) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [leadId, 'Bruce Wayne', '+91 99887 76655', 'bruce@waynebotanicals.in', 'Wayne Botanical Nursery', 'Qualified', 95, JSON.stringify(criteria)]
      );

      const msgs = [
        { s: 'bot', t: 'Hello! I am the QualiFlow lead qualification assistant. I\'m here to understand your requirements and pass them to our gardening sales specialists.' },
        { s: 'user', t: 'Hello, we are doing commercial landscaping for a corporate park in Pune. We need to buy around 3,500 Areca Palms.' },
        { s: 'bot', t: 'That is a wonderful project! We have Areca Palm Saplings available in Packs of 7. To help qualify your request, what is your approximate budget and timeline?' },
        { s: 'user', t: 'We have Rs. 2,50,000 allocated. We need them delivered immediately, before the monsoon season starts in Pune.' },
        { s: 'bot', t: 'Excellent. May I get your name and direct phone number so our team can follow up?' },
        { s: 'user', t: 'Yes, I am Bruce Wayne, contact me at +91 99887 76655. Email is bruce@waynebotanicals.in.' }
      ];

      for (const m of msgs) {
        await pool.query(
          'INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)',
          [leadId, m.s, m.t]
        );
      }
      res.json({ success: true, leadId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to seed hot lead.' });
    }
  } else {
    const leadId = `lead-cold-${randomId}`;
    const criteria = {
      product: '5ml Glass Bottle with Cork (TA100003)',
      quantity: '1 Unit',
      budget: 'Rs. 49',
      timeline: 'No rush',
      location: 'Chennai, India'
    };

    try {
      await pool.query(
        `INSERT INTO leads (id, name, phone, email, company, status, score, criteria) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [leadId, 'Bob Smith', '', 'bob@gmail.com', '', 'Pending', 15, JSON.stringify(criteria)]
      );

      const msgs = [
        { s: 'bot', t: 'Hello! I am the QualiFlow lead qualification assistant. I\'m here to understand your requirements.' },
        { s: 'user', t: 'Do you sell glass bottles?' },
        { s: 'bot', t: 'Yes, we have 5ml Glass Bottles with Cork. What is your estimated quantity and budget?' },
        { s: 'user', t: 'Just need 1 piece for a home science project. Budget is Rs. 50. No rush.' }
      ];

      for (const m of msgs) {
        await pool.query(
          'INSERT INTO chat_messages (lead_id, sender, message_text) VALUES ($1, $2, $3)',
          [leadId, m.s, m.t]
        );
      }
      res.json({ success: true, leadId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to seed cold lead.' });
    }
  }
});

// 8. Wipe Database Tables
app.post('/api/admin/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_messages');
    await pool.query('DELETE FROM leads');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear database.' });
  }
});

// Serve static assets in production
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html for any request that doesn't match an API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Database and then Listen
const startServer = async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`✓ Backend server running on http://localhost:${PORT}`);
  });
};

startServer();
