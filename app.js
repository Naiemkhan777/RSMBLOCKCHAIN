/* ============================================================
   RSM Chain — app.js
   Royal Smart Money | Firebase + Web3 + Chart.js
   ============================================================ */

'use strict';

// ─── CONFIG ────────────────────────────────────────────────
const FC = {
  apiKey: "AIzaSyBZaVEN55FXTJTkjhANzYuSasJ9-_GtCB8",
  authDomain: "rsm-chain.firebaseapp.com",
  databaseURL: "https://rsm-chain-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "rsm-chain",
  storageBucket: "rsm-chain.firebasestorage.app",
  messagingSenderId: "639751140214",
  appId: "1:639751140214:android:963d1c3010e14cd1e14057"
};
const ADMIN = "rsm.admin@gmail.com";
const BONUS = 10;
const BSC_CHAIN_ID = '0x38'; // BSC Mainnet

// ─── STATE ─────────────────────────────────────────────────
let auth, db, curUser, isAdmin = false;
let curBuyToken = null, cfCallback = null;
let priceChart = null, chartInterval = null;
let web3Provider = null, web3Signer = null, web3Address = null;
let mkF = 'all';
let tokType = 'utility';

// ─── INIT ───────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (typeof firebase === 'undefined') {
    document.getElementById('authPage').innerHTML = `
      <div style="text-align:center;padding:40px 20px;position:relative;z-index:2;max-width:380px;margin:auto">
        <div style="font-size:3rem;margin-bottom:14px">⚠️</div>
        <h2 style="color:#7c3aed;margin-bottom:10px;font-family:Nunito,sans-serif">Firebase লোড হয়নি</h2>
        <p style="color:#888;font-size:0.83rem;line-height:1.8">এই ফাইলটি <strong style="color:#f1f0f7">Chrome বা Firefox</strong> এ খুলুন।<br><br>অথবা Netlify তে deploy করুন:<br><span style="color:#7c3aed">netlify.com → drag & drop</span></p>
      </div>`;
    return;
  }
  if (!firebase.apps.length) firebase.initializeApp(FC);
  auth = firebase.auth();
  db = firebase.database();
  const urlRef = new URLSearchParams(window.location.search).get('ref');
  if (urlRef) document.getElementById('rRef').value = urlRef;
  auth.onAuthStateChanged(async u => {
    if (u) {
      curUser = u; isAdmin = u.email === ADMIN;
      await db.ref('users/' + u.uid).update({ email: u.email, displayName: u.displayName || u.email.split('@')[0], lastSeen: Date.now(), uid: u.uid });
      showApp();
    } else {
      curUser = null;
      document.getElementById('authPage').classList.add('active');
      document.getElementById('appPage').style.display = 'none';
    }
  });
});

// ─── AUTH ───────────────────────────────────────────────────
function authTab(t) {
  document.querySelectorAll('.atab').forEach((x, i) => x.classList.toggle('on', (i === 0 && t === 'login') || (i === 1 && t === 'reg')));
  document.getElementById('loginF').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('regF').style.display = t === 'reg' ? 'block' : 'none';
  document.getElementById('errBox').style.display = 'none';
}

async function login() {
  const e = document.getElementById('lEmail').value.trim();
  const p = document.getElementById('lPass').value;
  if (!e || !p) { showErr('ইমেইল ও পাসওয়ার্ড দিন'); return; }
  const btn = document.querySelector('#loginF .auth-submit');
  btn.innerHTML = '<span class="sp"></span>লগইন হচ্ছে...'; btn.disabled = true;
  try { await auth.signInWithEmailAndPassword(e, p); }
  catch (err) { showErr(errMsg(err.code)); btn.innerHTML = 'লগইন করুন →'; btn.disabled = false; }
}

