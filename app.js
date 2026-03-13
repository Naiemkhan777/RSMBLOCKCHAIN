/* ============================================================
   RSM Chain — app.js (v4 — Contract + Web3 + Chart)
   ============================================================ */
'use strict';

// ════════════════════════════════════════════════════════════
// ① CONTRACT INTEGRATION PLACEHOLDER
//    Deploy করার পর নিচের দুই লাইন আপডেট করুন:
//    CONTRACT_ADDRESS → Remix.ethereum.org থেকে কপি করুন
//    CONTRACT_ABI     → RSMChain.sol compile → ABI JSON
// ════════════════════════════════════════════════════════════
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
// Example after deploy: "0xAbCd1234567890AbCd1234567890AbCd12345678"

const CONTRACT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount, string reason) returns ()",
  "function burn(uint256 amount, string reason) returns ()",
  "function adminBurn(address from, uint256 amount, string reason) returns ()",
  "function pause() returns ()",
  "function unpause() returns ()",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner) returns ()",
  "function remainingMintable() view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event TokensMinted(address indexed to, uint256 amount, string reason)",
  "event TokensBurned(address indexed from, uint256 amount, string reason)"
];

// Placeholder address হলে Demo Mode (Firebase only)
const CONTRACT_DEPLOYED = CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

// ════════════════════════════════════════════════════════════
// FIREBASE CONFIG
// ════════════════════════════════════════════════════════════
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
const BSC_CHAIN_ID = '0x38'; // BSC Mainnet = 56

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
let auth, db, curUser, isAdmin = false;
let curBuyToken = null, cfCallback = null;
let ethersProvider = null, ethersSigner = null, web3Address = null;
let rsmContract = null, rsmContractWriter = null;
let priceChart = null, dummyInterval = null, dummyPrices = {};
let mkF = 'all', tokType = 'utility';

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  if (typeof firebase === 'undefined') {
    document.getElementById('authPage').innerHTML =
      '<div style="text-align:center;padding:40px;position:relative;z-index:2;max-width:380px;margin:auto">' +
      '<div style="font-size:3rem">⚠️</div>' +
      '<h2 style="color:#7c3aed;font-family:Nunito,sans-serif;margin:14px 0 10px">Firebase লোড হয়নি</h2>' +
      '<p style="color:#888;font-size:0.83rem;line-height:1.8">Chrome বা Firefox এ খুলুন অথবা Netlify তে deploy করুন।</p></div>';
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
      autoReconnectWallet();
    } else {
      curUser = null;
      document.getElementById('authPage').classList.add('active');
      document.getElementById('appPage').style.display = 'none';
      stopDummyChart();
    }
  });
});

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
function authTab(t) {
  document.querySelectorAll('.atab').forEach((x, i) => x.classList.toggle('on', (i===0&&t==='login')||(i===1&&t==='reg')));
  document.getElementById('loginF').style.display = t === 'login' ? 'block' : 'none';
  document.getElementById('regF').style.display = t === 'reg' ? 'block' : 'none';
  document.getElementById('errBox').style.display = 'none';
}
async function login() {
  const e = document.getElementById('lEmail').value.trim(), p = document.getElementById('lPass').value;
  if (!e || !p) { showErr('ইমেইল ও পাসওয়ার্ড দিন'); return; }
  const btn = document.querySelector('#loginF .auth-submit');
  btn.innerHTML = '<span class="sp"></span>লগইন হচ্ছে...'; btn.disabled = true;
  try { await auth.signInWithEmailAndPassword(e, p); }
  catch (err) { showErr(errMsg(err.code)); btn.innerHTML = 'লগইন করুন →'; btn.disabled = false; }
}
async function register() {
  const nm = document.getElementById('rName').value.trim(), e = document.getElementById('rEmail').value.trim(),
        p = document.getElementById('rPass').value, ref = document.getElementById('rRef').value.trim();
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
function logout() { disconnectWallet(true); auth.signOut(); showToast('লগআউট', 'আবার আসবেন!'); }
function showErr(m) { const e = document.getElementById('errBox'); e.textContent = m; e.style.display = 'block'; }
function errMsg(c) {
  return { 'auth/user-not-found': 'ইমেইল পাওয়া যায়নি', 'auth/wrong-password': 'পাসওয়ার্ড ভুল', 'auth/email-already-in-use': 'ইমেইল ইতিমধ্যে ব্যবহার হচ্ছে', 'auth/invalid-email': 'ইমেইল সঠিক নয়', 'auth/too-many-requests': 'অনেকবার চেষ্টা, পরে আবার চেষ্টা করুন' }[c] || 'কিছু একটা ভুল হয়েছে';
}

// ════════════════════════════════════════════════════════════
// APP INIT
// ════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════
// TABS & SIDEBAR
// ════════════════════════════════════════════════════════════
function goTab(t) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  document.getElementById('tab-' + t).classList.add('on');
  updateSBActive(t);
  const L = { wallet: loadWallet, deposit: loadDeposit, withdraw: loadWithdraw, market: loadMarket, ref: loadRef, notices: loadNotices, admin: () => { if (isAdmin) loadAdmin(); } };
  if (L[t]) L[t]();
}
function adTab(sec, el) {
  document.querySelectorAll('.stab').forEach(x => x.classList.remove('on')); el.classList.add('on');
  ['users','tokens','deposits','withdraws','settings','send'].forEach(s => document.getElementById('adSec-' + s).style.display = s === sec ? 'block' : 'none');
}
function openSB() {
  document.getElementById('sidebar').classList.add('open');
  const ov = document.getElementById('sbOverlay'); ov.style.display = 'block'; setTimeout(() => ov.style.opacity = '1', 10);
}
function closeSB() {
  document.getElementById('sidebar').classList.remove('open');
  const ov = document.getElementById('sbOverlay'); ov.style.opacity = '0'; setTimeout(() => ov.style.display = 'none', 300);
}
function updateSBActive(t) { document.querySelectorAll('.sb-item').forEach(x => x.classList.remove('on')); const el = document.getElementById('sbi-' + t); if (el) el.classList.add('on'); }
function loadAll() { loadDash(); loadMarket(); loadNotices(); loadSettings(); }

