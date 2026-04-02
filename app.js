/* ===== Ergo NFT Gallery — app.js ===== */

const EXPLORER = 'https://api.ergoplatform.com/api/v1';
const EXPLORER_UI = 'https://explorer.ergoplatform.com';

// EIP-4 NFT type codes
const NFT_TYPES = {
  '0301': 'Picture',
  '0302': 'Audio',
  '0303': 'Video',
  '0304': 'Other',
};

const TYPE_ICONS = {
  Picture: '🖼️',
  Audio: '🎵',
  Video: '🎬',
  Other: '📦',
  Unknown: '❓',
};

let allNfts = [];
let activeFilter = 'all';

// ===== DOM refs =====
const walletInput = document.getElementById('walletInput');
const searchBtn = document.getElementById('searchBtn');
const statsSection = document.getElementById('statsSection');
const filterSection = document.getElementById('filterSection');
const loadingSection = document.getElementById('loadingSection');
const loadingMsg = document.getElementById('loadingMsg');
const errorSection = document.getElementById('errorSection');
const errorMsg = document.getElementById('errorMsg');
const gallerySection = document.getElementById('gallerySection');
const galleryGrid = document.getElementById('galleryGrid');
const emptyMsg = document.getElementById('emptyMsg');
const modal = document.getElementById('modal');

// ===== Search =====
searchBtn.addEventListener('click', startSearch);
walletInput.addEventListener('keydown', e => { if (e.key === 'Enter') startSearch(); });

function startSearch() {
  const addr = walletInput.value.trim();
  if (!addr) return;
  loadGallery(addr);
}

// ===== Filter tabs =====
document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderGallery();
  });
});

// ===== Sort =====
document.getElementById('sortSelect').addEventListener('change', renderGallery);

// ===== Modal =====
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ===== Main load flow =====
async function loadGallery(address) {
  showSection('loading');
  setLoading('Fetching wallet tokens...');

  try {
    // 1. Get all tokens in wallet
    const tokens = await fetchAllTokens(address);
    if (!tokens.length) {
      showSection('gallery');
      emptyMsg.classList.remove('hidden');
      galleryGrid.innerHTML = '';
      updateStats(0, 0, 0, 0);
      showSection('gallery');
      statsSection.classList.remove('hidden');
      filterSection.classList.add('hidden');
      return;
    }

    setLoading(`Found ${tokens.length} tokens — loading NFT metadata...`);

    // 2. Fetch NFT metadata for each token in parallel batches
    allNfts = await loadNftMetadata(tokens);

    const nfts = allNfts.filter(n => n.isNft);
    const collections = new Set(nfts.map(n => n.collectionId).filter(Boolean)).size;
    const artCount = nfts.filter(n => n.nftType === 'Picture').length;

    updateStats(nfts.length, collections, tokens.length, artCount);

    showSection('gallery');
    statsSection.classList.remove('hidden');
    if (nfts.length > 0) filterSection.classList.remove('hidden');

    renderGallery();
  } catch (err) {
    showSection('error');
    errorMsg.textContent = err.message || 'Failed to load wallet data. Please check the address and try again.';
  }
}

// ===== Fetch all tokens for address =====
async function fetchAllTokens(address) {
  let items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${EXPLORER}/addresses/${address}/balance/confirmed`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Explorer API error (${res.status}). Check the address is valid.`);
    const data = await res.json();

    const tokens = data.tokens || [];
    if (!tokens.length) break;
    items = tokens;
    break; // balance endpoint returns all at once
  }

  return items;
}

// ===== Load NFT metadata in batches =====
async function loadNftMetadata(tokens) {
  const BATCH = 8;
  const results = [];

  for (let i = 0; i < tokens.length; i += BATCH) {
    const batch = tokens.slice(i, i + BATCH);
    setLoading(`Loading metadata ${Math.min(i + BATCH, tokens.length)} / ${tokens.length}...`);
    const settled = await Promise.allSettled(batch.map(t => enrichToken(t)));
    settled.forEach((r, idx) => {
      if (r.status === 'fulfilled') results.push(r.value);
      else results.push(makeBasicToken(batch[idx]));
    });
  }

  return results;
}

