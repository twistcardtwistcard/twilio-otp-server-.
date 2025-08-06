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

// ✅ Format phone number in E.164
function formatPhoneNumber(phone) {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

// 🔹 SEND OTP
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  const formattedPhone = formatPhoneNumber(phone);

  try {
    const verification = await client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: formattedPhone, channel: 'sms' });

    res.json({ success: true, status: verification.status });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔹 VERIFY OTP + FETCH 4 MIDDLE DIGITS OF TWIST CODE
app.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body;
  const formattedPhone = formatPhoneNumber(phone);

  try {
    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: formattedPhone, code });

    console.log('✅ Twilio verification result:', check);

    if (check.status !== 'approved') {
      return res.json({ success: false, error: 'Code invalide.' });
    }

    // Fetch latest status entry from twist-status-server
    const response = await fetch(`${process.env.TWIST_STATUS_SERVER_URL}/check-latest?phone=${phone}`, {
      headers: {
        'x-api-key': process.env.GET_API_KEY
      }
    });

    const data = await response.json();

    if (!data.code) {
      return res.json({ success: false, message: 'Aucun code TWIST trouvé pour ce numéro.' });
    }

    const codeStr = data.code.toString();
    const middle4 = codeStr.slice(4, 8);

    return res.json({ success: true, middle4 });

  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Twilio OTP server running on port ${port}`);
});
