// wanted-list.js - Markerar items på Wanted list som finns i inventory

(function() {
  'use strict';

  let inventory = null;
  let processing = false;
  // Items som matchade inventory – behålls för återinjektion efter React re-render
  let matchedItems = [];
  let isInjecting = false;
  let injectTimer = null;

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

      items.push({ itemType, itemNo, colorId, colorName, quantityWanted, element: row, link });
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

  // Injicera badges för alla matchade items i aktuell DOM.
  // Kallas både initialt och av MutationObserver efter React re-renders.
  function injectBadges() {
    if (matchedItems.length === 0) return;

    isInjecting = true;

    matchedItems.forEach(item => {
      // Hitta alla länkar för detta item i nuvarande DOM
      const links = document.querySelectorAll('a[href*="catalogitem.page"]');
      links.forEach(link => {
        const { itemNo } = parseItemUrl(link.href);
        if (itemNo !== item.itemNo) return;

        // Hoppa över om badge redan finns bredvid denna länk
        let sibling = link.nextSibling;
        while (sibling) {
          if (sibling.nodeType === 1 && sibling.classList &&
              sibling.classList.contains('bricklink-wanted-badge')) return;
          sibling = sibling.nextSibling;
        }

        // Skapa badge
        const badge = document.createElement('span');
        badge.className = 'bricklink-wanted-badge';
        badge.style.cssText = `
          display: inline-block !important;
          margin-left: 8px !important;
          padding: 3px 8px !important;
          border-radius: 4px !important;
          font-weight: bold !important;
          font-size: 11px !important;
          vertical-align: middle !important;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
          cursor: default !important;
        `;

        if (item.quantityOwned >= item.quantityWanted) {
          badge.style.setProperty('background', '#10b981', 'important');
          badge.style.setProperty('color', 'white', 'important');
          badge.textContent = `✓ Har ${item.quantityOwned}`;
          badge.title = `Du har ${item.quantityOwned} st – tillräckligt (behöver ${item.quantityWanted})`;
        } else {
          badge.style.setProperty('background', '#f59e0b', 'important');
          badge.style.setProperty('color', 'white', 'important');
          badge.textContent = `⚠ Har ${item.quantityOwned}/${item.quantityWanted}`;
          badge.title = `Du har ${item.quantityOwned} st, saknar ${item.quantityWanted - item.quantityOwned}`;
        }

        if (item.colorName) badge.title += ` (${item.colorName})`;

        if (link.parentElement) {
          link.parentElement.insertBefore(badge, link.nextSibling);
        }

        // Färga raden – hitta närmaste tr/row-container
        const row = link.closest('tr') ||
                    link.closest('div[class*="row"]') ||
                    link.closest('div[class*="item"]');
        if (row && !row.dataset.blStyled) {
          row.dataset.blStyled = '1';
          row.style.setProperty('background-color', 'rgba(16, 185, 129, 0.07)', 'important');
          row.style.setProperty('border-left', '3px solid #10b981', 'important');
        }
      });
    });

    isInjecting = false;
  }

  // Starta MutationObserver som återinjicerar badges efter React re-renders
  function startObserver() {
    const observer = new MutationObserver(() => {
      // Ignorera DOM-ändringar som vi själva orsakade
      if (isInjecting) return;
      clearTimeout(injectTimer);
      // Debounce: vänta tills React är klar med sin batch-render
      injectTimer = setTimeout(injectBadges, 150);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bricklink-wanted-indicator';
    indicator.style.cssText = `
      position: fixed; top: 80px; right: 20px;
      background: white; border: 2px solid #ddd; border-radius: 8px;
      padding: 15px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000; font-family: Arial, sans-serif;
      min-width: 250px; max-width: 350px;
    `;
    indicator.innerHTML = `
      <div style="font-weight:bold;margin-bottom:8px;color:#333;font-size:14px">⭐ Wanted List Check</div>
      <div id="bricklink-wanted-status" style="color:#666;font-size:13px;line-height:1.5">Laddar...</div>
    `;
    document.body.appendChild(indicator);
    return indicator;
  }

  function updateStatus(message, color = '#666') {
    const el = document.getElementById('bricklink-wanted-status');
    if (el) { el.innerHTML = message; el.style.color = color; }
  }

  async function processPage() {
    if (processing) return;
    processing = true;

    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      processing = false;
      return;
    }

    const indicator = createStatusIndicator();
    updateStatus('⏳ Hämtar inventory...');

    try {
      let responseReceived = false;
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          updateStatus('⚠️ Timeout', '#f59e0b');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
        }
      }, 30000);

      chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
        responseReceived = true;
        clearTimeout(timeout);

        if (!response || response.error || !Array.isArray(response.inventory)) {
          updateStatus('⚠️ Kunde ej hämta inventory', '#f59e0b');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }

        inventory = response.inventory;
        console.log(`✅ Inventory: ${inventory.length} items`);
        updateStatus('🔍 Analyserar wanted list...');

        const items = findAllWantedItems();
        let fullyOwned = 0, partlyOwned = 0;

        items.forEach(item => {
          const inv = getItemInventory(item.itemType, item.itemNo, item.colorId);
          if (inv.found) {
            if (inv.quantity >= item.quantityWanted) fullyOwned++;
            else partlyOwned++;
            matchedItems.push({ ...item, quantityOwned: inv.quantity });
          }
        });

        const total = fullyOwned + partlyOwned;
        const statusMsg = total > 0
          ? `✓ Tillräckligt: ${fullyOwned}<br>⚠ Delvis: ${partlyOwned}<br>❌ Saknas: ${items.length - total}<br><small>${total} av ${items.length} i inventory</small>`
          : `Inga items i inventory<br><small>${items.length} items totalt</small>`;

        updateStatus(statusMsg, total > 0 ? '#10b981' : '#666');

        // Injicera badges direkt
        injectBadges();

        // Starta observer för att återinjicera efter React re-renders
        startObserver();

        setTimeout(() => indicator.remove(), 8000);
        processing = false;
      });
    } catch (error) {
      console.error('❌', error);
      updateStatus('⚠️ Fel', '#f59e0b');
      setTimeout(() => indicator.remove(), 5000);
      processing = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    setTimeout(processPage, 1000);
  }

})();