// ════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════
function loadDash() {
  db.ref('tokens').once('value', s => {
    const all = Object.values(s.val() || {});
    document.getElementById('dTok').textContent = all.length;
    document.getElementById('dMyTok').textContent = all.filter(t => t.ownerUid === curUser.uid).length;
    const rec = all.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    document.getElementById('recentToks').innerHTML = rec.length ? rec.map(tokRow).join('') : '<div class="empty"><div class="empty-i">🪙</div><p>কোনো টোকেন নেই</p></div>';
  });
  db.ref('users').once('value', s => document.getElementById('dUsers').textContent = Object.keys(s.val() || {}).length);
  db.ref('users/' + curUser.uid + '/referrals').once('value', s => document.getElementById('dRef').textContent = Object.keys(s.val() || {}).length);
  db.ref('transactions').orderByChild('uid').equalTo(curUser.uid).limitToLast(3).once('value', s => {
    const txs = Object.values(s.val() || {}).reverse();
    document.getElementById('dashTx').innerHTML = txs.length ? txs.map(txRow).join('') : '<div class="empty"><div class="empty-i">📋</div><p>কোনো লেনদেন নেই</p></div>';
  });
  loadNoticesInDash();
  updateContractStatusUI();
}
function tokRow(t) {
  const [c1, c2] = t.color.split(','); const chg = parseFloat(t.change24h) || 0;
  return '<div class="tok-item"><div class="tok-av" style="background:linear-gradient(135deg,' + c2 + ',' + c1 + ')"><span class="tok-av-t">' + (t.symbol || '?').substring(0, 3).toUpperCase() + '</span></div><div><div class="tok-nm">' + t.name + '</div><div class="tok-sy">$' + t.symbol + '</div></div><div class="tok-bal"><div>' + parseFloat(t.price || 0).toFixed(4) + ' RSMC</div><div class="' + (chg >= 0 ? 'up' : 'dn') + '" style="font-size:0.68rem">' + (chg >= 0 ? '▲' : '▼') + Math.abs(chg) + '%</div></div></div>';
}
function txRow(tx) {
  const ic = { send: '📤', receive: '📥', bonus: '🎁', buy: '🛒', deposit: '💰', withdraw: '📤', refbonus: '🔗', contract: '🔷' };
  const ac = { send: 'var(--red)', receive: 'var(--green)', bonus: 'var(--gold)', buy: 'var(--red)', deposit: 'var(--green)', withdraw: 'var(--gold)', refbonus: 'var(--gold)', contract: 'var(--blue)' };
  const px = { send: '-', receive: '+', bonus: '+', buy: '-', deposit: '+', withdraw: '-', refbonus: '+', contract: '⛓' };
  const bsc = tx.txHash ? ' · <a href="https://bscscan.com/tx/' + tx.txHash + '" target="_blank" style="color:var(--blue);font-size:0.65rem">BSCScan ↗</a>' : '';
  return '<div class="tx-item"><div class="tx-ic" style="background:rgba(124,58,237,0.1)">' + (ic[tx.type] || '💎') + '</div><div><div class="tx-nm">' + (tx.note || tx.type) + '</div><div class="tx-dt">' + new Date(tx.createdAt).toLocaleDateString('bn-BD') + bsc + '</div></div><div class="tx-amt" style="color:' + (ac[tx.type] || 'var(--p)') + '">' + (px[tx.type] || '') + tx.amount + ' RSMC</div></div>';
}
function updateContractStatusUI() {
  const el = document.getElementById('contractStatus'); if (!el) return;
  el.innerHTML = CONTRACT_DEPLOYED
    ? '<span style="color:var(--green)">✅ Contract: ' + CONTRACT_ADDRESS.substring(0, 8) + '...' + CONTRACT_ADDRESS.slice(-6) + '</span>'
    : '<span style="color:var(--gold)">⚠️ Demo Mode — Contract deploy করুন তারপর ব্যবহার করুন</span>';
}

// ════════════════════════════════════════════════════════════
// ② WALLET CONNECT — Balance fetched from smart contract
// ════════════════════════════════════════════════════════════
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showToast('⚠️ ওয়ালেট নেই', 'Trust Wallet বা MetaMask ইন্সটল করুন');
    window.open('https://metamask.io/download/', '_blank'); return;
  }
  showToast('⏳ সংযুক্ত হচ্ছে...', 'ওয়ালেটে অনুমতি দিন');
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    web3Address = accounts[0];
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (sw) {
      if (sw.code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BSC_CHAIN_ID, chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com/'] }] });
      } else throw sw;
    }
    if (typeof ethers === 'undefined') { showToast('⚠️', 'ethers.js লোড হয়নি — index.html এ CDN যোগ করুন'); return; }
    ethersProvider = new ethers.BrowserProvider(window.ethereum);
    ethersSigner = await ethersProvider.getSigner();
    if (CONTRACT_DEPLOYED) {
      rsmContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersProvider);
      rsmContractWriter = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersSigner);
    }
    await db.ref('users/' + curUser.uid).update({ web3Address, web3Connected: true });
    await fetchContractBalance();
    updateWeb3UI(true);
    showToast('✅ ওয়ালেট সংযুক্ত!', web3Address.substring(0, 6) + '...' + web3Address.slice(-4) + (CONTRACT_DEPLOYED ? ' | RSM loaded' : ' | Demo Mode'));
    window.ethereum.on('accountsChanged', async accs => {
      if (!accs.length) { disconnectWallet(); return; }
      web3Address = accs[0];
      ethersSigner = await ethersProvider.getSigner();
      if (CONTRACT_DEPLOYED) rsmContractWriter = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersSigner);
      await fetchContractBalance(); updateWeb3UI(true);
    });
    window.ethereum.on('chainChanged', () => window.location.reload());
  } catch (e) {
    if (e.code === 4001) showToast('❌ বাতিল', 'ওয়ালেট সংযোগ বাতিল');
    else showToast('❌ সংযোগ ব্যর্থ', e.message.substring(0, 70));
  }
}
async function autoReconnectWallet() {
  if (typeof window.ethereum === 'undefined' || typeof ethers === 'undefined') return;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (!accounts.length) return;
    web3Address = accounts[0];
    ethersProvider = new ethers.BrowserProvider(window.ethereum);
    ethersSigner = await ethersProvider.getSigner();
    if (CONTRACT_DEPLOYED) {
      rsmContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersProvider);
      rsmContractWriter = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersSigner);
      await fetchContractBalance();
    }
    updateWeb3UI(true);
  } catch (_) {}
}

// ── ② Fetch RSM balance directly from deployed smart contract ──
async function fetchContractBalance() {
  if (!web3Address) return;
  if (CONTRACT_DEPLOYED && rsmContract) {
    try {
      const raw = await rsmContract.balanceOf(web3Address);
      const bal = parseFloat(ethers.formatUnits(raw, 18));
      const rounded = Math.floor(bal);
      await db.ref('users/' + curUser.uid + '/onChainBalance').set(rounded);
      const el = document.getElementById('onChainBal'); if (el) el.textContent = rounded.toLocaleString() + ' RSM';
      showToast('💎 On-Chain Balance', rounded.toLocaleString() + ' RSM লোড হয়েছে');
    } catch (err) { showToast('⚠️ Contract', 'Balance পড়তে সমস্যা'); }
  } else {
    const el = document.getElementById('onChainBal'); if (el) el.textContent = 'Demo Mode';
  }
}
function disconnectWallet(silent = false) {
  web3Address = null; ethersProvider = null; ethersSigner = null; rsmContract = null; rsmContractWriter = null;
  if (curUser) db.ref('users/' + curUser.uid + '/web3Connected').set(false);
  updateWeb3UI(false);
  if (!silent) showToast('🔌 ডিসকানেক্ট', 'ওয়ালেট বিচ্ছিন্ন হয়েছে');
}
function updateWeb3UI(connected) {
  document.querySelectorAll('.wallet-connect-btn').forEach(btn => {
    btn.classList.toggle('connected', connected);
    btn.textContent = connected ? '🟢 ' + web3Address.substring(0, 6) + '...' + web3Address.slice(-4) : '🔗 Wallet Connect';
    btn.onclick = connected ? disconnectWallet : connectWallet;
  });
  document.querySelectorAll('.w3-dot').forEach(d => { d.classList.toggle('on', connected); d.classList.toggle('off', !connected); });
  const a = document.getElementById('web3Addr'); if (a) a.textContent = connected ? web3Address : 'সংযুক্ত নয়';
  const w = document.getElementById('walWeb3'); if (w) w.textContent = connected ? web3Address : 'সংযুক্ত নয়';
}

