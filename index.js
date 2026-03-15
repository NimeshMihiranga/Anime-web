const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongo:YLUdZYuMjhvDoQhjhAFvRVvXrujchQmO@switchyard.proxy.rlwy.net:19287';

// ─── ADMIN CREDENTIALS ────────────────────────────────────────
const ADMIN_PHONE     = '94721584279';
const ADMIN_PASS_HASH = bcrypt.hashSync('Nimesh@123', 10);
const adminSessions   = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isAdminSession(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && adminSessions.has(token)) return next();
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

app.use(cors({
  origin: function(origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin', 'x-admin-token'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ADMIN AUTH ROUTES ────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return res.status(400).json({ success: false, message: 'Phone and password required' });
    if (phone.replace(/\D/g,'') !== ADMIN_PHONE)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const match = await bcrypt.compare(password, ADMIN_PASS_HASH);
    if (!match)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken();
    adminSessions.set(token, { createdAt: Date.now() });
    for (const [t, s] of adminSessions)
      if (Date.now() - s.createdAt > 86400000) adminSessions.delete(t);
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) adminSessions.delete(token);
  res.json({ success: true });
});

app.get('/api/admin/verify', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token && adminSessions.has(token)) return res.json({ success: true });
  res.status(401).json({ success: false });
});

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ─── SCHEMAS ──────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// EPISODE sub-schema
const episodeSchema = new mongoose.Schema({
  number:    { type: Number, required: true },
  title:     { type: String, default: '' },
  driveUrl:  { type: String, default: '' },
  duration:  { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// ANIME SCHEMA
const animeSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  genre:       { type: String, default: '' },
  trailerUrl:  { type: String, default: '' },
  downloadUrl: { type: String, default: '' },
  logoUrl:     { type: String, default: '' },
  type:        { type: String, default: 'series', enum: ['series', 'movie'] },
  episodes:    [episodeSchema],
  addedBy:     { type: String, default: 'admin' },
  createdAt:   { type: Date, default: Date.now }
});

// BANNER SCHEMA
const bannerSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  label:       { type: String, default: 'Now Streaming' },
  imageUrl:    { type: String, default: '' },   // wide background image URL
  animeId:     { type: String, default: '' },   // link to anime
  playUrl:     { type: String, default: '' },   // direct play URL
  order:       { type: Number, default: 0 },
  active:      { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now }
});

// COMMENT SCHEMA
const commentSchema = new mongoose.Schema({
  animeId:   { type: String, required: true },
  userId:    { type: String, required: true },
  username:  { type: String, required: true },
  text:      { type: String, required: true, maxlength: 500 },
  likes:     { type: [String], default: [] }, // array of userIds who liked
  createdAt: { type: Date, default: Date.now }
});

// RATING SCHEMA
const ratingSchema = new mongoose.Schema({
  animeId:  { type: String, required: true },
  userId:   { type: String, required: true },
  score:    { type: Number, required: true, min: 1, max: 5 },
  createdAt:{ type: Date, default: Date.now }
});
ratingSchema.index({ animeId: 1, userId: 1 }, { unique: true });

// WATCHLIST SCHEMA
const watchlistSchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  animeId:  { type: String, required: true },
  createdAt:{ type: Date, default: Date.now }
});
watchlistSchema.index({ userId: 1, animeId: 1 }, { unique: true });

// WATCH HISTORY SCHEMA
const historySchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  animeId:   { type: String, required: true },
  episodeId: { type: String, default: '' },
  epNumber:  { type: Number, default: 0 },
  epTitle:   { type: String, default: '' },
  progress:  { type: Number, default: 0 }, // seconds watched
  updatedAt: { type: Date, default: Date.now }
});
historySchema.index({ userId: 1, animeId: 1 }, { unique: true });

// VIEW COUNT SCHEMA
const viewSchema = new mongoose.Schema({
  animeId:   { type: String, required: true, unique: true },
  count:     { type: Number, default: 0 }
});

// NOTIFICATION SCHEMA
const notifSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  animeId:   { type: String, required: true },
  message:   { type: String, required: true },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});


