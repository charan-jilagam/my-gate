// Sets up the "choose your password" link for a newly created account and emails it.
// Nobody is given a password: the person gets a link to choose their own, valid for INVITE_DAYS days.
const crypto = require('crypto');
const { sendInviteEmail, baseUrl } = require('./accountMail');

const INVITE_DAYS = 7;

// New reset-style token for the person; the plain token only ever leaves in the link.
const issueSetupLink = async (user) => {
  const token = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  user.resetPasswordExpire = Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000;
  await user.save({ validateBeforeSave: false });
  return `${baseUrl()}/reset-password/${token}?welcome=1`;
};

// invitedBy: the user who is adding this person (their name goes in the email).
const inviteResult = async (invitedBy, user, society) => {
  const setupUrl = await issueSetupLink(user);
  const emailSent = await sendInviteEmail({ user, societyName: society && society.name, invitedByName: invitedBy.name, setupUrl, days: INVITE_DAYS });
  return { emailSent, setupUrl, days: INVITE_DAYS };
};

module.exports = { INVITE_DAYS, issueSetupLink, inviteResult };