// ════════════════════════════════════════════════════════════
// ③ TRANSACTION LOGIC — ethers.js popup for Trust Wallet
// ════════════════════════════════════════════════════════════
async function onChainTransfer(toAddress, amountRSM) {
  if (!web3Address || !rsmContractWriter) { showToast('⚠️', 'Wallet Connect করুন'); return false; }
  if (!CONTRACT_DEPLOYED) { showToast('⚠️ Demo', 'Contract deploy করুন'); return false; }
  try {
    showToast('⏳ ট্রানজেকশন...', 'Trust Wallet এ কনফার্ম করুন');
    const amountWei = ethers.parseUnits(String(amountRSM), 18);
    const tx = await rsmContractWriter.transfer(toAddress, amountWei); // Trust Wallet popup ↑
    showToast('📡 Pending...', 'Blockchain এ যাচ্ছে...');
    const receipt = await tx.wait(1); // Wait 1 block confirmation
    // Save confirmed tx to Firebase after blockchain success
    await db.ref('transactions').push({
      uid: curUser.uid, type: 'contract', amount: amountRSM,
      note: 'On-Chain Transfer → ' + toAddress.substring(0, 8) + '...',
      txHash: receipt.hash, blockNum: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(), network: 'BSC Mainnet', createdAt: Date.now()
    });
    await fetchContractBalance();
    showToast('✅ ট্রানজেকশন সফল!', 'Hash: ' + receipt.hash.substring(0, 12) + '...');
    return receipt;
  } catch (e) {
    if (e.code === 4001 || e.code === 'ACTION_REJECTED') showToast('❌ বাতিল', 'ট্রানজেকশন বাতিল করা হয়েছে');
    else showToast('❌ ব্যর্থ', e.reason || e.message.substring(0, 70));
    return false;
  }
}

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
  const isOnChain = /^0x[0-9a-fA-F]{40}$/.test(to);
  if (isOnChain && web3Address && CONTRACT_DEPLOYED) {
    const raw = await rsmContract.balanceOf(web3Address);
    if (parseFloat(ethers.formatUnits(raw, 18)) < amt) { showToast('❌ অপর্যাপ্ত', 'On-chain RSM কম'); return; }
    await onChainTransfer(to, amt);
  } else {
    const snap = await db.ref('users').orderByChild('email').equalTo(to).once('value');
    if (!snap.exists()) { showToast('❌', 'এই ইমেইলে অ্যাকাউন্ট নেই'); return; }
    const sSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
    if ((sSnap.val() || 0) < amt) { showToast('❌ অপর্যাপ্ত', 'পর্যাপ্ত RSMC নেই'); return; }
    const [rUid] = Object.keys(snap.val());
    if (rUid === curUser.uid) { showToast('❌', 'নিজেকে পাঠাতে পারবেন না'); return; }
    const now = Date.now();
    await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - amt);
    await db.ref('users/' + rUid + '/balance').transaction(b => (b || 0) + amt);
    await db.ref('transactions').push({ uid: curUser.uid, type: 'send', to, amount: amt, note: note || 'ট্রান্সফার', createdAt: now });
    await db.ref('transactions').push({ uid: rUid, type: 'receive', from: curUser.email, amount: amt, note: note || 'ট্রান্সফার', createdAt: now });
    showToast('✅ পাঠানো হয়েছে!', amt + ' RSMC → ' + to);
  }
  closeOv('sendOv'); ['sendTo', 'sendAmt', 'sendNote'].forEach(id => document.getElementById(id).value = ''); loadWallet();
}
function copyWalAddr() { navigator.clipboard.writeText(document.getElementById('walAddr')?.textContent || '').then(() => showToast('📋 কপি!', 'ওয়ালেট ঠিকানা কপি')); }

