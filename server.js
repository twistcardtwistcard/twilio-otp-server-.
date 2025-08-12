require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

app.use(cors());
app.use(express.json());

// Serve static files (e.g., a simple test page if you have one here)
app.use(express.static(path.join(__dirname)));

// ------------ Helpers ------------
/** Normalize to E.164 (Canada/US): +1########## using the last 10 digits */
function normalizeE164CA(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `+1${last10}` : null;
}
/** Last 10 digits (useful for fuzzy matching in twist-status logs) */
function last10(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

// ------------ Health ------------
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ------------ SEND OTP ------------
app.post('/send-otp', async (req, res) => {
  try {
    const norm = normalizeE164CA(req.body && req.body.phone);
    if (!norm) return res.status(400).json({ success: false, error: 'invalid_phone' });

    const verification = await client.verify.v2.services(serviceSid)
      .verifications
      .create({ to: norm, channel: 'sms' });

    return res.json({ success: true, status: verification.status, phone: norm });
  } catch (err) {
    console.error('Send OTP error:', err);
    return res.status(500).json({ success: false, error: err.message || 'send_failed' });
  }
});

// ------------ VERIFY OTP (OTP-ONLY) ------------
app.post('/verify-otp', async (req, res) => {
  try {
    const norm = normalizeE164CA(req.body && req.body.phone);
    const code = String((req.body && req.body.code) || '').trim();

    if (!norm) return res.status(400).json({ success: false, error: 'invalid_phone' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ success: false, error: 'invalid_code_format' });

    const check = await client.verify.v2.services(serviceSid)
      .verificationChecks
      .create({ to: norm, code });

    console.log('✅ Twilio verification result:', { to: norm, status: check.status });

    if (check.status !== 'approved') {
      return res.json({ success: false, error: 'invalid_or_expired_code' });
    }

    // IMPORTANT: OTP success is returned independently of TWIST.
    // If you still want to *optionally* include the middle4 (when available), you can fetch it here,
    // but do not fail OTP if not found. (Uncomment if you want inline enrichment.)
    //
    // let twist_middle4 = null;
    // try {
    //   const resp = await fetch(`${process.env.TWIST_STATUS_SERVER_URL}/check-latest?phone=${last10(norm)}`, {
    //     headers: { 'x-api-key': process.env.GET_API_KEY }
    //   });
    //   if (resp.ok) {
    //     const data = await resp.json();
    //     if (data && data.code) {
    //       const s = String(data.code);
    //       twist_middle4 = s.length >= 8 ? s.slice(4, 8) : null;
    //     }
    //   }
    // } catch (_) {}

    return res.json({
      success: true,
      phone: norm
      // , twist_middle4  // ← include this if you left the enrichment block enabled
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, error: err.message || 'verify_failed' });
  }
});

// ------------ (NEW) TWIST middle4 helper (separate from OTP) ------------
/**
 * GET /twist-middle4?phone=<any format>
 * Returns { success:true, middle4: "1234" } if found, otherwise { success:false, error: ... }
 *
 * This endpoint looks up the latest log entry in your twist-status-server for the given phone.
 * We pass the **last 10 digits** to maximize matches against logged "+1##########".
 */
app.get('/twist-middle4', async (req, res) => {
  try {
    const phoneParam = req.query && req.query.phone;
    const digits10 = last10(phoneParam);
    if (digits10.length !== 10) {
      return res.status(400).json({ success: false, error: 'invalid_phone' });
    }

    const url = `${process.env.TWIST_STATUS_SERVER_URL}/check-latest?phone=${digits10}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': process.env.GET_API_KEY }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(response.status).json({ success: false, error: 'twist_lookup_failed', details: text });
    }

    const data = await response.json().catch(() => ({}));
    if (!data || !data.code) {
      return res.json({ success: false, error: 'no_twist_code_for_phone' });
    }

    const codeStr = String(data.code);
    if (codeStr.length < 8) {
      return res.json({ success: false, error: 'invalid_twist_code_length' });
    }

    const middle4 = codeStr.slice(4, 8);
    return res.json({ success: true, middle4 });
  } catch (err) {
    console.error('twist-middle4 error:', err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.listen(port, () => {
  console.log(`✅ Twilio OTP server running on port ${port}`);
});
