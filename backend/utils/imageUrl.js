// Accept only http(s) image URLs (our own uploads or Cloudinary). Anything else is dropped.
const isSafeUrl = (value) => {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (/^\/uploads\/[\w.-]+$/.test(value)) return true; // file saved on this server
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
};

const cleanImages = (list, max = 5) =>
  (Array.isArray(list) ? list : [])
    .filter((i) => i && isSafeUrl(i.url))
    .slice(0, max)
    .map((i) => ({ url: i.url, name: typeof i.name === 'string' ? i.name.slice(0, 80) : undefined }));

module.exports = { isSafeUrl, cleanImages };
