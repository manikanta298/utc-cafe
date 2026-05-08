const jwt = require('jsonwebtoken');

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

const signRefreshToken = (id) =>
  jwt.sign({ id, type: 'refresh' }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });

const setRefreshTokenCookie = (res, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  const cookieParts = [
    `utc_refresh_token=${encodeURIComponent(refreshToken)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${Math.floor(maxAge / 1000)}`,
    'SameSite=None',
  ];

  if (isProduction) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
};

const clearRefreshTokenCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieParts = [
    'utc_refresh_token=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=None',
  ];

  if (isProduction) cookieParts.push('Secure');

  res.setHeader('Set-Cookie', cookieParts.join('; '));
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