async function enrichToken(token) {
  // Fetch token info from explorer
  const res = await fetch(`${EXPLORER}/tokens/${token.tokenId}`);
  if (!res.ok) return makeBasicToken(token);
  const info = await res.json();

  // Parse EIP-4 registers
  const r4 = info.emissionAmount === 1 ? true : false; // NFTs have supply 1
  const nftType = parseNftType(info);
  const isNft = nftType !== null;
  const imageUrl = extractImageUrl(info);
  const description = extractDescription(info);
  const traits = extractTraits(info);

  return {
    tokenId: token.tokenId,
    name: info.name || `Token ${token.tokenId.slice(0, 8)}`,
    amount: token.amount,
    decimals: token.decimals || info.decimals || 0,
    isNft,
    nftType: nftType || 'Unknown',
    imageUrl,
    description,
    traits,
    mintTxId: info.boxId || info.transactionId || '',
    collectionId: info.additionalRegisters?.R7?.renderedValue || null,
    raw: info,
  };
}

function makeBasicToken(token) {
  return {
    tokenId: token.tokenId,
    name: token.name || `Token ${token.tokenId.slice(0, 8)}`,
    amount: token.amount,
    decimals: token.decimals || 0,
    isNft: false,
    nftType: 'Unknown',
    imageUrl: null,
    description: '',
    traits: [],
    mintTxId: '',
    collectionId: null,
    raw: token,
  };
}

// ===== EIP-4 parsing helpers =====
function parseNftType(info) {
  // EIP-4: R7 contains NFT type as Coll[Byte]
  const regs = info.additionalRegisters || {};

  // Try to detect via register R7 type code
  const r7 = regs.R7;
  if (r7) {
    const rv = r7.serializedValue || '';
    // 0e 02 0301 = picture, etc.
    if (rv.includes('0301')) return 'Picture';
    if (rv.includes('0302')) return 'Audio';
    if (rv.includes('0303')) return 'Video';
    if (rv.includes('0304')) return 'Other';
  }

  // Fallback: if emission amount is 1 (NFT), treat as picture
  if (info.emissionAmount === 1) return 'Picture';

  return null;
}

function extractImageUrl(info) {
  const regs = info.additionalRegisters || {};

  // R9 often holds the image URL in EIP-4
  const r9 = regs.R9;
  if (r9?.renderedValue) {
    const v = r9.renderedValue;
    if (v.startsWith('http') || v.startsWith('ipfs://')) return resolveUrl(v);
  }

  // Some tokens store URL in description field
  if (info.description) {
    const match = info.description.match(/https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg)/i);
    if (match) return match[0];
    const ipfs = info.description.match(/ipfs:\/\/\S+/i);
    if (ipfs) return resolveUrl(ipfs[0]);
  }

  return null;
}

function resolveUrl(url) {
  if (url.startsWith('ipfs://')) {
    return 'https://ipfs.io/ipfs/' + url.slice(7);
  }
  return url;
}

function extractDescription(info) {
  return info.description || '';
}

function extractTraits(info) {
  const regs = info.additionalRegisters || {};
  const traits = [];

  // Check R5, R6, R8 for trait-like rendered values
  ['R5', 'R6', 'R8'].forEach(key => {
    const reg = regs[key];
    if (reg?.renderedValue && reg.renderedValue !== '0' && reg.renderedValue.length < 60) {
      traits.push(`${key}: ${reg.renderedValue}`);
    }
  });

  return traits;
}

// ===== Render Gallery =====
function renderGallery() {
  const sort = document.getElementById('sortSelect').value;
  let nfts = allNfts.filter(n => n.isNft);

  if (activeFilter !== 'all') {
    nfts = nfts.filter(n => n.nftType.toLowerCase() === activeFilter);
  }

  if (sort === 'name') nfts.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'newest') nfts.sort((a, b) => b.tokenId.localeCompare(a.tokenId));
  else if (sort === 'oldest') nfts.sort((a, b) => a.tokenId.localeCompare(b.tokenId));

  galleryGrid.innerHTML = '';
  emptyMsg.classList.toggle('hidden', nfts.length > 0);

  nfts.forEach((nft, i) => {
    const card = buildCard(nft, i);
    galleryGrid.appendChild(card);
  });
}

