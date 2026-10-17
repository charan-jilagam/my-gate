const h = require('./helpers/harness');
const { mockingoose } = h;
const Post = require('../models/Post');
const Notice = require('../models/Notice');
const User = h.models.User;

let resident;
let neighbour;
let admin;

const makePost = (over = {}) => {
  const doc = new Post({ _id: h.oid(), societyId: h.SOCIETY_ID, authorId: resident._id, category: 'discussion', title: 'Lift is slow', body: 'Anyone else?', ...over });
  doc.authorId = over.author || resident; // behaves like a populated reference
  return doc;
};

beforeEach(() => {
  h.reset();
  resident = h.makeUser();
  neighbour = h.makeUser({ name: 'Bina Shah', flatNo: '202' });
  admin = h.makeUser({ name: 'Office Admin', role: 'society_admin', flatNo: undefined, block: undefined });
  h.knowUsers(resident, neighbour, admin);
  h.knowSociety();
});

describe('community feed', () => {
  test('lists posts with who wrote them and whether you liked them', async () => {
    const post = makePost({ likes: [neighbour._id] });
    mockingoose(Post).toReturn([post], 'find');
    const res = await h.api().get('/api/community/posts').set(h.auth(neighbour));
    expect(res.status).toBe(200);
    expect(res.body.posts[0]).toMatchObject({ title: 'Lift is slow', likeCount: 1, liked: true, mine: false, canManage: false, author: { name: 'Asha Rao', flat: 'A-101' } });
  });

  test('only shows visible posts to residents and scopes to their society', async () => {
    let asked;
    mockingoose(Post).toReturn((q) => {
      asked = q.getQuery();
      return [];
    }, 'find');
    await h.api().get('/api/community/posts?category=buy_sell').set(h.auth(resident));
    expect(String(asked.societyId)).toBe(String(h.SOCIETY_ID));
    expect(asked.isHidden).toBe(false);
    expect(asked.category).toBe('buy_sell');
  });

  test('rejects an unknown category', async () => {
    const res = await h.api().get('/api/community/posts?category=spam').set(h.auth(resident));
    expect(res.status).toBe(400);
  });

  test('creates a post and ignores price on non-sale posts', async () => {
    const res = await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'Cricket on Sunday?', category: 'discussion', price: 500 });
    expect(res.status).toBe(201);
    const [saved] = h.savedDocs(Post);
    expect(saved.price).toBeUndefined();
    expect(String(saved.authorId._id || saved.authorId)).toBe(String(resident._id));
    expect(String(saved.societyId)).toBe(String(h.SOCIETY_ID));
  });

  test('keeps the price on a for-sale post', async () => {
    await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'Study table', category: 'buy_sell', price: 1500 });
    expect(h.savedDocs(Post)[0].price).toBe(1500);
  });

  test('needs a title', async () => {
    const res = await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  test('security guards cannot post', async () => {
    const guard = h.makeUser({ role: 'security' });
    h.knowUsers(resident, guard);
    const res = await h.api().post('/api/community/posts').set(h.auth(guard)).send({ title: 'Hello there' });
    expect(res.status).toBe(403);
  });

  test('stops someone posting more than 10 times an hour', async () => {
    mockingoose(Post).toReturn(10, 'countDocuments');
    const res = await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'Another one' });
    expect(res.status).toBe(429);
  });
});