async function register() {
  const nm = document.getElementById('rName').value.trim();
  const e = document.getElementById('rEmail').value.trim();
  const p = document.getElementById('rPass').value;
  const ref = document.getElementById('rRef').value.trim();
  if (!nm || !e || !p) { showErr('সব তথ্য পূরণ করুন'); return; }
  if (p.length < 6) { showErr('পাসওয়ার্ড কমপক্ষে ৬ অক্ষর'); return; }
  const btn = document.querySelector('#regF .auth-submit');
  btn.innerHTML = '<span class="sp"></span>তৈরি হচ্ছে...'; btn.disabled = true;
  try {
    const cr = await auth.createUserWithEmailAndPassword(e, p);
    await cr.user.updateProfile({ displayName: nm });
    const uid = cr.user.uid;
    const wallet = 'RSM' + [...Array(38)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const refCode = 'RSM' + Math.random().toString(36).substr(2, 6).toUpperCase();
    await db.ref('users/' + uid).set({ email: e, displayName: nm, uid, balance: BONUS, wallet, refCode, referredBy: ref || null, createdAt: Date.now(), banned: false });
    if (ref) {
      const snap = await db.ref('users').orderByChild('refCode').equalTo(ref).once('value');
      if (snap.exists()) {
        const [rUid] = Object.keys(snap.val());
        await db.ref('users/' + rUid + '/balance').transaction(b => (b || 0) + 10);
        await db.ref('users/' + rUid + '/referrals/' + uid).set({ name: nm, email: e, joinedAt: Date.now(), bonus: 10 });
      }
    }
    await db.ref('transactions').push({ uid, type: 'bonus', amount: BONUS, note: 'যোগদান বোনাস', createdAt: Date.now() });
  } catch (err) { showErr(errMsg(err.code)); btn.innerHTML = 'অ্যাকাউন্ট তৈরি করুন →'; btn.disabled = false; }
}

function logout() { auth.signOut(); showToast('লগআউট', 'আবার আসবেন!'); }
function showErr(m) { const e = document.getElementById('errBox'); e.textContent = m; e.style.display = 'block'; }
function errMsg(c) {
  return { 'auth/user-not-found': 'ইমেইল পাওয়া যায়নি', 'auth/wrong-password': 'পাসওয়ার্ড ভুল', 'auth/email-already-in-use': 'ইমেইল ইতিমধ্যে ব্যবহার হচ্ছে', 'auth/invalid-email': 'ইমেইল সঠিক নয়', 'auth/too-many-requests': 'অনেকবার চেষ্টা, পরে আবার চেষ্টা করুন' }[c] || 'কিছু একটা ভুল হয়েছে';
}

// ─── APP ────────────────────────────────────────────────────
function showApp() {
  document.getElementById('authPage').classList.remove('active');
  document.getElementById('appPage').style.display = 'block';
  const nm = curUser.displayName || curUser.email.split('@')[0];
  ['navNm', 'sbNm'].forEach(id => document.getElementById(id).textContent = nm);
  ['navAv', 'sbAv'].forEach(id => document.getElementById(id).textContent = nm[0].toUpperCase());
  document.getElementById('wName').textContent = nm;
  if (isAdmin) {
    document.getElementById('aBadge').style.display = 'inline';
    document.getElementById('sbBadge').style.display = 'inline';
    document.getElementById('sbi-admin-wrap').style.display = 'block';
  }
  db.ref('users/' + curUser.uid + '/balance').on('value', s => {
    const b = Math.floor(s.val() || 0);
    ['navBal', 'dashBal', 'walBal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = b; });
    document.getElementById('sbBal').textContent = b + ' RSMC';
  });
  loadAll();
}

// ─── TABS ───────────────────────────────────────────────────
function goTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.getElementById('tab-' + t).classList.add('on');
  updateSBActive(t);
  const loaders = { wallet: loadWallet, deposit: loadDeposit, withdraw: loadWithdraw, market: loadMarket, ref: loadRef, notices: loadNotices, admin: () => { if (isAdmin) loadAdmin(); } };
  if (loaders[t]) loaders[t]();
}

function adTab(sec, el) {
  document.querySelectorAll('.stab').forEach(x => x.classList.remove('on')); el.classList.add('on');
  ['users', 'tokens', 'deposits', 'withdraws', 'settings', 'send'].forEach(s => {
    document.getElementById('adSec-' + s).style.display = s === sec ? 'block' : 'none';
  });
}

// ─── SIDEBAR ─────────────────────────────────────────────────
function openSB() {
  document.getElementById('sidebar').classList.add('open');
  const ov = document.getElementById('sbOverlay');
  ov.style.display = 'block'; setTimeout(() => ov.style.opacity = '1', 10);
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  const ov = document.getElementById('sbOverlay');
  ov.style.opacity = '0'; setTimeout(() => ov.style.display = 'none', 300);
}
function updateSBActive(t) {
  document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('on'));
  const el = document.getElementById('sbi-' + t);
  if (el) el.classList.add('on');
}

// ─── LOAD ALL ────────────────────────────────────────────────
function loadAll() { loadDash(); loadMarket(); loadNotices(); loadSettings(); }

// ─── DASHBOARD ───────────────────────────────────────────────
function loadDash() {
  db.ref('tokens').once('value', s => {
    const all = Object.values(s.val() || {});
    document.getElementById('dTok').textContent = all.length;
    document.getElementById('dMyTok').textContent = all.filter(t => t.ownerUid === curUser.uid).length;
    const rec = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    const el = document.getElementById('recentToks');
    el.innerHTML = rec.length ? rec.map(t => tokRow(t)).join('') : '<div class="empty"><div class="empty-i">🪙</div><p>কোনো টোকেন নেই</p></div>';
  });
  db.ref('users').once('value', s => document.getElementById('dUsers').textContent = Object.keys(s.val() || {}).length);
  db.ref('users/' + curUser.uid + '/referrals').once('value', s => document.getElementById('dRef').textContent = Object.keys(s.val() || {}).length);
  db.ref('transactions').orderByChild('uid').equalTo(curUser.uid).limitToLast(3).once('value', s => {
    const txs = Object.values(s.val() || {}).reverse();
    const el = document.getElementById('dashTx');
    el.innerHTML = txs.length ? txs.map(tx => txRow(tx)).join('') : '<div class="empty"><div class="empty-i">📋</div><p>কোনো লেনদেন নেই</p></div>';
  });
  loadNoticesInDash();
}

function tokRow(t) {
  const [c1, c2] = t.color.split(','); const chg = parseFloat(t.change24h) || 0;
  return `<div class="tok-item">
    <div class="tok-av" style="background:linear-gradient(135deg,${c2},${c1})"><span class="tok-av-t">${(t.symbol || '?').substring(0, 3).toUpperCase()}</span></div>
    <div><div class="tok-nm">${t.name}</div><div class="tok-sy">$${t.symbol}</div></div>
    <div class="tok-bal"><div>${parseFloat(t.price || 0).toFixed(4)} RSMC</div><div class="${chg >= 0 ? 'up' : 'dn'}" style="font-size:0.68rem">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg)}%</div></div>
  </div>`;
}
function txRow(tx) {
  const icons = { send: '📤', receive: '📥', bonus: '🎁', buy: '🛒', deposit: '💰', withdraw: '📤', refbonus: '🔗' };
  const amtC = { send: 'var(--red)', receive: 'var(--green)', bonus: 'var(--gold)', buy: 'var(--red)', deposit: 'var(--green)', withdraw: 'var(--gold)', refbonus: 'var(--gold)' };
  const pfx = { send: '-', receive: '+', bonus: '+', buy: '-', deposit: '+', withdraw: '-', refbonus: '+' };
  return `<div class="tx-item">
    <div class="tx-ic" style="background:rgba(124,58,237,0.1)">${icons[tx.type] || '💎'}</div>
    <div><div class="tx-nm">${tx.note || tx.type}</div><div class="tx-dt">${new Date(tx.createdAt).toLocaleDateString('bn-BD')}</div></div>
    <div class="tx-amt" style="color:${amtC[tx.type] || 'var(--p)'}">${pfx[tx.type] || ''}${tx.amount} RSMC</div>
  </div>`;
}