// ════════════════════════════════════════════════════════════
// WALLET TAB
// ════════════════════════════════════════════════════════════
function loadWallet() {
  db.ref('users/' + curUser.uid).once('value', s => {
    const u = s.val() || {}, addr = u.wallet || 'RSM...';
    ['walAddr', 'recAddr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = addr; });
    const ocEl = document.getElementById('onChainBal'); if (ocEl && u.onChainBalance) ocEl.textContent = u.onChainBalance.toLocaleString() + ' RSM';
  });
  db.ref('tokens').orderByChild('ownerUid').equalTo(curUser.uid).once('value', s => {
    const toks = Object.values(s.val() || {}), el = document.getElementById('walToks');
    if (!toks.length) { el.innerHTML = '<div class="empty"><div class="empty-i">💎</div><p>কোনো টোকেন নেই<br><button onclick="goTab(\'mint\')" style="margin-top:8px;padding:6px 12px;background:var(--p);border:none;border-radius:7px;color:#fff;font-size:0.75rem;font-weight:700;cursor:pointer;">তৈরি করুন →</button></p></div>'; return; }
    el.innerHTML = toks.map(t => { const [c1, c2] = t.color.split(','), sup = parseInt(t.supply) || 0; return '<div class="tok-item"><div class="tok-av" style="background:linear-gradient(135deg,' + c2 + ',' + c1 + ')"><span class="tok-av-t">' + (t.symbol || '?').substring(0, 3).toUpperCase() + '</span></div><div><div class="tok-nm">' + t.name + '</div><div class="tok-sy">$' + t.symbol + ' · RSMC-20</div></div><div class="tok-bal"><div>' + (sup >= 1e9 ? (sup / 1e9).toFixed(1) + 'B' : sup >= 1e6 ? (sup / 1e6).toFixed(1) + 'M' : sup.toLocaleString()) + '</div><div style="font-size:0.65rem;color:var(--muted)">সাপ্লাই</div></div></div>'; }).join('');
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
    el.innerHTML = txs.length ? txs.map(txRow).join('') : '<div class="empty"><div class="empty-i">📋</div><p>কোনো লেনদেন নেই</p></div>';
  });
}

// ════════════════════════════════════════════════════════════
// DEPOSIT / WITHDRAW
// ════════════════════════════════════════════════════════════
function loadDeposit() {
  loadSettings();
  db.ref('deposits').orderByChild('uid').equalTo(curUser.uid).once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).reverse(), el = document.getElementById('depHistory');
    el.innerHTML = all.length ? all.map(d => '<div class="pending-row"><div style="flex:1"><div style="font-size:0.82rem;font-weight:700">' + d.method.toUpperCase() + ' — ' + d.amount + ' RSMC</div><div style="font-size:0.68rem;color:var(--muted)">' + d.txId + ' · ' + new Date(d.createdAt).toLocaleDateString('bn-BD') + '</div></div><span class="pst ' + (d.status === 'approved' ? 'pst-a' : d.status === 'rejected' ? 'pst-r' : 'pst-p') + '">' + (d.status === 'approved' ? 'অনুমোদিত' : d.status === 'rejected' ? 'বাতিল' : 'পেন্ডিং') + '</span></div>').join('') : '<div class="empty"><div class="empty-i">💰</div><p>কোনো ডিপোজিট নেই</p></div>';
  });
}
async function submitDeposit() {
  const method = document.getElementById('depMethod').value, amt = parseFloat(document.getElementById('depAmt').value), txId = document.getElementById('depTxId').value.trim();
  if (!amt || amt <= 0 || !txId) { showToast('⚠️', 'সব তথ্য পূরণ করুন'); return; }
  await db.ref('deposits').push({ uid: curUser.uid, email: curUser.email, name: curUser.displayName, method, amount: amt, txId, status: 'pending', createdAt: Date.now() });
  document.getElementById('depAmt').value = ''; document.getElementById('depTxId').value = '';
  showToast('✅ আবেদন করা হয়েছে!', 'Admin অনুমোদনের পর RSMC পাবেন'); loadDeposit();
}
function loadWithdraw() {
  db.ref('withdraws').orderByChild('uid').equalTo(curUser.uid).once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).reverse(), el = document.getElementById('witHistory');
    el.innerHTML = all.length ? all.map(w => '<div class="pending-row"><div style="flex:1"><div style="font-size:0.82rem;font-weight:700">' + w.method.toUpperCase() + ' — ' + w.amount + ' RSMC</div><div style="font-size:0.68rem;color:var(--muted)">' + w.number + ' · ' + new Date(w.createdAt).toLocaleDateString('bn-BD') + '</div></div><span class="pst ' + (w.status === 'approved' ? 'pst-a' : w.status === 'rejected' ? 'pst-r' : 'pst-p') + '">' + (w.status === 'approved' ? 'অনুমোদিত' : w.status === 'rejected' ? 'বাতিল' : 'পেন্ডিং') + '</span></div>').join('') : '<div class="empty"><div class="empty-i">📤</div><p>কোনো উইথড্র নেই</p></div>';
  });
}
async function submitWithdraw() {
  const method = document.getElementById('witMethod').value, num = document.getElementById('witNum').value.trim(), amt = parseFloat(document.getElementById('witAmt').value);
  if (!num || !amt || amt <= 0) { showToast('⚠️', 'সব তথ্য পূরণ করুন'); return; }
  const balSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
  if ((balSnap.val() || 0) < amt) { showToast('❌ অপর্যাপ্ত', 'পর্যাপ্ত RSMC নেই'); return; }
  await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - amt);
  await db.ref('withdraws').push({ uid: curUser.uid, email: curUser.email, name: curUser.displayName, method, number: num, amount: amt, status: 'pending', createdAt: Date.now() });
  await db.ref('transactions').push({ uid: curUser.uid, type: 'withdraw', amount: amt, note: 'উইথড্র আবেদন — ' + method, createdAt: Date.now() });
  document.getElementById('witAmt').value = ''; document.getElementById('witNum').value = '';
  showToast('✅ আবেদন করা হয়েছে!', 'Admin অনুমোদনের পর পেমেন্ট পাবেন'); loadWithdraw();
}

// ════════════════════════════════════════════════════════════
// MINT
// ════════════════════════════════════════════════════════════
function selTp(el, t) { document.querySelectorAll('.tp').forEach(x => x.classList.remove('on')); el.classList.add('on'); tokType = t; }
function togF(el) { el.classList.toggle('on'); el.querySelector('.fcb').textContent = el.classList.contains('on') ? '✓' : '○'; }
function setAmt(id, v, el) { document.getElementById(id).value = v; document.querySelectorAll('.amount-row .amt-chip').forEach(x => x.classList.remove('on')); el.classList.add('on'); }
function lp() {
  const nm = document.getElementById('mNm').value || 'আপনার টোকেন', sy = document.getElementById('mSy').value || 'TOKEN',
        sup = document.getElementById('mSup').value || '0', dec = document.getElementById('mDec').value, [c1, c2] = document.getElementById('mCl').value.split(',');
  document.getElementById('pNm').textContent = nm; document.getElementById('pSy').textContent = '$' + sy.toUpperCase(); document.getElementById('pCoinTxt').textContent = sy.substring(0, 4).toUpperCase() || 'RSM';
  const n = parseInt(sup.replace(/,/g, '')) || 0;
  document.getElementById('pSup').textContent = n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString();
  document.getElementById('pDec').textContent = dec; document.getElementById('pCoin').style.background = 'linear-gradient(135deg,' + c2 + ',' + c1 + ')';
}
async function doMint() {
  const nm = document.getElementById('mNm').value.trim(), sy = document.getElementById('mSy').value.trim().toUpperCase(), sup = document.getElementById('mSup').value.replace(/,/g, '');
  if (!nm || !sy) { showToast('⚠️', 'নাম ও সিম্বল দিন'); return; }
  const btn = document.getElementById('mBtn'); btn.innerHTML = '<span class="sp"></span>মিন্ট হচ্ছে...'; btn.disabled = true;
  const addr = 'RSM' + [...Array(38)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const cl = document.getElementById('mCl').value, feats = [...document.querySelectorAll('.fi2.on')].map(f => f.textContent.trim());
  const data = { name: nm, symbol: sy, supply: sup, decimals: document.getElementById('mDec').value, icon: document.getElementById('mIc').value || '🪙', desc: document.getElementById('mDs').value.trim(), color: cl, type: tokType, features: feats, contractAddress: addr, ownerUid: curUser.uid, ownerEmail: curUser.email, ownerName: curUser.displayName || curUser.email.split('@')[0], createdAt: Date.now(), price: (Math.random() * 0.05 + 0.001).toFixed(6), change24h: ((Math.random() - 0.3) * 15).toFixed(2), listed: true };
  try {
    await db.ref('tokens').push(data);
    document.getElementById('moNm').textContent = nm; document.getElementById('moSy').textContent = '$' + sy; document.getElementById('moSup').textContent = parseInt(sup).toLocaleString(); document.getElementById('moAddr').textContent = addr;
    const mi = document.getElementById('moIcon'); mi.innerHTML = '<span style="font-family:\'Nunito\',sans-serif;font-size:1rem;font-weight:900;color:#fff">' + sy.substring(0, 3) + '</span>'; mi.style.background = 'linear-gradient(135deg,' + cl.split(',')[1] + ',' + cl.split(',')[0] + ')';
    document.getElementById('mintOv').classList.add('open'); btn.innerHTML = '🚀 RSM Chain এ মিন্ট করুন — বিনামূল্যে'; btn.disabled = false;
    document.getElementById('mNm').value = ''; document.getElementById('mSy').value = ''; document.querySelectorAll('.fi2.on').forEach(f => { f.classList.remove('on'); f.querySelector('.fcb').textContent = '○'; }); lp(); loadDash(); showToast('🎉 সফল!', nm + ' ($' + sy + ') তৈরি হয়েছে!');
  } catch (e) { showToast('❌', e.message); btn.innerHTML = '🚀 RSM Chain এ মিন্ট করুন — বিনামূল্যে'; btn.disabled = false; }
}
function cpAddr() { navigator.clipboard.writeText(document.getElementById('moAddr').textContent).then(() => showToast('📋 কপি!', 'Contract Address কপি হয়েছে')); }

// ════════════════════════════════════════════════════════════
// MARKET + DUMMY CHART
// Real liquidity আসার আগে এই dummy chart ব্যবহার হবে।
// Real data এলে startDummyChart() কে fetchRealPriceData() দিয়ে replace করুন।
// ════════════════════════════════════════════════════════════
function mkFilt(f, el) { mkF = f; document.querySelectorAll('#mkFilter .tp').forEach(x => x.classList.remove('on')); el.classList.add('on'); loadMarket(); }
function loadMarket() {
  db.ref('tokens').once('value', s => {
    let all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k })).filter(t => t.listed !== false);
    if (mkF !== 'all') all = all.filter(t => t.type === mkF);
    all.sort((a, b) => b.createdAt - a.createdAt);
    const el = document.getElementById('mkBody');
    if (!all.length) { el.innerHTML = '<div class="empty"><div class="empty-i">📊</div><p>কোনো টোকেন নেই</p></div>'; startDummyChart([]); return; }
    el.innerHTML = all.map(t => { const [c1, c2] = t.color.split(','), chg = parseFloat(t.change24h) || 0, sup = parseInt(t.supply) || 0; return '<div class="mtr"><div style="display:flex;align-items:center;gap:9px;"><div class="tok-av" style="background:linear-gradient(135deg,' + c2 + ',' + c1 + ')"><span class="tok-av-t">' + (t.symbol || '?').substring(0, 3).toUpperCase() + '</span></div><div><div style="font-size:0.83rem;font-weight:700">' + t.name + '</div><div style="font-family:\'JetBrains Mono\',monospace;font-size:0.65rem;color:var(--muted)">$' + t.symbol + '</div></div></div><div class="mc">' + parseFloat(t.price || 0).toFixed(6) + '</div><div class="mc ' + (chg >= 0 ? 'up' : 'dn') + '">' + (chg >= 0 ? '▲' : '▼') + Math.abs(chg) + '%</div><div class="mc">' + (sup >= 1e9 ? (sup / 1e9).toFixed(1) + 'B' : sup >= 1e6 ? (sup / 1e6).toFixed(1) + 'M' : sup.toLocaleString()) + '</div><div><button class="buy-btn" onclick="openBuy(\'' + t.key + '\')">কিনুন</button></div></div>'; }).join('');
    startDummyChart(all.slice(0, 3));
  });
}