function buildCard(nft, i) {
  const card = document.createElement('div');
  card.className = 'nft-card';
  card.style.animationDelay = `${i * 0.04}s`;

  const icon = TYPE_ICONS[nft.nftType] || '🖼️';
  const displayAmount = nft.decimals > 0
    ? (nft.amount / Math.pow(10, nft.decimals)).toFixed(nft.decimals)
    : nft.amount;

  card.innerHTML = `
    <div class="nft-thumb">
      ${nft.imageUrl
        ? `<img src="${escHtml(nft.imageUrl)}" alt="${escHtml(nft.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy" />`
        : ''}
      <div class="nft-fallback" ${nft.imageUrl ? 'style="display:none"' : ''}>
        <span class="big-icon">${icon}</span>
        <span>${nft.nftType}</span>
      </div>
      <span class="nft-type-badge">${nft.nftType}</span>
    </div>
    <div class="nft-info">
      <div class="nft-name">${escHtml(nft.name)}</div>
      <div class="nft-sub">
        <span class="nft-amount">×${displayAmount}</span>
        <span>·</span>
        <span class="mono" style="font-size:0.72rem;color:var(--muted)">${nft.tokenId.slice(0, 8)}…</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openModal(nft));
  return card;
}

// ===== Modal =====
function openModal(nft) {
  const displayAmount = nft.decimals > 0
    ? (nft.amount / Math.pow(10, nft.decimals)).toFixed(nft.decimals)
    : nft.amount;

  document.getElementById('modalName').textContent = nft.name;
  document.getElementById('modalDesc').textContent = nft.description || 'No description available.';
  document.getElementById('modalId').textContent = nft.tokenId;
  document.getElementById('modalType').textContent = nft.nftType;
  document.getElementById('modalAmount').textContent = `×${displayAmount}`;

  const mintLink = document.getElementById('modalMintTx');
  if (nft.mintTxId) {
    mintLink.textContent = nft.mintTxId.slice(0, 16) + '…';
    mintLink.href = `${EXPLORER_UI}/en/transactions/${nft.mintTxId}`;
  } else {
    mintLink.textContent = 'N/A';
    mintLink.href = '#';
  }

  const imgEl = document.getElementById('modalImage');
  const fallEl = document.getElementById('modalImageFallback');
  const icon = TYPE_ICONS[nft.nftType] || '🖼️';

  if (nft.imageUrl) {
    imgEl.src = nft.imageUrl;
    imgEl.alt = nft.name;
    imgEl.classList.remove('hidden');
    fallEl.classList.add('hidden');
    imgEl.onerror = () => {
      imgEl.classList.add('hidden');
      fallEl.innerHTML = `<span class="fallback-icon">${icon}</span><span>Image unavailable</span>`;
      fallEl.classList.remove('hidden');
    };
  } else {
    imgEl.classList.add('hidden');
    fallEl.innerHTML = `<span class="fallback-icon">${icon}</span><span>${nft.nftType} NFT</span>`;
    fallEl.classList.remove('hidden');
  }

  const traitsEl = document.getElementById('modalTraits');
  traitsEl.innerHTML = nft.traits.map(t => `<span class="trait-tag">${escHtml(t)}</span>`).join('');

  const explorerLink = document.getElementById('modalExplorerLink');
  explorerLink.href = `${EXPLORER_UI}/en/token/${nft.tokenId}`;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ===== Stats =====
function updateStats(nftCount, collections, totalTokens, artCount) {
  document.getElementById('totalNfts').textContent = nftCount;
  document.getElementById('totalCollections').textContent = collections;
  document.getElementById('totalTokens').textContent = totalTokens;
  document.getElementById('artCount').textContent = artCount;
  statsSection.classList.remove('hidden');
}

// ===== Section management =====
function showSection(name) {
  loadingSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  gallerySection.classList.add('hidden');

  if (name === 'loading') loadingSection.classList.remove('hidden');
  else if (name === 'error') errorSection.classList.remove('hidden');
  else if (name === 'gallery') gallerySection.classList.remove('hidden');
}

function setLoading(msg) {
  loadingMsg.textContent = msg;
}

// ===== Utils =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
