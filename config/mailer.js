const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const ADMIN_EMAIL = process.env.GMAIL_USER;

const sendAdminEmail = async (subject, htmlContent) => {
  try {
    await transporter.sendMail({
      from: `"Novlex Platform" <${ADMIN_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject,
      html: htmlContent,
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
};

const emailTemplates = {
  newUser: (user) => ({
    subject: '🎉 New User Registered — Novlex',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h2 style="color:#C9A84C;">New User Registered</h2>
        <p>A new user just joined Novlex!</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;color:#888;">Name</td><td style="padding:8px;color:#fff;font-weight:bold;">${user.fullName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Email</td><td style="padding:8px;color:#fff;">${user.email}</td></tr>
          <tr><td style="padding:8px;color:#888;">Phone</td><td style="padding:8px;color:#fff;">${user.phone || 'Not provided'}</td></tr>
          <tr><td style="padding:8px;color:#888;">Referral Code</td><td style="padding:8px;color:#C9A84C;">${user.referralCode}</td></tr>
          <tr><td style="padding:8px;color:#888;">Time</td><td style="padding:8px;color:#fff;">${new Date().toLocaleString('en-NG')}</td></tr>
        </table>
        <a href="https://novlex.com.ng/admin/dashboard.html" style="display:inline-block;margin-top:24px;background:#C9A84C;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">View Admin Panel</a>
      </div>`,
  }),

  newDeposit: (user, amount, txId) => ({
    subject: `💰 New Deposit Request — ₦${Number(amount).toLocaleString()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h2 style="color:#C9A84C;">New Deposit Request</h2>
        <p>A user has submitted a deposit request and is waiting for confirmation.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;color:#888;">User</td><td style="padding:8px;color:#fff;font-weight:bold;">${user.fullName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Email</td><td style="padding:8px;color:#fff;">${user.email}</td></tr>
          <tr><td style="padding:8px;color:#888;">Amount</td><td style="padding:8px;color:#22C55E;font-weight:bold;font-size:18px;">₦${Number(amount).toLocaleString()}</td></tr>
          <tr><td style="padding:8px;color:#888;">Reference</td><td style="padding:8px;color:#fff;">${txId}</td></tr>
          <tr><td style="padding:8px;color:#888;">Time</td><td style="padding:8px;color:#fff;">${new Date().toLocaleString('en-NG')}</td></tr>
        </table>
        <p style="color:#C9A84C;margin-top:16px;">⚠️ Check your Kuda app to verify the transfer, then approve or reject.</p>
        <a href="https://novlex.com.ng/admin/deposits.html" style="display:inline-block;margin-top:16px;background:#C9A84C;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Review Deposit</a>
      </div>`,
  }),

  proofUploaded: (user, amount, proofUrl) => ({
    subject: `📸 Payment Proof Uploaded — ₦${Number(amount).toLocaleString()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h2 style="color:#C9A84C;">Payment Proof Uploaded</h2>
        <p>${user.fullName} has uploaded their payment proof for ₦${Number(amount).toLocaleString()}.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;color:#888;">User</td><td style="padding:8px;color:#fff;font-weight:bold;">${user.fullName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Amount</td><td style="padding:8px;color:#22C55E;font-weight:bold;">₦${Number(amount).toLocaleString()}</td></tr>
          <tr><td style="padding:8px;color:#888;">Time</td><td style="padding:8px;color:#fff;">${new Date().toLocaleString('en-NG')}</td></tr>
        </table>
        ${proofUrl ? `<a href="${proofUrl}" style="display:inline-block;margin-top:16px;background:#1a1a1a;border:1px solid #C9A84C;color:#C9A84C;padding:12px 24px;border-radius:8px;text-decoration:none;">View Payment Proof</a>` : ''}
        <a href="https://novlex.com.ng/admin/deposits.html" style="display:inline-block;margin-top:16px;margin-left:12px;background:#C9A84C;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Approve / Reject</a>
      </div>`,
  }),

  newWithdrawal: (user, amount, bankDetails) => ({
    subject: `🔴 New Withdrawal Request — ₦${Number(amount).toLocaleString()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h2 style="color:#EF4444;">New Withdrawal Request</h2>
        <p>A user has requested a withdrawal. Send the money via Kuda then mark as sent.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;color:#888;">User</td><td style="padding:8px;color:#fff;font-weight:bold;">${user.fullName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Amount Requested</td><td style="padding:8px;color:#EF4444;font-weight:bold;font-size:18px;">₦${Number(amount).toLocaleString()}</td></tr>
          <tr><td style="padding:8px;color:#888;">They Receive</td><td style="padding:8px;color:#22C55E;font-weight:bold;">₦${Number(amount * 0.9).toLocaleString()}</td></tr>
          <tr><td style="padding:8px;color:#888;">Bank Name</td><td style="padding:8px;color:#fff;">${bankDetails.bankName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Account Number</td><td style="padding:8px;color:#C9A84C;font-weight:bold;font-size:16px;">${bankDetails.bankAccount}</td></tr>
          <tr><td style="padding:8px;color:#888;">Account Name</td><td style="padding:8px;color:#fff;">${bankDetails.bankAccountName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Time</td><td style="padding:8px;color:#fff;">${new Date().toLocaleString('en-NG')}</td></tr>
        </table>
        <a href="https://novlex.com.ng/admin/withdrawals.html" style="display:inline-block;margin-top:24px;background:#EF4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Process Withdrawal</a>
      </div>`,
  }),

  newInvestment: (user, planName, amount, dailyEarning) => ({
    subject: `📈 New Investment — ${planName} (₦${Number(amount).toLocaleString()})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:12px;">
        <h2 style="color:#22C55E;">New Investment Activated</h2>
        <p>A user has activated an investment plan on Novlex.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;color:#888;">User</td><td style="padding:8px;color:#fff;font-weight:bold;">${user.fullName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Plan</td><td style="padding:8px;color:#C9A84C;font-weight:bold;">${planName}</td></tr>
          <tr><td style="padding:8px;color:#888;">Amount</td><td style="padding:8px;color:#22C55E;font-weight:bold;font-size:18px;">₦${Number(amount).toLocaleString()}</td></tr>
          <tr><td style="padding:8px;color:#888;">Daily Earning</td><td style="padding:8px;color:#22C55E;">₦${Number(dailyEarning).toLocaleString()}/day</td></tr>
          <tr><td style="padding:8px;color:#888;">Duration</td><td style="padding:8px;color:#fff;">30 days</td></tr>
          <tr><td style="padding:8px;color:#888;">Time</td><td style="padding:8px;color:#fff;">${new Date().toLocaleString('en-NG')}</td></tr>
        </table>
        <a href="https://novlex.com.ng/admin/dashboard.html" style="display:inline-block;margin-top:24px;background:#C9A84C;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">View Dashboard</a>
      </div>`,
  }),
};

module.exports = { sendAdminEmail, emailTemplates };
