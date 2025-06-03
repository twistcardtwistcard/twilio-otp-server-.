
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

app.use(cors());
app.use(express.json());

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