const User    = mongoose.model('User',    userSchema);
const Anime   = mongoose.model('Anime',   animeSchema);
const Banner  = mongoose.model('Banner',  bannerSchema);
const Comment = mongoose.model('Comment', commentSchema);
const Rating  = mongoose.model('Rating',  ratingSchema);

const Watchlist  = mongoose.model('Watchlist',  watchlistSchema);
const History    = mongoose.model('History',    historySchema);
const ViewCount  = mongoose.model('ViewCount',  viewSchema);
const Notif      = mongoose.model('Notif',      notifSchema);


function isAdmin(req, res, next) {
  // Support both old x-admin header and new token-based auth
  if (req.headers['x-admin'] === '1') return next();
  const token = req.headers['x-admin-token'];
  if (token && adminSessions.has(token)) return next();
  return res.status(403).json({ success: false, message: 'Admin access required' });
}

// ─── AUTH ─────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be 6+ characters' });
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      if (existing.email === email.toLowerCase())
        return res.status(400).json({ success: false, message: 'Email already registered' });
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password: hashed });
    res.json({ success: true, user: { _id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });
    const user = await User.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
    });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Wrong password' });
    res.json({ success: true, user: { _id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── ANIME ROUTES ─────────────────────────────────────────────
app.get('/api/anime', async (req, res) => {
  try {
    const anime = await Anime.find().sort({ createdAt: -1 });
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.get('/api/anime/:id', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/anime', isAdmin, async (req, res) => {
  try {
    const { name, description, genre, trailerUrl, downloadUrl, logoUrl, type } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required' });
    const anime = await Anime.create({ name, description, genre, trailerUrl, downloadUrl, logoUrl, type: type||'series' });
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.put('/api/anime/:id', isAdmin, async (req, res) => {
  try {
    const { name, description, genre, trailerUrl, downloadUrl, logoUrl, type } = req.body;
    const anime = await Anime.findByIdAndUpdate(
      req.params.id,
      { name, description, genre, trailerUrl, downloadUrl, logoUrl, type },
      { new: true }
    );
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.delete('/api/anime/:id', isAdmin, async (req, res) => {
  try {
    const anime = await Anime.findByIdAndDelete(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── EPISODE ROUTES ───────────────────────────────────────────
app.get('/api/anime/:id/episodes', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    const episodes = [...anime.episodes].sort((a,b) => a.number - b.number);
    res.json({ success: true, episodes });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/anime/:id/episodes', isAdmin, async (req, res) => {
  try {
    const { number, title, driveUrl, duration, thumbnail } = req.body;
    if (!number || !driveUrl)
      return res.status(400).json({ success: false, message: 'Episode number and Drive URL required' });
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    const exists = anime.episodes.find(e => e.number === parseInt(number));
    if (exists) return res.status(400).json({ success: false, message: `Episode ${number} already exists` });
    anime.episodes.push({ number: parseInt(number), title, driveUrl, duration, thumbnail });
    await anime.save();
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.put('/api/anime/:id/episodes/:epId', isAdmin, async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    const ep = anime.episodes.id(req.params.epId);
    if (!ep) return res.status(404).json({ success: false, message: 'Episode not found' });
    const { number, title, driveUrl, duration, thumbnail } = req.body;
    if (number !== undefined)    ep.number    = parseInt(number);
    if (title !== undefined)     ep.title     = title;
    if (driveUrl !== undefined)  ep.driveUrl  = driveUrl;
    if (duration !== undefined)  ep.duration  = duration;
    if (thumbnail !== undefined) ep.thumbnail = thumbnail;
    await anime.save();
    res.json({ success: true, anime });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.delete('/api/anime/:id/episodes/:epId', isAdmin, async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    anime.episodes.pull({ _id: req.params.epId });
    await anime.save();
    res.json({ success: true, message: 'Episode deleted' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── STATS ────────────────────────────────────────────────────
app.get('/api/admin/stats', isAdmin, async (req, res) => {
  try {
    const userCount  = await User.countDocuments();
    const animeCount = await Anime.countDocuments();
    const allAnime   = await Anime.find();
    const epCount    = allAnime.reduce((s,a) => s + a.episodes.length, 0);
    res.json({ success: true, userCount, animeCount, epCount });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── BANNER ROUTES ───────────────────────────────────────────
app.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find({ active: true }).sort({ order: 1, createdAt: -1 });
    res.json({ success: true, banners });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.get('/api/admin/banners', isAdmin, async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.json({ success: true, banners });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.post('/api/banners', isAdmin, async (req, res) => {
  try {
    const { title, description, label, imageUrl, animeId, playUrl, order, active } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title required' });
    const banner = await Banner.create({ title, description, label, imageUrl, animeId, playUrl, order: order||0, active: active!==false });
    res.json({ success: true, banner });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.put('/api/banners/:id', isAdmin, async (req, res) => {
  try {
    const { title, description, label, imageUrl, animeId, playUrl, order, active } = req.body;
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { title, description, label, imageUrl, animeId, playUrl, order, active },
      { new: true }
    );
    if (!banner) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, banner });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.delete('/api/banners/:id', isAdmin, async (req, res) => {
  try {
    await Banner.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── COMMENT ROUTES ──────────────────────────────────────────

// GET comments for anime
app.get('/api/anime/:id/comments', async (req, res) => {
  try {
    const comments = await Comment.find({ animeId: req.params.id }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, comments });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST add comment
app.post('/api/anime/:id/comments', async (req, res) => {
  try {
    const { userId, username, text } = req.body;
    if (!userId || !username || !text)
      return res.status(400).json({ success: false, message: 'All fields required' });
    if (text.trim().length < 1)
      return res.status(400).json({ success: false, message: 'Comment cannot be empty' });
    const comment = await Comment.create({
      animeId: req.params.id, userId, username, text: text.trim().slice(0, 500)
    });
    res.json({ success: true, comment });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST like/unlike comment
app.post('/api/comments/:id/like', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Not found' });
    const idx = comment.likes.indexOf(userId);
    if (idx === -1) comment.likes.push(userId);
    else comment.likes.splice(idx, 1);
    await comment.save();
    res.json({ success: true, likes: comment.likes.length, liked: idx === -1 });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// DELETE comment (owner or admin)
app.delete('/api/comments/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, message: 'Not found' });
    const isAdmin = req.headers['x-admin'] === '1';
    if (!isAdmin && comment.userId !== userId)
      return res.status(403).json({ success: false, message: 'Not allowed' });
    await Comment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── RATING ROUTES ────────────────────────────────────────────

// GET rating info for anime
app.get('/api/anime/:id/rating', async (req, res) => {
  try {
    const ratings = await Rating.find({ animeId: req.params.id });
    const count = ratings.length;
    const avg   = count ? (ratings.reduce((s,r) => s + r.score, 0) / count) : 0;
    res.json({ success: true, avg: Math.round(avg * 10) / 10, count });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST rate anime (upsert)
app.post('/api/anime/:id/rating', async (req, res) => {
  try {
    const { userId, score } = req.body;
    if (!userId || !score) return res.status(400).json({ success: false, message: 'userId and score required' });
    if (score < 1 || score > 5) return res.status(400).json({ success: false, message: 'Score must be 1-5' });
    await Rating.findOneAndUpdate(
      { animeId: req.params.id, userId },
      { score: parseInt(score) },
      { upsert: true, new: true }
    );
    const ratings = await Rating.find({ animeId: req.params.id });
    const count = ratings.length;
    const avg   = Math.round((ratings.reduce((s,r) => s + r.score, 0) / count) * 10) / 10;
    res.json({ success: true, avg, count });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});


// ─── WATCHLIST ROUTES ─────────────────────────────────────────

// GET user watchlist
app.get('/api/watchlist/:userId', async (req, res) => {
  try {
    const items = await Watchlist.find({ userId: req.params.userId });
    const animeIds = items.map(i => i.animeId);
    res.json({ success: true, animeIds });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST toggle watchlist
app.post('/api/watchlist', async (req, res) => {
  try {
    const { userId, animeId } = req.body;
    if (!userId || !animeId) return res.status(400).json({ success: false, message: 'userId and animeId required' });
    const exists = await Watchlist.findOne({ userId, animeId });
    if (exists) {
      await Watchlist.deleteOne({ userId, animeId });
      res.json({ success: true, saved: false });
    } else {
      await Watchlist.create({ userId, animeId });
      res.json({ success: true, saved: true });
    }
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── WATCH HISTORY ROUTES ──────────────────────────────────────

// GET user history
app.get('/api/history/:userId', async (req, res) => {
  try {
    const history = await History.find({ userId: req.params.userId }).sort({ updatedAt: -1 }).limit(20);
    res.json({ success: true, history });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST update history
app.post('/api/history', async (req, res) => {
  try {
    const { userId, animeId, episodeId, epNumber, epTitle, progress } = req.body;
    if (!userId || !animeId) return res.status(400).json({ success: false, message: 'userId and animeId required' });
    await History.findOneAndUpdate(
      { userId, animeId },
      { episodeId, epNumber, epTitle, progress: progress||0, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// DELETE history item
app.delete('/api/history/:userId/:animeId', async (req, res) => {
  try {
    await History.deleteOne({ userId: req.params.userId, animeId: req.params.animeId });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── VIEW COUNT ROUTES ─────────────────────────────────────────

// GET view count
app.get('/api/anime/:id/views', async (req, res) => {
  try {
    const v = await ViewCount.findOne({ animeId: req.params.id });
    res.json({ success: true, count: v ? v.count : 0 });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST increment view
app.post('/api/anime/:id/view', async (req, res) => {
  try {
    const v = await ViewCount.findOneAndUpdate(
      { animeId: req.params.id },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    res.json({ success: true, count: v.count });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET top viewed anime (admin)
app.get('/api/admin/top-views', isAdmin, async (req, res) => {
  try {
    const views = await ViewCount.find().sort({ count: -1 }).limit(10);
    res.json({ success: true, views });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── NOTIFICATION ROUTES ───────────────────────────────────────

// GET user notifications
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const notifs = await Notif.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
    const unread = notifs.filter(n => !n.read).length;
    res.json({ success: true, notifs, unread });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST mark all read
app.post('/api/notifications/:userId/read', async (req, res) => {
  try {
    await Notif.updateMany({ userId: req.params.userId, read: false }, { read: true });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// POST send notification to all users (admin)
app.post('/api/admin/notify', isAdmin, async (req, res) => {
  try {
    const { animeId, message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });
    const users = await User.find({}, '_id');
    const notifs = users.map(u => ({ userId: u._id.toString(), animeId: animeId||'', message }));
    await Notif.insertMany(notifs);
    res.json({ success: true, sent: notifs.length });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── RECOMMENDATIONS ROUTE ─────────────────────────────────────

// GET recommendations based on genre
app.get('/api/anime/:id/recommendations', async (req, res) => {
  try {
    const anime = await Anime.findById(req.params.id);
    if (!anime) return res.status(404).json({ success: false, message: 'Not found' });
    const genres = (anime.genre||'').split(/[,\s]+/).filter(Boolean);
    let recs = [];
    if (genres.length) {
      const regexes = genres.map(g => new RegExp(g, 'i'));
      recs = await Anime.find({
        _id: { $ne: anime._id },
        genre: { $in: regexes }
      }).limit(8);
    }
    if (recs.length < 4) {
      const extra = await Anime.find({ _id: { $ne: anime._id } }).limit(8);
      const ids = new Set(recs.map(r => r._id.toString()));
      extra.forEach(e => { if (!ids.has(e._id.toString())) recs.push(e); });
      recs = recs.slice(0, 8);
    }
    res.json({ success: true, recommendations: recs });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// ─── SEO META / SEARCH ─────────────────────────────────────────

// GET advanced search
app.get('/api/search', async (req, res) => {
  try {
    const { q, genre, type, sort } = req.query;
    let filter = {};
    if (q) filter.$or = [
      { name: new RegExp(q, 'i') },
      { description: new RegExp(q, 'i') },
      { genre: new RegExp(q, 'i') }
    ];
    if (genre) filter.genre = new RegExp(genre, 'i');
    if (type && type !== 'all') filter.type = type;
    let sortObj = { createdAt: -1 };
    if (sort === 'name') sortObj = { name: 1 };
    const results = await Anime.find(filter).sort(sortObj).limit(50);
    res.json({ success: true, results, count: results.length });
  } catch(err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`\n  BLACK ANIME SERVER — http://localhost:${PORT}\n  Made by Black Cat OFC | Owner: Nimeshka Mihiran\n`);
});
module.exports = app;