// ─── WALLET ───────────────────────────────────────────────────
function loadWallet() {
  db.ref('users/' + curUser.uid).once('value', s => {
    const u = s.val() || {};
    const addr = u.wallet || 'RSM...';
    ['walAddr', 'recAddr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = addr; });
  });
  db.ref('tokens').orderByChild('ownerUid').equalTo(curUser.uid).once('value', s => {
    const toks = Object.values(s.val() || {});
    const el = document.getElementById('walToks');
    if (!toks.length) { el.innerHTML = '<div class="empty"><div class="empty-i">💎</div><p>কোনো টোকেন নেই<br><button onclick="goTab(\'mint\')" style="margin-top:8px;padding:6px 12px;background:var(--p);border:none;border-radius:7px;color:#fff;font-size:0.75rem;font-weight:700;cursor:pointer;">তৈরি করুন →</button></p></div>'; return; }
    el.innerHTML = toks.map(t => {
      const [c1, c2] = t.color.split(','); const sup = parseInt(t.supply) || 0;
      return `<div class="tok-item">
        <div class="tok-av" style="background:linear-gradient(135deg,${c2},${c1})"><span class="tok-av-t">${(t.symbol || '?').substring(0, 3).toUpperCase()}</span></div>
        <div><div class="tok-nm">${t.name}</div><div class="tok-sy">$${t.symbol} · RSMC-20</div></div>
        <div class="tok-bal"><div>${sup >= 1e9 ? (sup / 1e9).toFixed(1) + 'B' : sup >= 1e6 ? (sup / 1e6).toFixed(1) + 'M' : sup.toLocaleString()}</div><div style="font-size:0.65rem;color:var(--muted)">সাপ্লাই</div></div>
      </div>`;
    }).join('');
  });
  loadTxHistory('all');
}

function loadTxHistory(filter = 'all') {
  db.ref('transactions').orderByChild('uid').equalTo(curUser.uid).limitToLast(30).once('value', s => {
    let txs = Object.values(s.val() || {}).reverse();
    if (filter !== 'all') txs = txs.filter(tx => {
      if (filter === 'deposit') return ['deposit', 'bonus', 'refbonus', 'receive'].includes(tx.type);
      if (filter === 'withdraw') return ['withdraw', 'send', 'buy'].includes(tx.type);
      if (filter === 'referral') return tx.type === 'refbonus' || tx.note?.includes('রেফারেল');
      return true;
    });
    const el = document.getElementById('txList');
    el.innerHTML = txs.length ? txs.map(tx => txRow(tx)).join('') : '<div class="empty"><div class="empty-i">📋</div><p>কোনো লেনদেন নেই</p></div>';
  });
}

// ─── SEND/RECEIVE ────────────────────────────────────────────
function openSendMo() { document.getElementById('sendOv').classList.add('open'); }
function openReceiveMo() {
  db.ref('users/' + curUser.uid + '/wallet').once('value', s => { document.getElementById('recAddr').textContent = s.val() || 'RSM...'; });
  document.getElementById('recOv').classList.add('open');
}
async function doSend() {
  const to = document.getElementById('sendTo').value.trim();
  const amt = parseFloat(document.getElementById('sendAmt').value);
  const note = document.getElementById('sendNote').value.trim();
  if (!to || !amt || amt <= 0) { showToast('⚠️ ভুল', 'সঠিক তথ্য দিন'); return; }
  const snap = await db.ref('users').orderByChild('email').equalTo(to).once('value');
  if (!snap.exists()) { showToast('❌', 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই'); return; }
  const sSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
  if ((sSnap.val() || 0) < amt) { showToast('❌ অপর্যাপ্ত', 'পর্যাপ্ত RSMC নেই'); return; }
  const [rUid] = Object.keys(snap.val());
  if (rUid === curUser.uid) { showToast('❌', 'নিজেকে পাঠাতে পারবেন না'); return; }
  await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - amt);
  await db.ref('users/' + rUid + '/balance').transaction(b => (b || 0) + amt);
  const now = Date.now();
  await db.ref('transactions').push({ uid: curUser.uid, type: 'send', to, amount: amt, note: note || 'ট্রান্সফার', createdAt: now });
  await db.ref('transactions').push({ uid: rUid, type: 'receive', from: curUser.email, amount: amt, note: note || 'ট্রান্সফার', createdAt: now });
  closeOv('sendOv');
  ['sendTo', 'sendAmt', 'sendNote'].forEach(id => document.getElementById(id).value = '');
  showToast('✅ পাঠানো হয়েছে!', `${amt} RSMC পাঠানো হয়েছে`);
  loadWallet();
}
function copyWalAddr() {
  const addr = document.getElementById('walAddr')?.textContent || '';
  navigator.clipboard.writeText(addr).then(() => showToast('📋 কপি!', 'ওয়ালেট ঠিকানা কপি হয়েছে'));
}

// ─── DEPOSIT ─────────────────────────────────────────────────
function loadDeposit() {
  loadSettings();
  db.ref('deposits').orderByChild('uid').equalTo(curUser.uid).once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).reverse();
    const el = document.getElementById('depHistory');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">💰</div><p>কোনো ডিপোজিট নেই</p></div>'; return; }
    el.innerHTML = all.map(d => `<div class="pending-row">
      <div style="flex:1"><div style="font-size:0.82rem;font-weight:700">${d.method.toUpperCase()} — ${d.amount} RSMC</div>
      <div style="font-size:0.68rem;color:var(--muted)">${d.txId} · ${new Date(d.createdAt).toLocaleDateString('bn-BD')}</div></div>
      <span class="pst ${d.status === 'approved' ? 'pst-a' : d.status === 'rejected' ? 'pst-r' : 'pst-p'}">${d.status === 'approved' ? 'অনুমোদিত' : d.status === 'rejected' ? 'বাতিল' : 'পেন্ডিং'}</span>
    </div>`).join('');
  });
}
async function submitDeposit() {
  const method = document.getElementById('depMethod').value;
  const amt = parseFloat(document.getElementById('depAmt').value);
  const txId = document.getElementById('depTxId').value.trim();
  if (!amt || amt <= 0 || !txId) { showToast('⚠️', 'সব তথ্য পূরণ করুন'); return; }
  await db.ref('deposits').push({ uid: curUser.uid, email: curUser.email, name: curUser.displayName, method, amount: amt, txId, status: 'pending', createdAt: Date.now() });
  document.getElementById('depAmt').value = ''; document.getElementById('depTxId').value = '';
  showToast('✅ আবেদন করা হয়েছে!', 'Admin অনুমোদনের পর RSMC পাবেন');
  loadDeposit();
}

