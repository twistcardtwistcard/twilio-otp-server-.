require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

app.use(cors());
app.use(express.json());

// Serve static files like otp-form.html
app.use(express.static(path.join(__dirname)));

// --- SEND OTP ---
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;

  try {
    const verification = await client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: formattedPhone, channel: 'sms' });

    res.json({ success: true, status: verification.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- VERIFY OTP ---
app.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body;
  const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;

  try {
    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: formattedPhone, code });

    if (check.status !== 'approved') {
      return res.json({ success: false, error: 'OTP non valide.' });
    }

    // Fetch TWIST code from status server
    const response = await fetch(`${process.env.TWIST_STATUS_SERVER_URL}/check-latest?phone=${phone}`, {
      headers: {
        'x-api-key': process.env.GET_API_KEY
      }
    });

    const data = await response.json();

    if (!data.code) {
      return res.json({ success: false, message: 'Aucun code TWIST trouvé pour ce numéro.' });
    }

    const code = data.code.toString();
    const middle4 = code.slice(4, 8); // Get the 4 middle digits of the 12-digit code

    return res.json({ success: true, middle4 });

  } catch (err) {
    console.error('OTP verification failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ Twilio OTP server running on port ${port}`);
});
