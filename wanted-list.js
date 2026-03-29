// wanted-list.js - Visar vilka items på Wanted list som finns i inventory

(function() {
  'use strict';

  let inventory = null;
  let processing = false;

  const COLOR_NAME_TO_ID = {
    'black': '11', 'blue': '7', 'bright green': '36', 'bright light blue': '105',
    'bright light orange': '110', 'bright light yellow': '103', 'bright pink': '104',
    'brown': '8', 'coral': '220', 'dark azure': '321', 'dark blue': '63',
    'dark bluish gray': '85', 'dark brown': '120', 'dark gray': '10', 'dark green': '80',
    'dark orange': '68', 'dark pink': '47', 'dark purple': '89', 'dark red': '59',
    'dark tan': '69', 'dark turquoise': '39', 'green': '6', 'lavender': '154',
    'light aqua': '152', 'light bluish gray': '86', 'light gray': '9', 'light green': '38',
    'light pink': '56', 'light purple': '93', 'light salmon': '26', 'light turquoise': '40',
    'light yellow': '33', 'lime': '34', 'magenta': '71', 'medium azure': '156',
    'medium blue': '42', 'medium dark pink': '94', 'medium lavender': '157',
    'medium orange': '31', 'olive green': '155', 'orange': '4', 'pearl gold': '115',
    'pink': '23', 'purple': '24', 'red': '5', 'reddish brown': '88', 'sand blue': '55',
    'sand green': '48', 'tan': '2', 'trans-black': '32', 'trans-bright green': '108',
    'trans-clear': '12', 'trans-dark blue': '14', 'trans-dark pink': '50',
    'trans-green': '20', 'trans-light blue': '15', 'trans-light green': '35',
    'trans-medium blue': '74', 'trans-neon green': '16', 'trans-neon orange': '18',
    'trans-neon yellow': '121', 'trans-orange': '98', 'trans-purple': '51',
    'trans-red': '17', 'trans-yellow': '19', 'white': '1', 'yellow': '3',
    'yellowish green': '158'
  };

  function parseItemUrl(url) {
    try {
      const params = new URLSearchParams(new URL(url, window.location.origin).search);
      let itemType = null, itemNo = null, colorId = null;
      if (params.has('P')) { itemType = 'PART'; itemNo = params.get('P'); }
      else if (params.has('S')) { itemType = 'SET'; itemNo = params.get('S'); }
      else if (params.has('M')) { itemType = 'MINIFIG'; itemNo = params.get('M'); }
      else if (params.has('G')) { itemType = 'GEAR'; itemNo = params.get('G'); }
      else if (params.has('B')) { itemType = 'BOOK'; itemNo = params.get('B'); }
      if (params.has('idColor') || params.has('ColorID')) {
        colorId = params.get('idColor') || params.get('ColorID');
      }
      return { itemType, itemNo, colorId };
    } catch (e) {
      return { itemType: null, itemNo: null, colorId: null };
    }
  }

  function findAllWantedItems() {
    const items = [];
    const links = document.querySelectorAll('a[href*="catalogitem.page"]');

    links.forEach(link => {
      const { itemType, itemNo, colorId: urlColorId } = parseItemUrl(link.href);
      if (!itemType || !itemNo) return;

      const row = link.closest('tr') ||
                  link.closest('div[class*="row"]') ||
                  link.closest('div[class*="item"]') ||
                  link.parentElement;
      if (!row) return;

      let colorId = urlColorId;
      let colorName = null;
      const rowText = row.textContent;

      for (const color of Object.keys(COLOR_NAME_TO_ID)) {
        if (new RegExp(`\\b${color}\\b`, 'i').test(rowText)) {
          colorName = color;
          colorId = COLOR_NAME_TO_ID[color];
          break;
        }
      }

      if (!colorId) {
        const colorLink = row.querySelector('a[href*="idColor"], a[href*="ColorID"]');
        if (colorLink) {
          const m = parseItemUrl(colorLink.href);
          if (m.colorId) { colorId = m.colorId; colorName = colorLink.textContent.trim(); }
        }
      }

      let quantityWanted = 1;
      for (const match of [
        rowText.match(/Qty:\s*(\d+)/i), rowText.match(/Wanted:\s*(\d+)/i),
        rowText.match(/Want:\s*(\d+)/i), rowText.match(/Quantity:\s*(\d+)/i),
        rowText.match(/(\d+)\s*x/i)
      ]) {
        if (match) { quantityWanted = parseInt(match[1]); break; }
      }

      items.push({ itemType, itemNo, colorId, colorName, quantityWanted });
    });

    const seen = new Set();
    return items.filter(item => {
      const key = `${item.itemType}-${item.itemNo}-${item.colorId || 'no-color'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function getItemInventory(itemType, itemNo, colorId) {
    if (!inventory || !Array.isArray(inventory)) return { found: false, quantity: 0 };
    const matching = inventory.filter(item => {
      if (!item.item || item.item.type !== itemType || item.item.no !== itemNo) return false;
      if (colorId) return item.color_id && item.color_id.toString() === colorId.toString();
      return true;
    });
    if (matching.length === 0) return { found: false, quantity: 0 };
    return { found: true, quantity: matching.reduce((s, i) => s + (i.quantity || 0), 0) };
  }

  function buildPanel(matchedItems, totalItems) {
    const old = document.getElementById('bricklink-wanted-panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'bricklink-wanted-panel';
    panel.style.cssText = `
      position: fixed !important;
      top: 60px !important;
      right: 16px !important;
      width: 260px !important;
      max-height: 80vh !important;
      overflow-y: auto !important;
      background: #fff !important;
      border: 2px solid #d1d5db !important;
      border-radius: 10px !important;
      box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important;
      z-index: 2147483647 !important;
      font-family: Arial, sans-serif !important;
      font-size: 12px !important;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 12px !important;
      background: #f9fafb !important;
      border-bottom: 1px solid #e5e7eb !important;
      border-radius: 8px 8px 0 0 !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    `;
    header.innerHTML = `
      <span style="font-weight:bold;color:#111;font-size:13px">
        ⭐ Inventory: ${matchedItems.length}/${totalItems}
      </span>
      <button id="bl-panel-close" style="background:none;border:none;cursor:pointer;font-size:16px;color:#888;padding:0;line-height:1">✕</button>
    `;
    panel.appendChild(header);

    if (matchedItems.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:14px;color:#888;text-align:center';
      empty.textContent = 'Inga items i inventory';
      panel.appendChild(empty);
    } else {
      matchedItems.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = `
          padding: 6px 12px !important;
          border-bottom: 1px solid #f3f4f6 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          gap: 8px !important;
        `;

        const isEnough = item.quantityOwned >= item.quantityWanted;
        const badgeColor = isEnough ? '#10b981' : '#f59e0b';
        const badgeText = isEnough
          ? `✓ ${item.quantityOwned}`
          : `⚠ ${item.quantityOwned}/${item.quantityWanted}`;

        row.innerHTML = `
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${item.itemNo}${item.colorName ? ' – ' + item.colorName : ''}">
            <strong>${item.itemNo}</strong>
            ${item.colorName ? `<span style="color:#999;font-size:11px"> ${item.colorName}</span>` : ''}
          </span>
          <span style="background:${badgeColor};color:white;padding:2px 7px;border-radius:4px;white-space:nowrap;font-weight:bold;font-size:11px">
            ${badgeText}
          </span>
        `;

        panel.appendChild(row);
      });
    }

    document.body.appendChild(panel);
    document.getElementById('bl-panel-close').addEventListener('click', () => panel.remove());
  }

  async function processPage() {
    if (processing) return;
    processing = true;

    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      processing = false;
      return;
    }

    const loading = document.createElement('div');
    loading.style.cssText = `
      position:fixed !important; top:60px !important; right:16px !important;
      background:white !important; border:2px solid #ddd !important;
      border-radius:8px !important; padding:10px 14px !important;
      box-shadow:0 4px 12px rgba(0,0,0,0.15) !important;
      z-index:2147483647 !important; font-family:Arial,sans-serif !important;
      font-size:13px !important; color:#666 !important;
    `;
    loading.textContent = '⏳ Hämtar inventory...';
    document.body.appendChild(loading);

    const timeout = setTimeout(() => {
      loading.remove();
      processing = false;
    }, 30000);

    chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
      clearTimeout(timeout);
      loading.remove();

      if (!response || response.error || !Array.isArray(response.inventory)) {
        console.error('❌ Kunde inte hämta inventory', response?.error);
        processing = false;
        return;
      }

      inventory = response.inventory;
      console.log(`✅ Inventory: ${inventory.length} items`);

      const items = findAllWantedItems();
      const matched = [];

      items.forEach(item => {
        const inv = getItemInventory(item.itemType, item.itemNo, item.colorId);
        if (inv.found) {
          matched.push({ ...item, quantityOwned: inv.quantity });
        }
      });

      console.log(`✅ ${matched.length} av ${items.length} items finns i inventory`);
      buildPanel(matched, items.length);
      processing = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    setTimeout(processPage, 1000);
  }

})();