// ─── WITHDRAW ────────────────────────────────────────────────
function loadWithdraw() {
  db.ref('withdraws').orderByChild('uid').equalTo(curUser.uid).once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).reverse();
    const el = document.getElementById('witHistory');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">📤</div><p>কোনো উইথড্র নেই</p></div>'; return; }
    el.innerHTML = all.map(w => `<div class="pending-row">
      <div style="flex:1"><div style="font-size:0.82rem;font-weight:700">${w.method.toUpperCase()} — ${w.amount} RSMC</div>
      <div style="font-size:0.68rem;color:var(--muted)">${w.number} · ${new Date(w.createdAt).toLocaleDateString('bn-BD')}</div></div>
      <span class="pst ${w.status === 'approved' ? 'pst-a' : w.status === 'rejected' ? 'pst-r' : 'pst-p'}">${w.status === 'approved' ? 'অনুমোদিত' : w.status === 'rejected' ? 'বাতিল' : 'পেন্ডিং'}</span>
    </div>`).join('');
  });
}
async function submitWithdraw() {
  const method = document.getElementById('witMethod').value;
  const num = document.getElementById('witNum').value.trim();
  const amt = parseFloat(document.getElementById('witAmt').value);
  if (!num || !amt || amt <= 0) { showToast('⚠️', 'সব তথ্য পূরণ করুন'); return; }
  const balSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
  if ((balSnap.val() || 0) < amt) { showToast('❌ অপর্যাপ্ত', 'পর্যাপ্ত RSMC নেই'); return; }
  await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - amt);
  await db.ref('withdraws').push({ uid: curUser.uid, email: curUser.email, name: curUser.displayName, method, number: num, amount: amt, status: 'pending', createdAt: Date.now() });
  await db.ref('transactions').push({ uid: curUser.uid, type: 'withdraw', amount: amt, note: `উইথড্র আবেদন — ${method}`, createdAt: Date.now() });
  document.getElementById('witAmt').value = ''; document.getElementById('witNum').value = '';
  showToast('✅ আবেদন করা হয়েছে!', 'Admin অনুমোদনের পর পেমেন্ট পাবেন');
  loadWithdraw();
}

// ─── MINT ────────────────────────────────────────────────────
function selTp(el, t) { document.querySelectorAll('.tp').forEach(x => x.classList.remove('on')); el.classList.add('on'); tokType = t; }
function togF(el) { el.classList.toggle('on'); el.querySelector('.fcb').textContent = el.classList.contains('on') ? '✓' : '○'; }
function setAmt(id, v, el) { document.getElementById(id).value = v; document.querySelectorAll('.amount-row .amt-chip').forEach(x => x.classList.remove('on')); el.classList.add('on'); }

function lp() {
  const nm = document.getElementById('mNm').value || 'আপনার টোকেন';
  const sy = document.getElementById('mSy').value || 'TOKEN';
  const sup = document.getElementById('mSup').value || '0';
  const dec = document.getElementById('mDec').value;
  const [c1, c2] = document.getElementById('mCl').value.split(',');
  document.getElementById('pNm').textContent = nm;
  document.getElementById('pSy').textContent = '$' + sy.toUpperCase();
  document.getElementById('pCoinTxt').textContent = sy.substring(0, 4).toUpperCase() || 'RSM';
  const n = parseInt(sup.replace(/,/g, '')) || 0;
  document.getElementById('pSup').textContent = n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString();
  document.getElementById('pDec').textContent = dec;
  document.getElementById('pCoin').style.background = `linear-gradient(135deg,${c2},${c1})`;
}

