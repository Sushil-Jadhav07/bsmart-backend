const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';
const YEAR = new Date().getFullYear();

const baseTemplate = (content, accentColor = '#4F46E5') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>B-Smart</title>
</head>
<body style="margin:0;padding:0;background:#f2f2f7;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:36px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);max-width:600px;width:100%;">
          <tr>
            <td style="background:${accentColor};padding:28px 36px;">
              <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:1.5px;">B-Smart</span>
              <span style="color:rgba(255,255,255,0.55);font-size:13px;margin-left:10px;">Smart Advertising Platform</span>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 36px 28px;">${content}</td>
          </tr>
          <tr>
            <td style="background:#f8f8fb;padding:20px 36px;border-top:1px solid #ebebf0;">
              <p style="margin:0 0 6px;color:#aaaaaa;font-size:12px;text-align:center;">
                &copy; ${YEAR} B-Smart. All rights reserved.
              </p>
              <p style="margin:0;color:#999999;font-size:11px;text-align:center;">
                You received this email because of activity on your B-Smart account.<br />
                If this was not you, please <a href="${CLIENT}/support" style="color:#777777;">contact support</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const btn = (label, href, color = '#4F46E5') =>
  `<div style="text-align:center;margin:28px 0;">
    <a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
      ${label}
    </a>
  </div>`;

const infoBox = (content, bgColor = '#f0f0ff', borderColor = '#4F46E5') =>
  `<div style="background:${bgColor};border-left:4px solid ${borderColor};border-radius:8px;padding:20px 24px;margin:24px 0;">
    ${content}
  </div>`;

const divider = () => `<div style="border-top:1px solid #ebebf0;margin:24px 0;"></div>`;

const kvRow = (label, value) =>
  `<tr>
    <td style="padding:7px 0;color:#888888;font-size:13px;width:50%;">${label}</td>
    <td style="padding:7px 0;color:#1a1a1a;font-size:13px;font-weight:600;text-align:right;">${value}</td>
  </tr>`;

const hi = (name) =>
  `<p style="margin:0 0 18px;color:#444444;font-size:15px;line-height:1.7;">
    Hi <strong>${name || 'there'}</strong>,
  </p>`;

const p = (text) =>
  `<p style="margin:0 0 16px;color:#444444;font-size:15px;line-height:1.7;">${text}</p>`;

const h2 = (text) =>
  `<h2 style="margin:0 0 18px;color:#1a1a1a;font-size:21px;font-weight:700;line-height:1.3;">${text}</h2>`;

const note = (text) =>
  `<p style="margin:8px 0 0;color:#999999;font-size:12px;text-align:center;">${text}</p>`;

const welcomeMemberTemplate = ({ full_name, username }) =>
  baseTemplate(`
    ${h2('Welcome to B-Smart')}
    ${hi(full_name)}
    ${p(`Your member account <strong>@${username || full_name || 'user'}</strong> is ready. You can now explore ads, earn coins by engaging with content, and discover vendors near you.`)}
    ${p('Here is what you can do right away:')}
    <ul style="margin:0 0 20px;padding-left:20px;color:#444444;font-size:15px;line-height:2;">
      <li>Browse and interact with ads to earn <strong>coins</strong></li>
      <li>Follow vendors and members you like</li>
      <li>Share posts and stories with the community</li>
    </ul>
    ${btn('Explore B-Smart', `${CLIENT}/home`)}
    ${divider()}
    ${note('Questions? Reply to this email or visit our help center.')}
  `);

const welcomeVendorTemplate = ({ full_name, company_name }) =>
  baseTemplate(`
    ${h2('Your vendor account is live')}
    ${hi(full_name)}
    ${p(`Thanks for registering <strong>${company_name || 'your business'}</strong> on B-Smart. Your account is under review. Our team typically approves vendors within <strong>24-48 hours</strong>.`)}
    ${infoBox(`
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#4F46E5;">While you wait, complete your profile</p>
      <ul style="margin:0;padding-left:18px;color:#444444;font-size:13px;line-height:2;">
        <li>Add business details and industry category</li>
        <li>Upload your logo and company description</li>
        <li>Add your website and social media links</li>
      </ul>
      <p style="margin:10px 0 0;font-size:12px;color:#888888;">A complete profile gets approved faster and ranks higher in search.</p>
    `)}
    ${btn('Complete My Profile', `${CLIENT}/vendor/profile`)}
    ${divider()}
    ${note('You will receive another email as soon as your account is approved.')}
  `);