describe('likes, comments and moderation', () => {
  test('liking twice un-likes', async () => {
    const post = makePost({ likes: [neighbour._id] });
    mockingoose(Post).toReturn(post, 'findOne');
    const res = await h.api().post(`/api/community/posts/${post._id}/like`).set(h.auth(neighbour));
    expect(res.body).toMatchObject({ liked: false, likeCount: 0 });
  });

  test('a comment notifies the author but not the commenter', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    const res = await h.api().post(`/api/community/posts/${post._id}/comments`).set(h.auth(neighbour)).send({ text: 'Same here' });
    expect(res.status).toBe(201);
    const notes = h.savedDocs(h.models.Notification);
    expect(notes.map((n) => String(n.userId))).toEqual([String(resident._id)]);
    expect(notes[0]).toMatchObject({ type: 'community', relatedModel: 'Post' });
  });

  test('an empty comment is refused', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    const res = await h.api().post(`/api/community/posts/${post._id}/comments`).set(h.auth(neighbour)).send({ text: '   ' });
    expect(res.status).toBe(400);
  });

  test('only the author or an admin can delete a post', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    const denied = await h.api().delete(`/api/community/posts/${post._id}`).set(h.auth(neighbour));
    expect(denied.status).toBe(403);
    const ok = await h.api().delete(`/api/community/posts/${post._id}`).set(h.auth(admin));
    expect(ok.status).toBe(200);
  });

  test('only the author can mark a post resolved', async () => {
    const post = makePost({ category: 'buy_sell' });
    mockingoose(Post).toReturn(post, 'findOne');
    expect((await h.api().put(`/api/community/posts/${post._id}/resolve`).set(h.auth(neighbour))).status).toBe(403);
    const res = await h.api().put(`/api/community/posts/${post._id}/resolve`).set(h.auth(resident));
    expect(res.body.isResolved).toBe(true);
  });

  test('only admins can pin', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    expect((await h.api().put(`/api/community/posts/${post._id}/pin`).set(h.auth(resident))).status).toBe(403);
    expect((await h.api().put(`/api/community/posts/${post._id}/pin`).set(h.auth(admin))).body.isPinned).toBe(true);
  });

  test('you cannot report your own post, and a repeat report counts once', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    expect((await h.api().post(`/api/community/posts/${post._id}/report`).set(h.auth(resident))).status).toBe(400);

    const reported = makePost({ reports: [{ userId: neighbour._id }] });
    mockingoose(Post).toReturn(reported, 'findOne');
    const again = await h.api().post(`/api/community/posts/${reported._id}/report`).set(h.auth(neighbour));
    expect(again.status).toBe(200);
    expect(h.savedDocs(Post)).toHaveLength(0);
  });

  test('the third report hides the post and alerts the office', async () => {
    const others = [h.makeUser(), h.makeUser()];
    const post = makePost({ reports: others.map((u) => ({ userId: u._id })) });
    mockingoose(Post).toReturn(post, 'findOne');
    mockingoose(User).toReturn([admin], 'find');
    const res = await h.api().post(`/api/community/posts/${post._id}/report`).set(h.auth(neighbour)).send({ reason: 'Rude' });
    expect(res.status).toBe(200);
    expect(h.savedDocs(Post)[0].isHidden).toBe(true);
    expect(h.savedDocs(h.models.Notification).map((n) => String(n.userId))).toContain(String(admin._id));
  });

  test('a hidden post is gone for residents but still open to admins', async () => {
    const post = makePost({ isHidden: true });
    mockingoose(Post).toReturn(post, 'findOne');
    expect((await h.api().get(`/api/community/posts/${post._id}`).set(h.auth(neighbour))).status).toBe(404);
    expect((await h.api().get(`/api/community/posts/${post._id}`).set(h.auth(admin))).status).toBe(200);
  });

  test('a post from another society is off limits', async () => {
    const foreign = makePost({ societyId: h.OTHER_SOCIETY_ID });
    mockingoose(Post).toReturn(foreign, 'findOne');
    const res = await h.api().get(`/api/community/posts/${foreign._id}`).set(h.auth(resident));
    expect(res.status).toBe(403);
  });
});

describe('event RSVP', () => {
  const makeEvent = (over = {}) =>
    new Notice({ _id: h.oid(), societyId: h.SOCIETY_ID, title: 'Diwali night', content: 'Join us', type: 'event', isPublished: true, isActive: true, createdBy: admin._id, eventDate: new Date(Date.now() + 5 * 864e5), ...over });

  test('records a reply and counts guests as people', async () => {
    const event = makeEvent({ rsvps: [{ userId: neighbour._id, status: 'going', guests: 2 }] });
    mockingoose(Notice).toReturn(event, 'findOne');
    const res = await h.api().post(`/api/notices/${event._id}/rsvp`).set(h.auth(resident)).send({ status: 'going', guests: 1 });
    expect(res.status).toBe(200);
    expect(res.body.rsvp).toMatchObject({ going: 2, people: 5, mine: { status: 'going', guests: 1 } });
  });

  test('changing a reply replaces it instead of adding another', async () => {
    const event = makeEvent({ rsvps: [{ userId: resident._id, status: 'going', guests: 3 }] });
    mockingoose(Notice).toReturn(event, 'findOne');
    const res = await h.api().post(`/api/notices/${event._id}/rsvp`).set(h.auth(resident)).send({ status: 'no', guests: 4 });
    expect(res.body.rsvp).toMatchObject({ going: 0, no: 1, mine: { status: 'no', guests: 0 } });
  });

  test('refuses RSVPs for non-events, past events and bad answers', async () => {
    const poll = makeEvent({ type: 'notice' });
    mockingoose(Notice).toReturn(poll, 'findOne');
    expect((await h.api().post(`/api/notices/${poll._id}/rsvp`).set(h.auth(resident)).send({ status: 'going' })).status).toBe(400);

    const past = makeEvent({ eventDate: new Date(Date.now() - 864e5) });
    mockingoose(Notice).toReturn(past, 'findOne');
    expect((await h.api().post(`/api/notices/${past._id}/rsvp`).set(h.auth(resident)).send({ status: 'going' })).status).toBe(400);

    const ok = makeEvent();
    mockingoose(Notice).toReturn(ok, 'findOne');
    expect((await h.api().post(`/api/notices/${ok._id}/rsvp`).set(h.auth(resident)).send({ status: 'definitely' })).status).toBe(400);
  });

  test('the notice list shows counts, never who replied', async () => {
    const event = makeEvent({ rsvps: [{ userId: neighbour._id, status: 'going', guests: 0 }] });
    mockingoose(Notice).toReturn([event], 'find');
    const res = await h.api().get('/api/notices').set(h.auth(resident));
    expect(res.body.notices[0].rsvp).toMatchObject({ going: 1, mine: null });
    expect(res.body.notices[0].rsvps).toBeUndefined();
  });
});