async function doMint() {
  const nm = document.getElementById('mNm').value.trim();
  const sy = document.getElementById('mSy').value.trim().toUpperCase();
  const sup = document.getElementById('mSup').value.replace(/,/g, '');
  if (!nm || !sy) { showToast('⚠️', 'নাম ও সিম্বল দিন'); return; }
  const btn = document.getElementById('mBtn');
  btn.innerHTML = '<span class="sp"></span>মিন্ট হচ্ছে...'; btn.disabled = true;
  const addr = 'RSM' + [...Array(38)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const cl = document.getElementById('mCl').value;
  const feats = [...document.querySelectorAll('.fi2.on')].map(f => f.textContent.trim());
  const data = {
    name: nm, symbol: sy, supply: sup, decimals: document.getElementById('mDec').value,
    icon: document.getElementById('mIc').value || '🪙', desc: document.getElementById('mDs').value.trim(),
    color: cl, type: tokType, features: feats, contractAddress: addr,
    ownerUid: curUser.uid, ownerEmail: curUser.email,
    ownerName: curUser.displayName || curUser.email.split('@')[0],
    createdAt: Date.now(),
    price: (Math.random() * 0.05 + 0.001).toFixed(6),
    change24h: ((Math.random() - 0.3) * 15).toFixed(2), listed: true
  };
  try {
    await db.ref('tokens').push(data);
    document.getElementById('moNm').textContent = nm;
    document.getElementById('moSy').textContent = '$' + sy;
    document.getElementById('moSup').textContent = parseInt(sup).toLocaleString();
    document.getElementById('moAddr').textContent = addr;
    const mi = document.getElementById('moIcon');
    mi.innerHTML = `<span style="font-family:'Nunito',sans-serif;font-size:1rem;font-weight:900;color:#fff">${sy.substring(0, 3)}</span>`;
    mi.style.background = `linear-gradient(135deg,${cl.split(',')[1]},${cl.split(',')[0]})`;
    document.getElementById('mintOv').classList.add('open');
    btn.innerHTML = '🚀 RSM Chain এ মিন্ট করুন — বিনামূল্যে'; btn.disabled = false;
    document.getElementById('mNm').value = ''; document.getElementById('mSy').value = '';
    document.querySelectorAll('.fi2.on').forEach(f => { f.classList.remove('on'); f.querySelector('.fcb').textContent = '○'; });
    lp(); loadDash();
    showToast('🎉 সফল!', `${nm} ($${sy}) তৈরি হয়েছে!`);
  } catch (e) { showToast('❌', e.message); btn.innerHTML = '🚀 RSM Chain এ মিন্ট করুন — বিনামূল্যে'; btn.disabled = false; }
}
function cpAddr() { navigator.clipboard.writeText(document.getElementById('moAddr').textContent).then(() => showToast('📋 কপি!', 'Contract Address কপি হয়েছে')); }

// ─── MARKET + CHART ──────────────────────────────────────────
function mkFilt(f, el) { mkF = f; document.querySelectorAll('#mkFilter .tp').forEach(x => x.classList.remove('on')); el.classList.add('on'); loadMarket(); }

function loadMarket() {
  db.ref('tokens').once('value', s => {
    let all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).filter(t => t.listed !== false);
    if (mkF !== 'all') all = all.filter(t => t.type === mkF);
    all.sort((a, b) => b.createdAt - a.createdAt);
    const el = document.getElementById('mkBody');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">📊</div><p>কোনো টোকেন নেই</p></div>'; return; }
    el.innerHTML = all.map(t => {
      const [c1, c2] = t.color.split(','); const chg = parseFloat(t.change24h) || 0; const sup = parseInt(t.supply) || 0;
      return `<div class="mtr">
        <div style="display:flex;align-items:center;gap:9px;">
          <div class="tok-av" style="background:linear-gradient(135deg,${c2},${c1})"><span class="tok-av-t">${(t.symbol || '?').substring(0, 3).toUpperCase()}</span></div>
          <div><div style="font-size:0.83rem;font-weight:700">${t.name}</div><div style="font-family:'JetBrains Mono',monospace;font-size:0.65rem;color:var(--muted)">$${t.symbol}</div></div>
        </div>
        <div class="mc">${parseFloat(t.price || 0).toFixed(6)}</div>
        <div class="mc ${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg)}%</div>
        <div class="mc">${sup >= 1e9 ? (sup / 1e9).toFixed(1) + 'B' : sup >= 1e6 ? (sup / 1e6).toFixed(1) + 'M' : sup.toLocaleString()}</div>
        <div><button class="buy-btn" onclick="openBuy('${t.key}')">কিনুন</button></div>
      </div>`;
    }).join('');
    // Build chart with first token price as base
    if (all.length > 0) initPriceChart(all);
  });
}

