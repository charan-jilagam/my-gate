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
    expect(h.updatesTo(Post)[0].update).toEqual({ $pull: { likes: String(neighbour._id) } });
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
    mockingoose(Post).toReturn({ modifiedCount: 1 }, 'updateOne');
    mockingoose(User).toReturn([admin], 'find');
    const res = await h.api().post(`/api/community/posts/${post._id}/report`).set(h.auth(neighbour)).send({ reason: 'Rude' });
    expect(res.status).toBe(200);
    const updates = h.updatesTo(Post).map((u) => u.update);
    expect(updates[0].$push.reports.userId).toBe(String(neighbour._id));
    expect(updates[1]).toEqual({ $set: { isHidden: true } });
    expect(h.savedDocs(h.models.Notification).map((n) => String(n.userId))).toContain(String(admin._id));
  });

  test('a report that arrives twice at once counts once and does not hide the post', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    mockingoose(Post).toReturn({ modifiedCount: 0 }, 'updateOne'); // the conditional push found the reply already there
    const res = await h.api().post(`/api/community/posts/${post._id}/report`).set(h.auth(neighbour));
    expect(res.body.message).toMatch(/already reported/);
    expect(h.updatesTo(Post)).toHaveLength(1); // only the push was attempted; no hide
  });

  test('likes use atomic add and remove, so two quick taps cannot duplicate or lose one', async () => {
    const post = makePost();
    mockingoose(Post).toReturn(post, 'findOne');
    const res = await h.api().post(`/api/community/posts/${post._id}/like`).set(h.auth(neighbour));
    expect(res.body).toMatchObject({ liked: true, likeCount: 1 });
    expect(h.updatesTo(Post)[0].update).toEqual({ $addToSet: { likes: String(neighbour._id) } });
  });

  test('refuses photo links that are not uploads or https', async () => {
    for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://insecure.example/x.jpg']) {
      const res = await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'With photo', images: [{ url }] });
      expect(res.status).toBe(400);
    }
    const ok = await h.api().post('/api/community/posts').set(h.auth(resident)).send({ title: 'With photo', images: [{ url: '/uploads/abc-1.jpg' }] });
    expect(ok.status).toBe(201);
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

  // The route reads the event (access check, then the reply), updates it, and reads it again for the counts.
  const eventThen = (before, after) => {
    let n = 0;
    mockingoose(Notice).toReturn(() => (n++ < 2 ? before : after), 'findOne');
  };

  test('records a reply and counts guests as people', async () => {
    const before = makeEvent({ rsvps: [{ userId: neighbour._id, status: 'going', guests: 2 }] });
    const after = makeEvent({ _id: before._id, rsvps: [{ userId: neighbour._id, status: 'going', guests: 2 }, { userId: resident._id, status: 'going', guests: 1 }] });
    eventThen(before, after);
    mockingoose(Notice).toReturn({ matchedCount: 0 }, 'updateOne'); // no earlier reply, so it is added
    const res = await h.api().post(`/api/notices/${before._id}/rsvp`).set(h.auth(resident)).send({ status: 'going', guests: 1 });
    expect(res.status).toBe(200);
    expect(res.body.rsvp).toMatchObject({ going: 2, people: 5, mine: { status: 'going', guests: 1 } });
    const [change, add] = h.updatesTo(Notice);
    expect(change.update.$set['rsvps.$.guests']).toBe(1);
    expect(add.filter['rsvps.userId']).toEqual({ $ne: String(resident._id) }); // the add only applies if there is no reply yet
    expect(add.update.$push.rsvps).toMatchObject({ status: 'going', guests: 1 });
  });

  test('changing a reply updates it in place instead of adding another', async () => {
    const before = makeEvent({ rsvps: [{ userId: resident._id, status: 'going', guests: 3 }] });
    const after = makeEvent({ _id: before._id, rsvps: [{ userId: resident._id, status: 'no', guests: 0 }] });
    eventThen(before, after);
    mockingoose(Notice).toReturn({ matchedCount: 1 }, 'updateOne');
    const res = await h.api().post(`/api/notices/${before._id}/rsvp`).set(h.auth(resident)).send({ status: 'no', guests: 4 });
    expect(res.body.rsvp).toMatchObject({ going: 0, no: 1, mine: { status: 'no', guests: 0 } });
    expect(h.updatesTo(Notice)).toHaveLength(1); // matched, so no second "add" step
    expect(h.updatesTo(Notice)[0].update.$set).toEqual({ 'rsvps.$.status': 'no', 'rsvps.$.guests': 0 });
  });

  test('a resident cannot open or reply to an event meant for another block, a draft or a deleted one', async () => {
    for (const over of [{ targetAudience: 'specific_blocks', targetBlocks: ['B'] }, { targetAudience: 'specific_flats', targetFlats: ['B-9'] }, { isPublished: false }, { isActive: false }]) {
      const event = makeEvent(over);
      mockingoose(Notice).toReturn(event, 'findOne');
      expect((await h.api().get(`/api/notices/${event._id}`).set(h.auth(resident))).status).toBe(404);
      expect((await h.api().post(`/api/notices/${event._id}/rsvp`).set(h.auth(resident)).send({ status: 'going' })).status).toBe(404);
    }
    const mine = makeEvent({ targetAudience: 'specific_blocks', targetBlocks: ['a'] });
    mockingoose(Notice).toReturn(mine, 'findOne');
    expect((await h.api().get(`/api/notices/${mine._id}`).set(h.auth(resident))).status).toBe(200);
    const draft = makeEvent({ isPublished: false });
    mockingoose(Notice).toReturn(draft, 'findOne');
    expect((await h.api().get(`/api/notices/${draft._id}`).set(h.auth(admin))).status).toBe(200); // the office can still see drafts
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
    mockingoose(Notice).toReturn({ matchedCount: 1 }, 'updateOne');
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