// DUMMY CHART — simulated price history (random walk)
// volatility: meme=7%, utility=4%, defi=5%
function genDummyHistory(basePrice, vol, n) {
  let p = basePrice || 0.001;
  return Array.from({ length: n }, () => { p = Math.max(0.00001, p * (1 + (Math.random() - 0.48) * (vol || 0.04))); return parseFloat(p.toFixed(6)); });
}
function genTimeLabels(n) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => { const d = new Date(now - (n - 1 - i) * 3600000); return d.getHours() + ':00'; });
}
function startDummyChart(tokens) {
  if (typeof Chart === 'undefined') return;
  const ctx = document.getElementById('priceChart'); if (!ctx) return;
  if (priceChart) { priceChart.destroy(); priceChart = null; }
  stopDummyChart();
  const pal = ['#7c3aed', '#f59e0b', '#10b981'], labels = genTimeLabels(24);
  const volMap = { meme: 0.07, defi: 0.055, utility: 0.04, governance: 0.03, nft: 0.06 };
  tokens.forEach(t => { if (!dummyPrices[t.symbol]) dummyPrices[t.symbol] = genDummyHistory(parseFloat(t.price || 0.001), volMap[t.type] || 0.04, 24); });
  const datasets = tokens.length > 0
    ? tokens.map((t, i) => ({ label: '$' + t.symbol + (CONTRACT_DEPLOYED ? '' : ' (Demo)'), data: [...dummyPrices[t.symbol]], borderColor: pal[i % 3], backgroundColor: pal[i % 3] + '15', borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: i === 0, tension: 0.45 }))
    : [{ label: 'RSM Chain (Demo)', data: genDummyHistory(0.025, 0.05, 24), borderColor: '#7c3aed', backgroundColor: '#7c3aed15', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.45 }];
  priceChart = new Chart(ctx, {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: 'rgba(241,240,247,0.6)', font: { size: 11, family: 'Space Grotesk' }, boxWidth: 10 } },
        tooltip: { backgroundColor: '#1a1728', borderColor: 'rgba(124,58,237,0.3)', borderWidth: 1, titleColor: '#f1f0f7', bodyColor: 'rgba(241,240,247,0.6)', callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.raw + ' RSMC', footer: () => CONTRACT_DEPLOYED ? '' : '⚠️ Simulated — real liquidity আসার পর আপডেট হবে' } }
      },
      scales: {
        x: { ticks: { color: 'rgba(241,240,247,0.35)', font: { size: 10 }, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: 'rgba(241,240,247,0.35)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } }
      }
    }
  });
  // Live dummy update every 3 sec
  dummyInterval = setInterval(() => {
    if (!priceChart) { stopDummyChart(); return; }
    priceChart.data.datasets.forEach((ds, i) => {
      const last = ds.data[ds.data.length - 1], vol = volMap[tokens[i]?.type] || 0.04;
      const next = parseFloat(Math.max(0.00001, last * (1 + (Math.random() - 0.48) * vol)).toFixed(6));
      ds.data.shift(); ds.data.push(next);
      const sym = tokens[i]?.symbol; if (sym) { dummyPrices[sym].shift(); dummyPrices[sym].push(next); }
    });
    const now = new Date(); priceChart.data.labels.shift(); priceChart.data.labels.push(now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0'));
    priceChart.update('none');
  }, 3000);
}
function stopDummyChart() { if (dummyInterval) { clearInterval(dummyInterval); dummyInterval = null; } }
function changeChartPeriod(p, el) { document.querySelectorAll('.chart-filter').forEach(x => x.classList.remove('on')); el.classList.add('on'); dummyPrices = {}; loadMarket(); }

