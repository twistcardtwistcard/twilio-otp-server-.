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

// ✅ Format phone number in E.164 (expects digits or already +E164)
function formatPhoneNumber(phone) {
  const s = String(phone || '');
  if (s.startsWith('+')) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`; // fallback
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

// 🔹 VERIFY OTP -> ask status server for middle4 from latest loan by phone
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

    // Ask status server to map phone -> latest loan -> twistcode.middle4
    const encoded = encodeURIComponent(formattedPhone);
    const response = await fetch(`${process.env.TWIST_STATUS_SERVER_URL}/code/middle4-by-phone?phone=${encoded}`, {
      headers: {
        'x-api-key': process.env.GET_API_KEY
      }
    });

    const data = await response.json();

    if (!data.success) {
      return res.json({ success: false, message: data.message || 'Aucun code TWIST trouvé pour ce numéro.' });
    }

    return res.json({ success: true, middle4: data.middle4 });

  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Twilio OTP server running on port ${port}`);
});
