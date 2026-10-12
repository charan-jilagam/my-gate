// Fail fast on unsafe configuration instead of running with it.
module.exports = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET || '';
  const placeholder = /change_in_production|your_super_secret|secret$/i.test(secret);

  if (!secret) {
    console.error('\nJWT_SECRET is not set. Add a long random value to backend/.env, for example:');
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
    process.exit(1);
  }
  if (isProd && (secret.length < 32 || placeholder)) {
    console.error('\nJWT_SECRET is too weak for production. Use at least 32 random characters and not the example value.\n');
    process.exit(1);
  }
  if (!isProd && (secret.length < 32 || placeholder)) {
    console.warn('Warning: JWT_SECRET looks weak. Fine for local development, never for production.');
  }
  if (isProd && !process.env.FRONTEND_URL) {
    console.error('\nFRONTEND_URL must be set in production (it is used for CORS and email links).\n');
    process.exit(1);
  }
};
