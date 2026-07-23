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

  // 1. Extract Location & Pincode
  let pincode = '';
  const pincodeMatch = message.match(/\b\d{6}\b/);
  if (pincodeMatch) {
    pincode = pincodeMatch[0];
  }

  if (!criteria.location) {
    if (pincode) {
      criteria.location = pincode;
    } else {
      const locKeywords = ['pune', 'pcmc', 'lonavala', 'mumbai', 'navi mumbai', 'thane', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'kolkata', 'noida', 'gurgaon'];
      const foundLoc = locKeywords.find(loc => text.includes(loc));
      if (foundLoc) criteria.location = foundLoc.charAt(0).toUpperCase() + foundLoc.slice(1);
    }
  }

  // 2. Extract Product
  const BULK_CATALOGUE = [
    "peace lily", "rubber plant", "spider plant", "snake plant", "zz plant",
    "peperomia green", "syngonium confetti", "monstera broken heart",
    "fittonia red", "anthurium pink", "dieffenbachia camille",
    "peperomia obtusifolia", "money plant", "marble money",
    "golden money", "silver money", "jade plant", "philodendron ring of fire",
    "philodendron birkin", "black zz", "artificial plant", "car air vent",
    "refrigerator magnet", "dandelion seed", "pendant necklace", "plantable rakhi",
    "seed balls", "seed bottle", "seed card", "15 ml glass", "15ml glass",
    "5 ml glass", "5ml glass", "glass jars", "tealight candles", "cosmetic jars",
    "gift cards", "seeds card"
  ];

  if (!criteria.product) {
    const matchedCatalogItem = BULK_CATALOGUE.find(item => text.includes(item));
    if (matchedCatalogItem) {
      criteria.product = matchedCatalogItem.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } else if (text.length > 5 && !text.includes('budget') && !text.includes('cost') && !text.includes('timeline') && !text.includes('week') && !text.includes('day') && !text.includes('pincode') && !text.includes('location')) {
      criteria.product = message.substring(0, 50);
    }
  }

  // 3. Extract Quantity
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

  // 4. Extract Timeline
  if (!criteria.timeline) {
    if (text.includes('6-8') || text.includes('6 to 8') || text.includes('7 days') || text.includes('8 days') || text.includes('6 days') || (text.includes('week') && !text.includes('weeks'))) {
      criteria.timeline = '6-8 days';
    } else if (text.includes('immediate') || text.includes('now') || text.includes('asap') || text.includes('this week') || text.includes('today') || text.includes('1-2') || text.includes('1 day') || text.includes('2 days') || text.includes('3 days')) {
      criteria.timeline = 'Immediate (1-3 days)';
    } else if (text.includes('month') || text.includes('next month') || text.includes('weeks')) {
      criteria.timeline = 'Longer (1-2 months)';
    }
  }

  // 5. Extract Budget
  if (!criteria.budget) {
    const budgetMatch = message.match(/(\$\d+[\d,]*\s*(k|m|million)?|\d+\s*(usd|dollars|inr|rupees|rs))/i) 
      || text.match(/(budget|cost|price|pricing)\s*(is|around|about)?\s*(\d+[\d,]*)/i);
    if (budgetMatch) {
      criteria.budget = budgetMatch[0];
    } else if (text.includes('low') || text.includes('personal') || text.includes('hobby') || text.includes('cheap')) {
      criteria.budget = 'Under Rs. 1,000';
    }
  }

  // Extract Phone, Email, Name
  const phoneMatch = message.match(/(\+\d{1,4}[ -]?)?\d{3,4}[ -]?\d{3,4}[ -]?\d{3,9}/);
  if (phoneMatch && !phone) phone = phoneMatch[0].trim();

  const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && !email) email = emailMatch[0];

  const nameMatch = text.match(/(my name is|i am|this is|call me)\s+([a-zA-Z]+(\s+[a-zA-Z]+)?)/i);
  if (nameMatch && !name) name = nameMatch[2].replace(/\b\w/g, c => c.toUpperCase());

  // SCORING ENGINE (0-100)
  let score = 0;

  // Location Proximity (Up to 30 points)
  let locationScore = 0;
  if (criteria.location) {
    const locLower = criteria.location.toLowerCase();
    const isPunePincode = pincode && (pincode.startsWith('411') || pincode.startsWith('412'));
    const isMHPincode = pincode && (pincode.startsWith('400') || pincode.startsWith('410') || pincode.startsWith('413') || pincode.startsWith('414') || pincode.startsWith('415') || pincode.startsWith('416') || pincode.startsWith('421') || pincode.startsWith('422'));
    
    if (locLower.includes('pune') || locLower.includes('pcmc') || isPunePincode) {
      locationScore = 30; // Closer/Pune (High score)
    } else if (locLower.includes('mumbai') || locLower.includes('lonavala') || locLower.includes('thane') || isMHPincode) {
      locationScore = 15; // Semi-close (Moderate score)
    } else {
      locationScore = 0; // Far (Low score)
    }
  }
  score += locationScore;

  // Product Catalog Matching (Up to 30 points)
  let productScore = 0;
  if (criteria.product) {
    const prodLower = criteria.product.toLowerCase();
    const matchedCatalog = BULK_CATALOGUE.some(item => prodLower.includes(item));
    if (matchedCatalog) {
      productScore = 30; // Matches catalogue (Increased)
    } else {
      productScore = 0; // Other items (Decreased)
    }
  }
  score += productScore;

  // Timeline Proximity (Up to 20 points)
  let timelineScore = 0;
  if (criteria.timeline) {
    const timelineLower = criteria.timeline.toLowerCase();
    const isBest = timelineLower.includes('6-8') || timelineLower.includes('6 to 8') || timelineLower.includes('7 days') || timelineLower.includes('8 days') || timelineLower.includes('6 days') || (timelineLower.includes('week') && !timelineLower.includes('weeks'));
    if (isBest) {
      timelineScore = 20; // 6-8 days is best
    } else {
      timelineScore = 5; // Less or longer timeline decreases score
    }
  }
  score += timelineScore;

  // Contact Details (Up to 20 points)
  if (phone) score += 10;
  if (name) score += 5;
  if (email) score += 5;

  score = Math.min(score, 100);

  // Dialog tree logic (Strictly one question per reply, short and bulleted)
  let reply = '';
  if (!criteria.location) {
    reply = "- Thank you for starting the conversation.\n- What city or region are we shipping to, and what is your delivery pincode?";
  } else if (!criteria.product) {
    reply = "- Got your location.\n- Which plant varieties or sustainable gifting items from our catalogue would you like to source?";
  } else if (!criteria.quantity) {
    reply = `- Understood, you're interested in ${criteria.product}.\n- What is the approximate quantity or volume you are looking to purchase?`;
  } else if (!criteria.timeline) {
    reply = "- Thanks for specifying the quantity.\n- What is your target timeline for having these delivered? (Standard best delivery takes 6-8 days)";
  } else if (!criteria.budget) {
    reply = "- Thank you.\n- Do you have an estimated budget range allocated for this project?";
  } else {
    reply = `- Thank you, ${name || 'sir/ma\'am'}.\n- I have qualified your requirements with a score of ${score}%.\n- Our sales team will call you at ${phone || 'your phone number'} within 24 hours.`;
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
  const initialGreeting = "- Hello! I am the QualiFlow Botanical Assistant.\n- To start, what is your shipping city and delivery pincode?";

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
  const initialGreeting = "- Hello! I am the QualiFlow Botanical Assistant.\n- To start, what is your shipping city and delivery pincode?";
  
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

CRITICAL FORMATTING GUIDELINES:
- Every conversational message in "reply" MUST be very short and formatted in bullet points (using hyphens "- ").
- In each reply, you MUST ask EXACTLY ONE question. Do not ask multiple questions at once.
- The very first parameter you must prioritize gathering is the location and pincode. Ask for this first.

You must gather the following items:
1. Location and Pincode (Ask for this first).
2. Product interest. Must match or be relevant to our catalog.
3. Quantity (e.g. 500 pots, 20 plants).
4. Timeline (e.g., 6-8 days, immediate, 1 month).
5. Budget or annual spending range.

LEAD SCORING ENGINE RULES (0-100):
Calculate an overall qualification score (0-100) based on the following strict breakdown:
1. Product Proximity (Up to 30 points):
   - We prefer items from our Bulk Catalogues. If the product matches one of these bulk items, score +30 points. If they ask for anything else, score 0 points.
   - Bulk Catalogue items are:
     * Indoor Plants: Peace Lily Plant Sapling, Rubber Plant Sapling, Spider Plant Sapling, Snake Plant Sapling, ZZ Plant Sapling, Peperomia Green Plant Sapling, Syngonium Confetti Plant Sapling, Monstera Broken Heart Plant Sapling, Fittonia Red Plant Sapling, Anthurium Pink Plant Sapling, Dieffenbachia Camille Plant Sapling, Peperomia Obtusifolia Variegated Plant Sapling, Money Plant Sapling, Marble Money Plant Sapling, Golden Money Plant Sapling, Silver Money Plant Sapling, Jade Plant Sapling, Philodendron Ring of Fire Plant Sapling, Philodendron Birkin Plant Sapling, Rare Black ZZ Plant Sapling.
     * Sustainable Gifting: Artificial Plant Car Air Vent Clip / Magnet Refrigerator, Dandelion Seed Wish Pendant Necklace, Plantable Rakhi, Plantable Seed Balls, Sustainable Seed Bottle Gift Pack, Plantable Seed Card Gift Pack, 15 ml Glass Bottle with Cork, 5 ml Glass Bottle with Cork, Small Cute Glass Jars, Floating Tealight Candles, Italian Acrylic Cosmetic Jars with Clear Cap, Gift Cards, Seeds Card (Thank You), Seeds Card (Happy Birthday).
2. Location Proximity (Up to 30 points):
   - Pune Proximity: If the location is Pune, PCMC, or any pincode starting with "411" or "412", score +30 points (Closer).
   - Semi-Close Proximity: If the location is Mumbai, Navi Mumbai, Thane, Lonavala, or any pincode starting with "400", "410", "413", "414", "415", "416", "421", "422", score +15 points.
   - Far Proximity: Any other location or pincode outside Maharashtra (e.g. Delhi, Bangalore, Chennai, USA), score 0 points.
3. Timeline Proximity (Up to 20 points):
   - The absolute best timeline is "6-8 days". If the timeline is exactly 6-8 days (or 7 days), score +20 points.
   - Any other timeline (less than 6-8 days such as 1-5 days, immediate, asap, OR longer than that such as 1 month, 2 weeks, or unspecified), score +5 points.
4. Contact Details (Up to 20 points):
   - Phone (+10 points)
   - Name (+5 points)
   - Email (+5 points)

You MUST respond ONLY with a JSON object matching this schema:
{
  "reply": "Your next conversational message to the user, politely guiding them through the qualification steps (MUST be short, bulleted, and ask EXACTLY ONE question)",
  "score": 85, // Calculated qualification score based on rules above (0-100)
  "extractedData": {
    "name": "Extracted name (or empty string if not known)",
    "phone": "Extracted phone number (or empty string if not known)",
    "email": "Extracted email (or empty string if not known)",
    "company": "Extracted company/nursery name (or empty string if not known)",
    "criteria": {
      "product": "Extracted product/SKU name (or empty string)",
      "quantity": "Extracted quantity (or empty string)",
      "budget": "Extracted budget/pricing info (or empty string)",
      "timeline": "Extracted timeline info (or empty string)",
      "location": "Extracted city/region/country/pincode (or empty string)"
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
