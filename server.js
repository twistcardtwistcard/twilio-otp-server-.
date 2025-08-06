require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
const twistApiKey = process.env.GET_API_KEY;

const client = twilio(accountSid, authToken);

app.use(cors());
app.use(express.json());

// ✅ Send OTP
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  try {
    const verification = await client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: phone, channel: 'sms' });

    res.json({ success: true, status: verification.status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ Verify OTP
app.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body;
  try {
    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: phone, code });

    res.json({ success: check.status === 'approved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔐 Get middle 4 digits of TWIST code securely by phone
app.get('/gmc', async (req, res) => {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Missing phone number' });
  }

  try {
    const response = await fetch(`https://twist-status-server.onrender.com/check-latest?phone=${phone}`, {
      headers: {
        'x-api-key': twistApiKey
      }
    });

    const data = await response.json();

    if (data.code && data.code.length === 12) {
      const middle4 = data.code.substring(4, 8);
      res.json({ success: true, middle4 });
    } else {
      res.status(404).json({ success: false, message: 'Code not found' });
    }
  } catch (err) {
    console.error('Error fetching twist code:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