async function openBuy(key) {
  const s = await db.ref('tokens/' + key).once('value'); if (!s.exists()) return;
  curBuyToken = { ...s.val(), key }; const t = curBuyToken, [c1, c2] = t.color.split(',');
  const bi = document.getElementById('buyIcon'); bi.style.background = 'linear-gradient(135deg,' + c2 + ',' + c1 + ')'; bi.innerHTML = '<span style="font-family:\'Nunito\',sans-serif;font-size:1rem;font-weight:900;color:#fff">' + (t.symbol || '?').substring(0, 3).toUpperCase() + '</span>';
  document.getElementById('buyTitle').textContent = t.name + ' কিনুন'; document.getElementById('buySub').textContent = 'RSMC দিয়ে $' + t.symbol + ' কিনুন';
  document.getElementById('buyInfo').innerHTML = '<div class="mir"><span class="mik">মূল্য</span><span class="miv">' + parseFloat(t.price || 0).toFixed(6) + ' RSMC</span></div><div class="mir"><span class="mik">তৈরিকারী</span><span class="miv">' + (t.ownerName || '?') + '</span></div>';
  document.getElementById('buyAmt').value = ''; document.getElementById('buyCalc').textContent = 'মূল্য: 0 RSMC';
  document.getElementById('buyAmt').oninput = () => { const a = parseFloat(document.getElementById('buyAmt').value) || 0; document.getElementById('buyCalc').textContent = 'মোট: ' + (a * parseFloat(t.price || 0)).toFixed(4) + ' RSMC'; };
  document.getElementById('buyOv').classList.add('open');
}
async function confirmBuy() {
  if (!curBuyToken) return; const amt = parseFloat(document.getElementById('buyAmt').value) || 0;
  if (amt <= 0) { showToast('⚠️', 'পরিমাণ দিন'); return; }
  const total = parseFloat((amt * parseFloat(curBuyToken.price || 0)).toFixed(4));
  const balSnap = await db.ref('users/' + curUser.uid + '/balance').once('value');
  if ((balSnap.val() || 0) < total) { showToast('❌', 'পর্যাপ্ত RSMC নেই'); return; }
  await db.ref('users/' + curUser.uid + '/balance').transaction(b => (b || 0) - total);
  if (curBuyToken.ownerUid !== curUser.uid) await db.ref('users/' + curBuyToken.ownerUid + '/balance').transaction(b => (b || 0) + total * 0.95);
  await db.ref('transactions').push({ uid: curUser.uid, type: 'buy', token: curBuyToken.symbol, amount: total, note: curBuyToken.name + ' কেনা', createdAt: Date.now() });
  closeOv('buyOv'); showToast('✅ কেনা হয়েছে!', amt + ' ' + curBuyToken.symbol + ' কেনা হয়েছে');
}

// ════════════════════════════════════════════════════════════
// REFERRAL / NOTICES / SETTINGS
// ════════════════════════════════════════════════════════════
function loadRef() {
  db.ref('users/' + curUser.uid).once('value', s => { const u = s.val() || {}; document.getElementById('refUrl').textContent = location.origin + location.pathname + '?ref=' + (u.refCode || 'RSM000'); });
  db.ref('users/' + curUser.uid + '/referrals').once('value', s => {
    const refs = Object.values(s.val() || {});
    document.getElementById('rTotal').textContent = refs.length; document.getElementById('rEarned').textContent = refs.reduce((a, r) => a + (r.bonus || 0), 0); document.getElementById('rActive').textContent = refs.length;
    const el = document.getElementById('refList');
    el.innerHTML = refs.length ? refs.map(r => '<div class="tok-item"><div style="width:32px;height:32px;border-radius:50%;background:rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:var(--p);flex-shrink:0">' + (r.name || '?')[0].toUpperCase() + '</div><div><div class="tok-nm">' + r.name + '</div><div class="tok-sy">' + r.email + '</div></div><div style="font-family:\'JetBrains Mono\',monospace;font-size:0.75rem;color:var(--gold)">+' + (r.bonus || 10) + ' RSMC</div></div>').join('') : '<div class="empty"><div class="empty-i">👥</div><p>কেউ যোগ দেয়নি।<br>লিংক শেয়ার করুন!</p></div>';
  });
}
function copyRef() { navigator.clipboard.writeText(document.getElementById('refUrl').textContent).then(() => showToast('📋 কপি!', 'রেফারেল লিংক কপি হয়েছে')); }

function loadNotices() {
  db.ref('notices').orderByChild('createdAt').limitToLast(20).once('value', s => {
    const all = Object.values(s.val() || {}).reverse(), el = document.getElementById('noticesList');
    el.innerHTML = all.length ? all.map(n => '<div class="notice-item"><div class="ni-title">📢 ' + n.title + '</div><div class="ni-body">' + n.body + '</div><div class="ni-date">' + new Date(n.createdAt).toLocaleString('bn-BD') + '</div></div>').join('') : '<div class="empty"><div class="empty-i">📢</div><p>কোনো নোটিশ নেই</p></div>';
  });
}
function loadNoticesInDash() {
  db.ref('notices').orderByChild('createdAt').limitToLast(2).once('value', s => {
    const all = Object.values(s.val() || {}).reverse(), el = document.getElementById('dashNotices');
    el.innerHTML = all.length ? all.map(n => '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><div style="font-size:0.8rem;font-weight:700">' + n.title + '</div><div style="font-size:0.72rem;color:var(--muted);margin-top:2px">' + n.body.substring(0, 60) + (n.body.length > 60 ? '...' : '') + '</div></div>').join('') : '<div class="empty" style="padding:12px 0"><div class="empty-i" style="font-size:1.5rem">📢</div><p style="font-size:0.75rem">কোনো নোটিশ নেই</p></div>';
  });
}

async function loadSettings() {
  const s = await db.ref('settings').once('value'), st = s.val() || {};
  ['bkash', 'nagad', 'rocket'].forEach(k => { const el = document.getElementById('set' + k.charAt(0).toUpperCase() + k.slice(1)); if (el) el.value = st[k] || ''; });
  const method = document.getElementById('depMethod')?.value || 'bkash', pn = document.getElementById('payNum');
  if (pn) pn.textContent = (st[method] || 'সেট করা হয়নি') + ' (' + method.toUpperCase() + ')';
}
document.addEventListener('change', e => { if (e.target.id === 'depMethod') loadSettings(); });
async function saveSettings() {
  const bkash = document.getElementById('setBkash').value.trim(), nagad = document.getElementById('setNagad').value.trim(), rocket = document.getElementById('setRocket').value.trim();
  await db.ref('settings').update({ bkash, nagad, rocket });
  showToast('✅ সেভ হয়েছে!', 'পেমেন্ট নম্বর আপডেট হয়েছে');
}