function initPriceChart(tokens) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('priceChart');
  if (!ctx) return;
  if (priceChart) { priceChart.destroy(); priceChart = null; }

  // Generate simulated historical prices for top 3 tokens
  const top3 = tokens.slice(0, 3);
  const now = Date.now();
  const labels = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now - (23 - i) * 3600000);
    return d.getHours() + ':00';
  });
  const colors = ['#7c3aed', '#f59e0b', '#10b981'];

  const datasets = top3.map((t, idx) => {
    let base = parseFloat(t.price || 0.001);
    const data = Array.from({ length: 24 }, (_, i) => {
      base = Math.max(0.0001, base * (1 + (Math.random() - 0.48) * 0.06));
      return parseFloat(base.toFixed(6));
    });
    return {
      label: '$' + t.symbol,
      data,
      borderColor: colors[idx],
      backgroundColor: colors[idx] + '18',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.4
    };
  });

  priceChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: 'rgba(241,240,247,0.6)', font: { size: 11, family: 'Space Grotesk' }, boxWidth: 10 } },
        tooltip: {
          backgroundColor: '#1a1728',
          borderColor: 'rgba(124,58,237,0.3)', borderWidth: 1,
          titleColor: '#f1f0f7', bodyColor: 'rgba(241,240,247,0.6)',
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw} RSMC` }
        }
      },
      scales: {
        x: { ticks: { color: 'rgba(241,240,247,0.35)', font: { size: 10 }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: 'rgba(241,240,247,0.35)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } }
      }
    }
  });

  // Live update every 4 seconds
  if (chartInterval) clearInterval(chartInterval);
  chartInterval = setInterval(() => {
    if (!priceChart) return;
    priceChart.data.datasets.forEach(ds => {
      ds.data.shift();
      const last = ds.data[ds.data.length - 1];
      ds.data.push(parseFloat(Math.max(0.0001, last * (1 + (Math.random() - 0.48) * 0.04)).toFixed(6)));
    });
    const now2 = new Date();
    priceChart.data.labels.shift();
    priceChart.data.labels.push(now2.getHours() + ':' + String(now2.getMinutes()).padStart(2, '0'));
    priceChart.update('none');
  }, 4000);
}

function changeChartPeriod(p, el) {
  document.querySelectorAll('.chart-filter').forEach(x => x.classList.remove('on')); el.classList.add('on');
  loadMarket();
}

async function openBuy(key) {
  const s = await db.ref('tokens/' + key).once('value');
  if (!s.exists()) return;
  curBuyToken = { ...s.val(), key };
  const t = curBuyToken; const [c1, c2] = t.color.split(',');
  const bi = document.getElementById('buyIcon');
  bi.style.background = `linear-gradient(135deg,${c2},${c1})`;
  bi.innerHTML = `<span style="font-family:'Nunito',sans-serif;font-size:1rem;font-weight:900;color:#fff">${(t.symbol || '?').substring(0, 3).toUpperCase()}</span>`;
  document.getElementById('buyTitle').textContent = t.name + ' কিনুন';
  document.getElementById('buySub').textContent = 'আপনার RSMC দিয়ে $' + t.symbol + ' কিনুন';
  document.getElementById('buyInfo').innerHTML = `<div class="mir"><span class="mik">মূল্য</span><span class="miv">${parseFloat(t.price || 0).toFixed(6)} RSMC</span></div><div class="mir"><span class="mik">তৈরিকারী</span><span class="miv">${t.ownerName || '?'}</span></div>`;
  document.getElementById('buyAmt').value = '';
  document.getElementById('buyCalc').textContent = 'মূল্য: 0 RSMC';
  document.getElementById('buyAmt').oninput = () => {
    const a = parseFloat(document.getElementById('buyAmt').value) || 0;
    document.getElementById('buyCalc').textContent = `মোট: ${(a * parseFloat(t.price || 0)).toFixed(4)} RSMC`;
  };
  document.getElementById('buyOv').classList.add('open');
}
async function confirmBuy() {
  if (!curBuyToken) return;
  const amt = parseFloat(document.getElementById('buyAmt').value) || 0;
  if (amt <= 0) { showToast('⚠️', 'পরিমাণ দিন'); return; }
  const total = parseFloat((amt * parseFloat(curBuyToken.price || 0)).toFixed(4));
  const balSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
  if ((balSnap.val() || 0) < total) { showToast('❌', 'পর্যাপ্ত RSMC নেই'); return; }
  await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - total);
  if (curBuyToken.ownerUid !== curUser.uid) await db.ref('users/' + curBuyToken.ownerUid + '/balance').transaction(b => (b || 0) + total * 0.95);
  await db.ref('transactions').push({ uid: curUser.uid, type: 'buy', token: curBuyToken.symbol, amount: total, note: `${curBuyToken.name} কেনা`, createdAt: Date.now() });
  closeOv('buyOv');
  showToast('✅ কেনা হয়েছে!', `${amt} ${curBuyToken.symbol} কেনা হয়েছে`);
}

// ─── REFERRAL ────────────────────────────────────────────────
function loadRef() {
  db.ref('users/' + curUser.uid).once('value', s => {
    const u = s.val() || {};
    const url = `${location.origin}${location.pathname}?ref=${u.refCode || 'RSM000'}`;
    document.getElementById('refUrl').textContent = url;
  });
  db.ref('users/' + curUser.uid + '/referrals').once('value', s => {
    const refs = Object.values(s.val() || {});
    document.getElementById('rTotal').textContent = refs.length;
    document.getElementById('rEarned').textContent = refs.reduce((a, r) => a + (r.bonus || 0), 0);
    document.getElementById('rActive').textContent = refs.length;
    const el = document.getElementById('refList');
    if (!refs.length) { el.innerHTML = '<div class="empty"><div class="empty-i">👥</div><p>কেউ যোগ দেয়নি।<br>লিংক শেয়ার করুন!</p></div>'; return; }
    el.innerHTML = refs.map(r => `<div class="tok-item">
      <div style="width:32px;height:32px;border-radius:50%;background:rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:var(--p);flex-shrink:0">${(r.name || '?')[0].toUpperCase()}</div>
      <div><div class="tok-nm">${r.name}</div><div class="tok-sy">${r.email}</div></div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--gold)">+${r.bonus || 10} RSMC</div>
    </div>`).join('');
  });
}
function copyRef() { navigator.clipboard.writeText(document.getElementById('refUrl').textContent).then(() => showToast('📋 কপি!', 'রেফারেল লিংক কপি হয়েছে')); }

// ─── NOTICES ─────────────────────────────────────────────────
function loadNotices() {
  db.ref('notices').orderByChild('createdAt').limitToLast(20).once('value', s => {
    const all = Object.values(s.val() || {}).reverse();
    const el = document.getElementById('noticesList');
    el.innerHTML = all.length ? all.map(n => `<div class="notice-item"><div class="ni-title">📢 ${n.title}</div><div class="ni-body">${n.body}</div><div class="ni-date">${new Date(n.createdAt).toLocaleString('bn-BD')}</div></div>`).join('') : '<div class="empty"><div class="empty-i">📢</div><p>কোনো নোটিশ নেই</p></div>';
  });
}
function loadNoticesInDash() {
  db.ref('notices').orderByChild('createdAt').limitToLast(2).once('value', s => {
    const all = Object.values(s.val() || {}).reverse();
    const el = document.getElementById('dashNotices');
    el.innerHTML = all.length ? all.map(n => `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><div style="font-size:0.8rem;font-weight:700">${n.title}</div><div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${n.body.substring(0, 60)}${n.body.length > 60 ? '...' : ''}</div></div>`).join('') : '<div class="empty" style="padding:12px 0"><div class="empty-i" style="font-size:1.5rem">📢</div><p style="font-size:0.75rem">কোনো নোটিশ নেই</p></div>';
  });
}

// ─── SETTINGS ────────────────────────────────────────────────
async function loadSettings() {
  const s = await db.ref('settings').once('value');
  const st = s.val() || {};
  ['bkash', 'nagad', 'rocket'].forEach(k => { const el = document.getElementById('set' + k.charAt(0).toUpperCase() + k.slice(1)); if (el) el.value = st[k] || ''; });
  const method = document.getElementById('depMethod')?.value || 'bkash';
  const num = st[method] || 'সেট করা হয়নি';
  const pn = document.getElementById('payNum'); if (pn) pn.textContent = num + ' (' + method.toUpperCase() + ')';
}
document.addEventListener('change', function (e) { if (e.target.id === 'depMethod') loadSettings(); });
async function saveSettings() {
  const bkash = document.getElementById('setBkash').value.trim();
  const nagad = document.getElementById('setNagad').value.trim();
  const rocket = document.getElementById('setRocket').value.trim();
  await db.ref('settings').update({ bkash, nagad, rocket });
  showToast('✅ সেভ হয়েছে!', 'পেমেন্ট নম্বর আপডেট হয়েছে');
}

// ─── ADMIN ───────────────────────────────────────────────────
function loadAdmin() {
  // Tokens
  db.ref('tokens').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adTok').textContent = all.length;
    const el = document.getElementById('adTokList');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">🪙</div><p>কোনো টোকেন নেই</p></div>'; return; }
    el.innerHTML = all.map(t => `<div class="user-row">
      <div class="uav">${(t.symbol || '?')[0]}</div>
      <div style="flex:1"><div class="unm">${t.name} ($${t.symbol})</div><div class="uem">${t.ownerEmail} · সাপ্লাই: ${parseInt(t.supply||0).toLocaleString()}</div></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="abtn abtn-g" onclick="adminMintToken('${t.key}','${t.symbol}')">⬆️ মিন্ট</button>
        <button class="abtn abtn-r" onclick="adminBurnToken('${t.key}','${t.symbol}','${t.supply||0}')">🔥 বার্ন</button>
        <button class="abtn abtn-y" onclick="toggleTokList('${t.key}',${t.listed})">${t.listed ? '🔴 বাতিল' : '🟢 চালু'}</button>
        <button class="abtn abtn-r" onclick="deleteTok('${t.key}','${t.name}')">🗑️</button>
      </div>
    </div>`).join('');
  });
  // Users
  db.ref('users').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adUsr').textContent = all.length;
    const el = document.getElementById('adUsrList');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">👥</div><p>কোনো ইউজার নেই</p></div>'; return; }
    el.innerHTML = all.map(u => `<div class="user-row">
      <div class="uav">${(u.displayName || '?')[0].toUpperCase()}</div>
      <div style="flex:1">
        <div class="unm">${u.displayName || 'নাম নেই'} ${u.banned ? '<span class="ubanned">BAN</span>' : ''}</div>
        <div class="uem">${u.email} · ${Math.floor(u.balance || 0)} RSMC</div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="abtn abtn-y" onclick="toggleBan('${u.key}','${u.displayName}',${!!u.banned})">${u.banned ? '🟢 আনব্যান' : '🔴 ব্যান'}</button>
        <button class="abtn abtn-r" onclick="deleteUser('${u.key}','${u.email}')">🗑️</button>
      </div>
    </div>`).join('');
  });
  // Deposits
  db.ref('deposits').orderByChild('status').equalTo('pending').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adDepPend').textContent = all.length;
    const el = document.getElementById('adDepList');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">💰</div><p>কোনো পেন্ডিং নেই</p></div>'; return; }
    el.innerHTML = all.map(d => `<div class="pending-row">
      <div style="flex:1"><div style="font-size:0.82rem;font-weight:700">${d.name} — ${d.method.toUpperCase()} — ${d.amount} RSMC</div>
      <div style="font-size:0.68rem;color:var(--muted)">TrxID: ${d.txId} · ${d.email}</div></div>
      <div style="display:flex;gap:5px;">
        <button class="abtn abtn-p" onclick="approveDeposit('${d.key}','${d.uid}',${d.amount})">✅ অনুমোদন</button>
        <button class="abtn abtn-r" onclick="rejectDeposit('${d.key}')">❌ বাতিল</button>
      </div>
    </div>`).join('');
  });
  // Withdraws
  db.ref('withdraws').orderByChild('status').equalTo('pending').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adWitPend').textContent = all.length;
    const el = document.getElementById('adWitList');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">📤</div><p>কোনো পেন্ডিং নেই</p></div>'; return; }
    el.innerHTML = all.map(w => `<div class="pending-row">
      <div style="flex:1"><div style="font-size:0.82rem;font-weight:700">${w.name} — ${w.method.toUpperCase()} — ${w.amount} RSMC</div>
      <div style="font-size:0.68rem;color:var(--muted)">${w.number} · ${w.email}</div></div>
      <div style="display:flex;gap:5px;">
        <button class="abtn abtn-g" onclick="approveWithdraw('${w.key}')">✅ পাঠানো হয়েছে</button>
        <button class="abtn abtn-r" onclick="rejectWithdraw('${w.key}','${w.uid}',${w.amount})">❌ বাতিল</button>
      </div>
    </div>`).join('');
  });
  loadSettings();
}

// Admin: Mint/Burn token supply
function adminMintToken(key, symbol) {
  const amt = prompt(`${symbol} — কতটুকু মিন্ট করবেন?`);
  if (!amt || isNaN(parseInt(amt))) return;
  db.ref('tokens/' + key + '/supply').transaction(s => String(parseInt(s || 0) + parseInt(amt)));
  showToast('⬆️ মিন্ট হয়েছে', `${parseInt(amt).toLocaleString()} ${symbol} মিন্ট করা হয়েছে`);
  setTimeout(loadAdmin, 500);
}
function adminBurnToken(key, symbol, currentSupply) {
  const amt = prompt(`${symbol} — কতটুকু বার্ন করবেন? (বর্তমান: ${parseInt(currentSupply).toLocaleString()})`);
  if (!amt || isNaN(parseInt(amt))) return;
  const burn = Math.min(parseInt(amt), parseInt(currentSupply));
  db.ref('tokens/' + key + '/supply').transaction(s => String(Math.max(0, parseInt(s || 0) - burn)));
  showToast('🔥 বার্ন হয়েছে', `${burn.toLocaleString()} ${symbol} বার্ন করা হয়েছে`);
  setTimeout(loadAdmin, 500);
}

async function toggleBan(uid, name, isBanned) {
  await db.ref('users/' + uid + '/banned').set(!isBanned);
  showToast(isBanned ? '🟢 আনব্যান' : '🔴 ব্যান', `${name} ${isBanned ? 'আনব্যান' : 'ব্যান'} হয়েছে`);
  loadAdmin();
}
function deleteUser(uid, email) {
  showConfirm('⚠️ ইউজার মুছুন', `${email} এর অ্যাকাউন্ট মুছে ফেলবেন?`, async () => {
    await db.ref('users/' + uid).remove();
    showToast('🗑️ মুছে গেছে', `${email} ডিলিট হয়েছে`);
    loadAdmin();
  });
}
async function toggleTokList(key, listed) {
  await db.ref('tokens/' + key + '/listed').set(!listed);
  showToast(listed ? '🔴 বাতিল' : '🟢 চালু', 'টোকেন আপডেট হয়েছে');
  loadAdmin(); loadMarket();
}
function deleteTok(key, name) {
  showConfirm('🗑️ টোকেন মুছুন', `"${name}" টোকেন মুছে ফেলবেন?`, async () => {
    await db.ref('tokens/' + key).remove();
    showToast('🗑️', 'টোকেন মুছে গেছে');
    loadAdmin(); loadMarket(); loadDash();
  });
}
async function approveDeposit(key, uid, amt) {
  await db.ref('deposits/' + key + '/status').set('approved');
  await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt);
  await db.ref('transactions').push({ uid, type: 'deposit', amount: amt, note: 'ডিপোজিট অনুমোদিত', createdAt: Date.now() });
  showToast('✅ অনুমোদিত!', `${amt} RSMC যোগ হয়েছে`);
  loadAdmin();
}
async function rejectDeposit(key) {
  await db.ref('deposits/' + key + '/status').set('rejected');
  showToast('❌ বাতিল', 'ডিপোজিট বাতিল করা হয়েছে');
  loadAdmin();
}
async function approveWithdraw(key) {
  await db.ref('withdraws/' + key + '/status').set('approved');
  showToast('✅ সম্পন্ন!', 'উইথড্র অনুমোদিত হয়েছে');
  loadAdmin();
}
async function rejectWithdraw(key, uid, amt) {
  await db.ref('withdraws/' + key + '/status').set('rejected');
  await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt);
  await db.ref('transactions').push({ uid, type: 'receive', amount: amt, note: 'উইথড্র বাতিল — ফেরত', createdAt: Date.now() });
  showToast('↩️ ফেরত দেওয়া হয়েছে', `${amt} RSMC ফেরত গেছে`);
  loadAdmin();
}
async function giveRSMC() {
  const email = document.getElementById('adEmail').value.trim();
  const amt = parseFloat(document.getElementById('adAmt').value);
  if (!email || !amt) { showToast('⚠️', 'তথ্য দিন'); return; }
  const s = await db.ref('users').orderByChild('email').equalTo(email).once('value');
  if (!s.exists()) { showToast('❌', 'ইউজার পাওয়া যায়নি'); return; }
  const [uid] = Object.keys(s.val());
  await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt);
  await db.ref('transactions').push({ uid, type: 'bonus', amount: amt, note: 'Admin বোনাস', createdAt: Date.now() });
  showToast('✅ পাঠানো হয়েছে!', `${amt} RSMC পাঠানো হয়েছে`);
  document.getElementById('adEmail').value = ''; document.getElementById('adAmt').value = '';
}
async function takeRSMC() {
  const email = document.getElementById('adEmail').value.trim();
  const amt = parseFloat(document.getElementById('adAmt').value);
  if (!email || !amt) { showToast('⚠️', 'তথ্য দিন'); return; }
  const s = await db.ref('users').orderByChild('email').equalTo(email).once('value');
  if (!s.exists()) { showToast('❌', 'ইউজার পাওয়া যায়নি'); return; }
  const [uid] = Object.keys(s.val());
  await db.ref('users/' + uid + '/balance').transaction(b => Math.max(0, (b || 0) - amt));
  showToast('➖ কাটা হয়েছে', `${amt} RSMC কাটা হয়েছে`);
}
async function sendNotice() {
  const t = document.getElementById('notTitle').value.trim();
  const b = document.getElementById('notBody').value.trim();
  if (!t || !b) { showToast('⚠️', 'শিরোনাম ও বিবরণ দিন'); return; }
  await db.ref('notices').push({ title: t, body: b, createdAt: Date.now(), from: curUser.email });
  document.getElementById('notTitle').value = ''; document.getElementById('notBody').value = '';
  showToast('📢 পাঠানো হয়েছে!', t);
  loadNotices();
}

// ─── WEB3 / WALLET CONNECT ────────────────────────────────────
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showToast('⚠️ MetaMask নেই', 'Trust Wallet বা MetaMask ইন্সটল করুন');
    window.open('https://metamask.io/download/', '_blank');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    web3Address = accounts[0];
    // Switch to BSC
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (sw) {
      if (sw.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{ chainId: BSC_CHAIN_ID, chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com/'] }]
        });
      }
    }
    // Save to Firebase
    await db.ref('users/' + curUser.uid + '/web3Address').set(web3Address);
    updateWeb3UI(true);
    showToast('✅ ওয়ালেট সংযুক্ত!', web3Address.substring(0, 10) + '...' + web3Address.slice(-6));
    // Listen for account changes
    window.ethereum.on('accountsChanged', accs => {
      if (!accs.length) { disconnectWallet(); } else { web3Address = accs[0]; updateWeb3UI(true); }
    });
  } catch (e) {
    showToast('❌ সংযোগ ব্যর্থ', e.message.substring(0, 60));
  }
}

function disconnectWallet() {
  web3Address = null; web3Provider = null; web3Signer = null;
  updateWeb3UI(false);
  showToast('🔌 ডিসকানেক্ট', 'ওয়ালেট বিচ্ছিন্ন হয়েছে');
}

function updateWeb3UI(connected) {
  const btns = document.querySelectorAll('.wallet-connect-btn');
  btns.forEach(btn => {
    if (connected) {
      btn.classList.add('connected');
      btn.textContent = '🟢 ' + web3Address.substring(0, 6) + '...' + web3Address.slice(-4);
      btn.onclick = disconnectWallet;
    } else {
      btn.classList.remove('connected');
      btn.textContent = '🔗 Wallet Connect';
      btn.onclick = connectWallet;
    }
  });
  const dots = document.querySelectorAll('.w3-dot');
  dots.forEach(d => { d.classList.toggle('on', connected); d.classList.toggle('off', !connected); });
  const addrEl = document.getElementById('web3Addr');
  if (addrEl) addrEl.textContent = connected ? web3Address : 'সংযুক্ত নয়';
}

// ─── CONFIRM MODAL ───────────────────────────────────────────
function showConfirm(title, msg, cb) {
  document.getElementById('cfTitle').textContent = title;
  document.getElementById('cfMsg').textContent = msg;
  cfCallback = cb;
  document.getElementById('cfBtn').onclick = () => { cb(); closeOv('confirmOv'); };
  document.getElementById('confirmOv').classList.add('open');
}

// ─── HELPERS ─────────────────────────────────────────────────
function closeOv(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => {
  if (e.target.classList.contains('ov')) e.target.classList.remove('open');
});
function showToast(t, m) {
  const el = document.getElementById('toast');
  document.getElementById('tT').textContent = t;
  document.getElementById('tM').textContent = m || '';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}
