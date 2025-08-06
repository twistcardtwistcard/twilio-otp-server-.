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
const statusServerURL = process.env.TWIST_STATUS_SERVER_URL;
const getApiKey = process.env.GET_API_KEY;

const client = twilio(accountSid, authToken);

app.use(cors());
app.use(express.json());

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

app.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body;
  const formattedPhone = phone.startsWith('+') ? phone : '+' + phone;

  try {
    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: formattedPhone, code });

    if (check.status !== 'approved') {
      return res.json({ success: false });
    }

    // Fetch twist code middle digits
    const gmcResponse = await fetch(`${statusServerURL}/gmc?phone=${phone}`, {
      headers: {
        'x-api-key': getApiKey
      }
    });

    const gmcData = await gmcResponse.json();

    if (!gmcData.success) {
      return res.json({ success: true, middle4: null, message: 'Aucun code TWIST trouvé pour ce numéro.' });
    }

    res.json({ success: true, middle4: gmcData.middle4 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ OTP Server running on port ${port}`);
});