// ════════════════════════════════════════════════════════════
// ADMIN PANEL
// ════════════════════════════════════════════════════════════
function loadAdmin() {
  db.ref('tokens').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adTok').textContent = all.length;
    const el = document.getElementById('adTokList');
    el.innerHTML = all.length ? all.map(t => '<div class="user-row"><div class="uav">' + (t.symbol || '?')[0] + '</div><div style="flex:1"><div class="unm">' + t.name + ' ($' + t.symbol + ')</div><div class="uem">' + t.ownerEmail + ' · সাপ্লাই: ' + parseInt(t.supply || 0).toLocaleString() + '</div></div><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="abtn abtn-g" onclick="adminMintToken(\'' + t.key + '\',\'' + t.symbol + '\',\'' + t.ownerEmail + '\')">⬆️ মিন্ট</button><button class="abtn abtn-r" onclick="adminBurnToken(\'' + t.key + '\',\'' + t.symbol + '\',' + (t.supply || 0) + ')">🔥 বার্ন</button><button class="abtn abtn-y" onclick="toggleTokList(\'' + t.key + '\',' + t.listed + ')">' + (t.listed ? '🔴 বাতিল' : '🟢 চালু') + '</button><button class="abtn abtn-r" onclick="deleteTok(\'' + t.key + '\',\'' + t.name.replace(/'/g, '') + '\')">🗑️</button></div></div>').join('') : '<div class="empty"><div class="empty-i">🪙</div><p>কোনো টোকেন নেই</p></div>';
  });
  db.ref('users').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adUsr').textContent = all.length;
    const el = document.getElementById('adUsrList');
    el.innerHTML = all.length ? all.map(u => '<div class="user-row"><div class="uav">' + (u.displayName || '?')[0].toUpperCase() + '</div><div style="flex:1"><div class="unm">' + (u.displayName || 'নাম নেই') + (u.banned ? ' <span class="ubanned">BAN</span>' : '') + '</div><div class="uem">' + u.email + ' · ' + Math.floor(u.balance || 0) + ' RSMC</div></div><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="abtn abtn-y" onclick="toggleBan(\'' + u.key + '\',\'' + (u.displayName || '').replace(/'/g, '') + '\',' + !!u.banned + ')">' + (u.banned ? '🟢 আনব্যান' : '🔴 ব্যান') + '</button><button class="abtn abtn-r" onclick="deleteUser(\'' + u.key + '\',\'' + u.email + '\')">🗑️</button></div></div>').join('') : '<div class="empty"><div class="empty-i">👥</div><p>কোনো ইউজার নেই</p></div>';
  });
  db.ref('deposits').orderByChild('status').equalTo('pending').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adDepPend').textContent = all.length;
    document.getElementById('adDepList').innerHTML = all.length ? all.map(d => '<div class="pending-row"><div style="flex:1"><div style="font-size:0.82rem;font-weight:700">' + d.name + ' — ' + d.method.toUpperCase() + ' — ' + d.amount + ' RSMC</div><div style="font-size:0.68rem;color:var(--muted)">TrxID: ' + d.txId + ' · ' + d.email + '</div></div><div style="display:flex;gap:5px;"><button class="abtn abtn-p" onclick="approveDeposit(\'' + d.key + '\',\'' + d.uid + '\',' + d.amount + ')">✅ অনুমোদন</button><button class="abtn abtn-r" onclick="rejectDeposit(\'' + d.key + '\')">❌ বাতিল</button></div></div>').join('') : '<div class="empty"><div class="empty-i">💰</div><p>কোনো পেন্ডিং নেই</p></div>';
  });
  db.ref('withdraws').orderByChild('status').equalTo('pending').once('value', s => {
    const all = Object.entries(s.val() || {}).map(([k, v]) => ({ ...v, key: k }));
    document.getElementById('adWitPend').textContent = all.length;
    document.getElementById('adWitList').innerHTML = all.length ? all.map(w => '<div class="pending-row"><div style="flex:1"><div style="font-size:0.82rem;font-weight:700">' + w.name + ' — ' + w.method.toUpperCase() + ' — ' + w.amount + ' RSMC</div><div style="font-size:0.68rem;color:var(--muted)">' + w.number + ' · ' + w.email + '</div></div><div style="display:flex;gap:5px;"><button class="abtn abtn-g" onclick="approveWithdraw(\'' + w.key + '\')">✅ পাঠানো হয়েছে</button><button class="abtn abtn-r" onclick="rejectWithdraw(\'' + w.key + '\',\'' + w.uid + '\',' + w.amount + ')">❌ বাতিল</button></div></div>').join('') : '<div class="empty"><div class="empty-i">📤</div><p>কোনো পেন্ডিং নেই</p></div>';
  });
  loadSettings(); updateContractStatusUI();
}

// ════════════════════════════════════════════════════════════
// ④ ADMIN MINTING — calls RSMChain.sol mint() via ethers.js
//    Trust Wallet popup → Blockchain confirm → Firebase log
// ════════════════════════════════════════════════════════════

/**
 * adminMintOnChain(toAddress, amountRSM, reason)
 * ─────────────────────────────────────────────
 * RSMChain.sol এর mint() function call করে।
 * Deploy করার পর এই function কাজ করবে।
 * Trust Wallet এ popup আসবে → confirm করলে BSC তে mint হবে।
 * Blockchain confirmation এর পর Firebase এ log সেভ হবে।
 */
async function adminMintOnChain(toAddress, amountRSM, reason) {
  if (!isAdmin)           { showToast('❌', 'শুধু Admin করতে পারবে'); return; }
  if (!CONTRACT_DEPLOYED) { showToast('⚠️ Demo Mode', 'Contract deploy করুন, তারপর Mint করুন'); return; }
  if (!web3Address)       { showToast('⚠️', 'Admin Wallet Connect করুন'); return; }
  if (!rsmContractWriter) { showToast('⚠️', 'Wallet reconnect করুন'); return; }
  try {
    showToast('⏳ Minting...', 'Trust Wallet এ কনফার্ম করুন');
    const amountWei = ethers.parseUnits(String(amountRSM), 18);
    // ── RSMChain.sol → mint(address to, uint256 amount, string reason) ──
    const tx = await rsmContractWriter.mint(toAddress, amountWei, reason); // ← popup
    showToast('📡 Broadcasting...', 'BSC Blockchain এ submit হচ্ছে...');
    const receipt = await tx.wait(1); // Wait 1 block
    // ── Save confirmed mint log to Firebase ──
    await db.ref('admin_mint_log').push({ mintedBy: curUser.email, toAddress, amountRSM, reason, txHash: receipt.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString(), createdAt: Date.now() });
    showToast('✅ Mint সফল!', amountRSM + ' RSM → ' + toAddress.substring(0, 8) + '... | ' + receipt.hash.substring(0, 10) + '...');
    loadAdmin(); return receipt;
  } catch (e) {
    if (e.code === 4001 || e.code === 'ACTION_REJECTED') showToast('❌ বাতিল', 'Admin ট্রানজেকশন বাতিল');
    else showToast('❌ Mint ব্যর্থ', e.reason || e.message.substring(0, 70));
  }
}

// Admin panel Mint button handler
function adminMintToken(key, symbol, ownerEmail) {
  const amt = prompt(symbol + ' — কতটুকু মিন্ট করবেন? (Firebase সাপ্লাই আপডেট হবে)');
  if (!amt || isNaN(parseInt(amt))) return;
  // 1. Firebase supply update (always works)
  db.ref('tokens/' + key + '/supply').transaction(s => String(parseInt(s || 0) + parseInt(amt)));
  showToast('⬆️ Firebase Mint সফল', parseInt(amt).toLocaleString() + ' ' + symbol + ' সাপ্লাইয়ে যোগ হয়েছে');
  // 2. On-chain mint (only if contract deployed and wallet connected)
  if (CONTRACT_DEPLOYED && web3Address) {
    const toAddr = prompt('On-chain BSC Mint করতে প্রাপকের 0x address দিন:\n(বাতিল করতে Cancel চাপুন)');
    if (toAddr && /^0x[0-9a-fA-F]{40}$/.test(toAddr)) {
      adminMintOnChain(toAddr, parseInt(amt), 'Admin mint: ' + symbol);
    } else if (toAddr) {
      showToast('❌ ভুল Address', 'সঠিক 0x BSC address দিন');
    }
  }
  setTimeout(loadAdmin, 800);
}

