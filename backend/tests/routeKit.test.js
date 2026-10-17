const { isSafeUrl, paging, societyFor } = require('../utils/routeKit');

describe('route helpers', () => {
  test('only upload paths and https links are accepted as file links', () => {
    expect(isSafeUrl('/uploads/abc-1.jpg')).toBe(true);
    expect(isSafeUrl('https://res.cloudinary.com/demo/image/upload/a.jpg')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://x.example/a.jpg', '/uploads/../etc/passwd', '//evil.example/x', `https://x.example/${'a'.repeat(600)}`, '', null, 42]) {
      expect(isSafeUrl(bad)).toBe(false);
    }
  });

  test('paging clamps negative, huge and non-numeric values', () => {
    expect(paging({ query: { limit: '-5', skip: '-3' } })).toEqual({ limit: 1, skip: 0 });
    expect(paging({ query: { limit: '9999', skip: '10' } })).toEqual({ limit: 100, skip: 10 });
    expect(paging({ query: { limit: 'abc', skip: 'x' } })).toEqual({ limit: 50, skip: 0 });
    expect(paging({ query: {} }, { max: 500, fallback: 200 })).toEqual({ limit: 200, skip: 0 });
  });

  test('a super admin must give a well-formed society id; anyone else uses their own', () => {
    const sa = (societyId) => ({ user: { role: 'super_admin' }, query: { societyId } });
    expect(societyFor(sa('507f1f77bcf86cd799439011'))).toBe('507f1f77bcf86cd799439011');
    expect(societyFor(sa('not-an-id'))).toBeUndefined();
    expect(societyFor(sa({ $ne: null }))).toBeUndefined();
    expect(societyFor({ user: { role: 'resident', societyId: 'mine' }, query: { societyId: 'other' } })).toBe('mine');
  });
});
