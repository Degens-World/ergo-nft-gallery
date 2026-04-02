# Ergo NFT Gallery

## Live Demo

**[https://ad-ergo-nft-gallery-1775098006628.vercel.app](https://ad-ergo-nft-gallery-1775098006628.vercel.app)**

Browse and explore any Ergo wallet's NFT collection in a beautiful, filterable gallery interface powered by the Ergo Explorer API and the EIP-4 NFT standard.

## Features

- **Wallet lookup** — paste any Ergo P2PK address to load its token collection
- **EIP-4 detection** — identifies NFTs by R7 register type codes (Picture, Audio, Video, Other)
- **Image rendering** — loads artwork thumbnails with IPFS gateway resolution and graceful fallback
- **Filter tabs** — filter by NFT type (Pictures / Audio / Video / Other)
- **Sort controls** — sort by name, newest, or oldest token ID
- **Detail modal** — click any NFT to see full image, description, traits (R5/R6/R8 registers), minting TX, and Explorer link
- **Stats bar** — counts total NFTs, collections (by R7 collection ID), all tokens, and artwork pieces
- **Starfield UI** — dark cosmic aesthetic with smooth card animations

## How to Use

1. Open the app in any browser
2. Paste an Ergo wallet address into the input box
3. Click **View Gallery** (or press Enter)
4. Browse your NFTs — filter by type, sort, or click any card for full details

## How to Run Locally

No build step required — pure HTML/CSS/JS.

```bash
# Clone the repo
git clone https://github.com/Degens-World/ergo-nft-gallery
cd ergo-nft-gallery

# Open in browser
open index.html
# or serve with any static server:
npx serve .
```

## Tech Stack

- Vanilla JS (ES2020+), HTML5, CSS3
- [Ergo Explorer API](https://api.ergoplatform.com/api/v1) — token balances and metadata
- [EIP-4 NFT Standard](https://github.com/ergoplatform/eips/blob/master/eip-0004.md) — NFT type detection via on-chain registers
- IPFS Gateway (ipfs.io) — resolves `ipfs://` image URIs

## License

MIT