// Admin panel Burn button handler
function adminBurnToken(key, symbol, currentSupply) {
  const amt = prompt(symbol + ' — কতটুকু বার্ন করবেন?\n(বর্তমান সাপ্লাই: ' + parseInt(currentSupply).toLocaleString() + ')');
  if (!amt || isNaN(parseInt(amt))) return;
  const burn = Math.min(parseInt(amt), parseInt(currentSupply));
  db.ref('tokens/' + key + '/supply').transaction(s => String(Math.max(0, parseInt(s || 0) - burn)));
  showToast('🔥 বার্ন সফল', burn.toLocaleString() + ' ' + symbol + ' বার্ন হয়েছে');
  setTimeout(loadAdmin, 500);
}

async function giveRSMC() {
  const email = document.getElementById('adEmail').value.trim(), amt = parseFloat(document.getElementById('adAmt').value);
  if (!email || !amt) { showToast('⚠️', 'তথ্য দিন'); return; }
  const s = await db.ref('users').orderByChild('email').equalTo(email).once('value');
  if (!s.exists()) { showToast('❌', 'ইউজার পাওয়া যায়নি'); return; }
  const [uid] = Object.keys(s.val());
  await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt);
  await db.ref('transactions').push({ uid, type: 'bonus', amount: amt, note: 'Admin বোনাস', createdAt: Date.now() });
  showToast('✅ পাঠানো হয়েছে!', amt + ' RSMC পাঠানো হয়েছে');
  document.getElementById('adEmail').value = ''; document.getElementById('adAmt').value = '';
}
async function takeRSMC() {
  const email = document.getElementById('adEmail').value.trim(), amt = parseFloat(document.getElementById('adAmt').value);
  if (!email || !amt) { showToast('⚠️', 'তথ্য দিন'); return; }
  const s = await db.ref('users').orderByChild('email').equalTo(email).once('value');
  if (!s.exists()) { showToast('❌', 'ইউজার পাওয়া যায়নি'); return; }
  const [uid] = Object.keys(s.val());
  await db.ref('users/' + uid + '/balance').transaction(b => Math.max(0, (b || 0) - amt));
  showToast('➖ কাটা হয়েছে', amt + ' RSMC কাটা হয়েছে');
}
async function toggleBan(uid, name, isBanned) { await db.ref('users/' + uid + '/banned').set(!isBanned); showToast(isBanned ? '🟢 আনব্যান' : '🔴 ব্যান', name + (isBanned ? ' আনব্যান' : ' ব্যান') + ' হয়েছে'); loadAdmin(); }
function deleteUser(uid, email) { showConfirm('⚠️ ইউজার মুছুন', email + ' এর অ্যাকাউন্ট মুছে ফেলবেন?', async () => { await db.ref('users/' + uid).remove(); showToast('🗑️', email + ' ডিলিট হয়েছে'); loadAdmin(); }); }
async function toggleTokList(key, listed) { await db.ref('tokens/' + key + '/listed').set(!listed); showToast(listed ? '🔴 বাতিল' : '🟢 চালু', 'টোকেন আপডেট হয়েছে'); loadAdmin(); loadMarket(); }
function deleteTok(key, name) { showConfirm('🗑️ টোকেন মুছুন', '"' + name + '" মুছে ফেলবেন?', async () => { await db.ref('tokens/' + key).remove(); showToast('🗑️', 'টোকেন মুছে গেছে'); loadAdmin(); loadMarket(); loadDash(); }); }
async function approveDeposit(key, uid, amt) { await db.ref('deposits/' + key + '/status').set('approved'); await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt); await db.ref('transactions').push({ uid, type: 'deposit', amount: amt, note: 'ডিপোজিট অনুমোদিত', createdAt: Date.now() }); showToast('✅ অনুমোদিত!', amt + ' RSMC যোগ হয়েছে'); loadAdmin(); }
async function rejectDeposit(key) { await db.ref('deposits/' + key + '/status').set('rejected'); showToast('❌ বাতিল', 'ডিপোজিট বাতিল'); loadAdmin(); }
async function approveWithdraw(key) { await db.ref('withdraws/' + key + '/status').set('approved'); showToast('✅ সম্পন্ন!', 'উইথড্র অনুমোদিত'); loadAdmin(); }
async function rejectWithdraw(key, uid, amt) { await db.ref('withdraws/' + key + '/status').set('rejected'); await db.ref('users/' + uid + '/balance').transaction(b => (b || 0) + amt); await db.ref('transactions').push({ uid, type: 'receive', amount: amt, note: 'উইথড্র বাতিল — ফেরত', createdAt: Date.now() }); showToast('↩️ ফেরত', amt + ' RSMC ফেরত গেছে'); loadAdmin(); }
async function sendNotice() {
  const t = document.getElementById('notTitle').value.trim(), b = document.getElementById('notBody').value.trim();
  if (!t || !b) { showToast('⚠️', 'শিরোনাম ও বিবরণ দিন'); return; }
  await db.ref('notices').push({ title: t, body: b, createdAt: Date.now(), from: curUser.email });
  document.getElementById('notTitle').value = ''; document.getElementById('notBody').value = '';
  showToast('📢 পাঠানো হয়েছে!', t); loadNotices();
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function showConfirm(title, msg, cb) {
  document.getElementById('cfTitle').textContent = title; document.getElementById('cfMsg').textContent = msg;
  cfCallback = cb; document.getElementById('cfBtn').onclick = () => { cb(); closeOv('confirmOv'); };
  document.getElementById('confirmOv').classList.add('open');
}
function closeOv(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('ov')) e.target.classList.remove('open'); });
function showToast(t, m) {
  const el = document.getElementById('toast');
  document.getElementById('tT').textContent = t; document.getElementById('tM').textContent = m || '';
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500);
}
// Wallet tab tx filter
function setTxFilter(f, el) { document.querySelectorAll('.ftab').forEach(x => x.classList.remove('on')); el.classList.add('on'); loadTxHistory(f); }

// ════════════════════════════════════════════════════════════
// ADMIN PANEL — Direct On-Chain Mint (from Token tab input fields)
// ════════════════════════════════════════════════════════════
async function adminMintDirect() {
  const toAddr = document.getElementById('mintToAddr').value.trim();
  const amount = parseFloat(document.getElementById('mintAmount').value);
  const reason = document.getElementById('mintReason').value.trim() || 'Admin Mint';
  if (!toAddr || !/^0x[0-9a-fA-F]{40}$/.test(toAddr)) {
    showToast('⚠️ Address ভুল', 'সঠিক BSC address দিন (0x...)'); return;
  }
  if (!amount || amount <= 0) { showToast('⚠️', 'পরিমাণ দিন'); return; }
  await adminMintOnChain(toAddr, amount, reason);
  // Clear fields on success
  document.getElementById('mintToAddr').value = '';
  document.getElementById('mintAmount').value = '';
  document.getElementById('mintReason').value = '';
}