const otpTemplate = ({ full_name, otp, purpose = 'verify_email', expiresInMinutes = 10 }) => {
  const isVerify = purpose === 'verify_email';
  const otpColor = '#EC1C44';

  return baseTemplate(`
    ${h2(isVerify ? 'Verify your email address' : 'Your password reset OTP')}
    ${hi(full_name)}
    ${p(
      isVerify
        ? `Use the one-time code below to verify your B-Smart email address. This code expires in <strong>${expiresInMinutes} minutes</strong>.`
        : `You requested a password reset. Enter the code below to continue. This code expires in <strong>${expiresInMinutes} minutes</strong>.`
    )}
    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;background:#fff1f4;border:2px dashed ${otpColor};border-radius:12px;padding:20px 40px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:14px;color:${otpColor};font-family:'Courier New',monospace;">
          ${otp}
        </span>
      </div>
    </div>
    ${note('Never share this code with anyone. B-Smart will never ask you for your OTP.')}
    ${note(`This code expires in ${expiresInMinutes} minutes.`)}
  `, otpColor);
};

const forgotPasswordTemplate = ({ full_name, resetLink }) =>
  baseTemplate(
    `
      ${h2('Reset your password')}
      ${hi(full_name)}
      ${p('We received a request to reset the password for your B-Smart account. Click the button below to choose a new password.')}
      ${btn('Reset My Password', resetLink, '#DC2626')}
      ${infoBox(
        `
          <p style="margin:0;font-size:13px;color:#666666;">
            This link expires in <strong>1 hour</strong>.<br />
            If you did not request this, you can safely ignore this email and your password will not change.
          </p>
        `,
        '#fff5f5',
        '#DC2626'
      )}
      ${note('For security, never share this link with anyone.')}
    `,
    '#DC2626'
  );

const passwordChangedTemplate = ({ full_name }) =>
  baseTemplate(
    `
      ${h2('Your password was changed')}
      ${hi(full_name)}
      ${p('This is a confirmation that the password for your B-Smart account was successfully updated.')}
      ${infoBox(
        `
          <p style="margin:0;font-size:13px;color:#7f1d1d;font-weight:600;">Was this not you? Act immediately.</p>
          <p style="margin:8px 0 0;font-size:13px;color:#666666;">
            If you did not make this change, your account may be compromised. Reset your password right away and contact our support team.
          </p>
        `,
        '#fff5f5',
        '#DC2626'
      )}
      ${btn("This Was Not Me - Reset Password", `${CLIENT}/forgot-password`, '#DC2626')}
    `,
    '#DC2626'
  );

const vendorApprovedTemplate = ({ full_name, company_name }) =>
  baseTemplate(
    `
      ${h2('Your vendor account is approved')}
      ${hi(full_name)}
      ${p(`Great news. <strong>${company_name || 'Your business'}</strong> has been verified and approved on B-Smart. You can now purchase a package and start running ads to reach members.`)}
      ${infoBox(
        `
          <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#15803d;">Next steps to launch your first ad:</p>
          <ol style="margin:0;padding-left:18px;color:#444444;font-size:13px;line-height:2.2;">
            <li>Choose a <strong>package</strong> that fits your business size</li>
            <li>Set your <strong>ad budget</strong> and earn coins</li>
            <li>Create your first <strong>ad</strong></li>
            <li>Target members by <strong>location, interest, and language</strong></li>
          </ol>
        `,
        '#f0fdf4',
        '#16a34a'
      )}
      ${btn('Get Started - Choose a Package', `${CLIENT}/vendor/packages`, '#16a34a')}
      ${divider()}
      ${note('Need help? Visit the vendor help center or reply to this email.')}
    `,
    '#16a34a'
  );

const vendorRejectedTemplate = ({ full_name, company_name, reason }) =>
  baseTemplate(
    `
      ${h2('Account verification unsuccessful')}
      ${hi(full_name)}
      ${p(`We reviewed the application for <strong>${company_name || 'your business'}</strong> and were unable to approve it at this time.`)}
      ${reason ? infoBox(
        `
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;">Reason provided by our team:</p>
          <p style="margin:0;font-size:14px;color:#444444;">"${reason}"</p>
        `,
        '#fffbeb',
        '#d97706'
      ) : ''}
      ${p('You can update your profile and resubmit for review. Make sure all business details, registration number, and contact information are accurate and complete.')}
      ${btn('Update Profile and Resubmit', `${CLIENT}/vendor/profile`, '#d97706')}
      ${divider()}
      ${note('If you believe this is an error, please reply to this email with supporting documents.')}
    `,
    '#d97706'
  );

const packagePurchasedTemplate = ({
  full_name,
  company_name,
  package_name,
  tier,
  final_price,
  coins_granted,
  validity_days,
  expires_at,
}) => {
  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Package';
  const expiryText = expires_at
    ? new Date(expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'No expiry';

  return baseTemplate(`
    ${h2('Package purchase confirmed')}
    ${hi(full_name)}
    ${p(`Your purchase of the <strong>${package_name}</strong> package for <strong>${company_name || 'your business'}</strong> was successful. Your wallet has been credited with coins and you are ready to run ads.`)}
    ${infoBox(`
      <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#4F46E5;">${package_name} Package Receipt</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${kvRow('Package Tier', tierLabel)}
        ${kvRow('Amount Paid', `Rs. ${Number(final_price || 0).toLocaleString('en-IN')}`)}
        ${kvRow('Coins Credited', `${Number(coins_granted || 0).toLocaleString()} coins`)}
        ${kvRow('Validity', `${validity_days || 0} days`)}
        ${kvRow('Expires On', expiryText)}
      </table>
    `)}
    ${p('Use your coins to set ad budgets. Premium and Enterprise packages can also give bonus coins on ad budget top-ups.')}
    ${btn('Create My First Ad', `${CLIENT}/vendor/ads/create`)}
    ${divider()}
    ${note('This is an automated receipt. Keep it for your records.')}
  `);
};

const adApprovedTemplate = ({ full_name, ad_caption, ad_id }) =>
  baseTemplate(
    `
      ${h2('Your ad is now live')}
      ${hi(full_name)}
      ${p('Great news. Your ad has been reviewed and approved by our team. It is now live and being shown to members on B-Smart.')}
      ${infoBox(
        `
          <p style="margin:0 0 6px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Ad Caption</p>
          <p style="margin:0;font-size:15px;color:#1a1a1a;font-style:italic;">"${ad_caption || 'Your ad'}"</p>
        `,
        '#f0fdf4',
        '#16a34a'
      )}
      ${p('Members who watch your full ad will reward you with engagement. You can track views, likes, and coin spend in your ad analytics dashboard.')}
      ${btn('View Ad Analytics', `${CLIENT}/vendor/ads/${ad_id || ''}`, '#16a34a')}
      ${divider()}
      ${note('Coins are deducted from your wallet as members engage with your ad.')}
    `,
    '#16a34a'
  );

const adRejectedTemplate = ({ full_name, ad_caption, ad_id, reason }) =>
  baseTemplate(
    `
      ${h2('Your ad needs attention')}
      ${hi(full_name)}
      ${p('Our review team was unable to approve the following ad. Please review the reason below, make the necessary changes, and resubmit.')}
      ${infoBox(
        `
          <p style="margin:0 0 6px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Ad Caption</p>
          <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;font-style:italic;">"${ad_caption || 'Your ad'}"</p>
          ${
            reason
              ? `<p style="margin:0 0 6px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Rejection Reason</p>
                 <p style="margin:0;font-size:14px;color:#7f1d1d;font-weight:600;">"${reason}"</p>`
              : ''
          }
        `,
        '#fff5f5',
        '#DC2626'
      )}
      ${p(`Common reasons for rejection include misleading content, prohibited products, low-quality media, or missing product details. Review your ad guidelines before resubmitting.`)}
      ${btn('Edit and Resubmit Ad', `${CLIENT}/vendor/ads/${ad_id || ''}/edit`, '#d97706')}
      ${divider()}
      ${note('No coins were deducted for this rejected ad.')}
    `,
    '#DC2626'
  );

const coinsLowTemplate = ({ full_name, current_balance, threshold = 500 }) =>
  baseTemplate(
    `
      ${h2('Your coin balance is running low')}
      ${hi(full_name)}
      ${p(`Your B-Smart wallet balance has dropped below <strong>${threshold} coins</strong>. Active ads may pause automatically once your balance reaches zero.`)}
      ${infoBox(
        `
          <p style="margin:0;font-size:28px;font-weight:800;color:#d97706;text-align:center;">
            ${Number(current_balance || 0).toLocaleString()} coins remaining
          </p>
        `,
        '#fffbeb',
        '#d97706'
      )}
      ${p('Top up your wallet by purchasing a new package or upgrading your current one.')}
      ${btn('Top Up Coins - Buy a Package', `${CLIENT}/vendor/packages`, '#d97706')}
      ${divider()}
      ${note('You can always check your wallet balance in the vendor dashboard.')}
    `,
    '#d97706'
  );

const newVendorAlertTemplate = ({ company_name, email, registered_at }) =>
  baseTemplate(`
    ${h2('New vendor registration - action needed')}
    ${p('A new vendor has registered on B-Smart and is waiting for approval.')}
    ${infoBox(`
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${kvRow('Company Name', company_name || '-')}
        ${kvRow('Email', email || '-')}
        ${kvRow(
          'Registered At',
          registered_at ? new Date(registered_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')
        )}
      </table>
    `)}
    ${btn('Review in Admin Panel', `${CLIENT}/admin/vendors`)}
  `);

const newAdPendingTemplate = ({ vendor_name, ad_caption, submitted_at }) =>
  baseTemplate(`
    ${h2('New ad pending review')}
    ${p('A vendor has submitted a new ad that requires your review.')}
    ${infoBox(`
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${kvRow('Vendor', vendor_name || '-')}
        ${kvRow('Ad Caption', ad_caption ? `"${ad_caption}"` : '-')}
        ${kvRow(
          'Submitted At',
          submitted_at ? new Date(submitted_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')
        )}
      </table>
    `)}
    ${btn('Review Ad in Admin Panel', `${CLIENT}/admin/ads`)}
  `);

const customSendEmailTemplate = ({ subject, senderName, message, html }) =>
  baseTemplate(
    `
      ${h2(subject || 'Message from B-Smart')}
      <p style="margin:0 0 18px;color:#555555;font-size:14px;line-height:1.6;">
        From: <strong>${senderName || 'B-Smart User'}</strong>
      </p>
      <div style="background:#fff1f4;border-left:4px solid #EC1C44;border-radius:10px;padding:20px 22px;color:#333333;font-size:15px;line-height:1.7;white-space:pre-wrap;">
        ${html || (message || '').replace(/\n/g, '<br />')}
      </div>
      ${note('Sent via B-Smart')}
    `,
    '#EC1C44'
  );

module.exports = {
  welcomeMemberTemplate,
  welcomeVendorTemplate,
  otpTemplate,
  forgotPasswordTemplate,
  passwordChangedTemplate,
  vendorApprovedTemplate,
  vendorRejectedTemplate,
  packagePurchasedTemplate,
  adApprovedTemplate,
  adRejectedTemplate,
  coinsLowTemplate,
  newVendorAlertTemplate,
  newAdPendingTemplate,
  customSendEmailTemplate,
};
