// wanted-list.js - Markerar items på Wanted list som finns i inventory

(function() {
  'use strict';

  let inventory = null;
  let processing = false;

  // Bricklink färgnamn → färg-ID mappning
  const COLOR_NAME_TO_ID = {
    'black': '11',
    'blue': '7',
    'bright green': '36',
    'bright light blue': '105',
    'bright light orange': '110',
    'bright light yellow': '103',
    'bright pink': '104',
    'brown': '8',
    'coral': '220',
    'dark azure': '321',
    'dark blue': '63',
    'dark bluish gray': '85',
    'dark brown': '120',
    'dark gray': '10',
    'dark green': '80',
    'dark orange': '68',
    'dark pink': '47',
    'dark purple': '89',
    'dark red': '59',
    'dark tan': '69',
    'dark turquoise': '39',
    'green': '6',
    'lavender': '154',
    'light aqua': '152',
    'light bluish gray': '86',
    'light gray': '9',
    'light green': '38',
    'light pink': '56',
    'light purple': '93',
    'light salmon': '26',
    'light turquoise': '40',
    'light yellow': '33',
    'lime': '34',
    'magenta': '71',
    'medium azure': '156',
    'medium blue': '42',
    'medium dark pink': '94',
    'medium lavender': '157',
    'medium orange': '31',
    'olive green': '155',
    'orange': '4',
    'pearl gold': '115',
    'pink': '23',
    'purple': '24',
    'red': '5',
    'reddish brown': '88',
    'sand blue': '55',
    'sand green': '48',
    'tan': '2',
    'trans-black': '32',
    'trans-bright green': '108',
    'trans-clear': '12',
    'trans-dark blue': '14',
    'trans-dark pink': '50',
    'trans-green': '20',
    'trans-light blue': '15',
    'trans-light green': '35',
    'trans-medium blue': '74',
    'trans-neon green': '16',
    'trans-neon orange': '18',
    'trans-neon yellow': '121',
    'trans-orange': '98',
    'trans-purple': '51',
    'trans-red': '17',
    'trans-yellow': '19',
    'white': '1',
    'yellow': '3',
    'yellowish green': '158'
  };

  // Extrahera item info från URL
  function parseItemUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);

      let itemType = null;
      let itemNo = null;
      let colorId = null;

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

  // Hitta alla items i wanted listan
  function findAllWantedItems() {
    const items = [];
    console.log('🔍 Letar efter items i wanted list...');

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
          if (m.colorId) {
            colorId = m.colorId;
            colorName = colorLink.textContent.trim();
          }
        }
      }

      let quantityWanted = 1;
      for (const match of [
        rowText.match(/Qty:\s*(\d+)/i),
        rowText.match(/Wanted:\s*(\d+)/i),
        rowText.match(/Want:\s*(\d+)/i),
        rowText.match(/Quantity:\s*(\d+)/i),
        rowText.match(/(\d+)\s*x/i)
      ]) {
        if (match) { quantityWanted = parseInt(match[1]); break; }
      }

      items.push({ itemType, itemNo, colorId, colorName, quantityWanted, element: row, link });
    });

    // Ta bort duplicates
    const seen = new Set();
    return items.filter(item => {
      const key = `${item.itemType}-${item.itemNo}-${item.colorId || 'no-color'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Kolla om ett item finns i inventory
  function getItemInventory(itemType, itemNo, colorId) {
    if (!inventory || !Array.isArray(inventory)) return { found: false, quantity: 0 };

    const matchingItems = inventory.filter(item => {
      if (!item.item || item.item.type !== itemType || item.item.no !== itemNo) return false;
      if (colorId) return item.color_id && item.color_id.toString() === colorId.toString();
      return true;
    });

    if (matchingItems.length === 0) return { found: false, quantity: 0 };

    const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    return { found: true, quantity: totalQuantity };
  }

  // Fyll i ett React-kontrollerat input-fält med ett värde
  function fillReactInput(input, value) {
    // React åsidosätter input.value-settern; använd nativa prototyp-settern
    // för att React ska detektera ändringen.
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(input, value.toString());
    input.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`✅ Have-fält ifyllt med ${value}`);
  }

  // Hitta Have-fältet i en rad och fyll i värdet.
  // Fältet är React-renderat och visas inte förrän man klickar på det.
  function activateAndFillHaveField(rowElement, value) {
    // Steg 1: finns ett input redan (fältet redan aktiverat)?
    const existingInput = rowElement.querySelector('input[type="text"], input:not([type])');
    if (existingInput) {
      fillReactInput(existingInput, value);
      return;
    }

    // Steg 2: hitta klickbart Have-element och aktivera det
    // BrickLink markerar redigerbara fält med klassen wl-hover-editable
    let haveTarget = null;

    const editables = rowElement.querySelectorAll('.wl-hover-editable');
    for (const el of editables) {
      if (el.textContent.includes('Have')) {
        haveTarget = el;
        break;
      }
    }

    // Fallback: sök efter text "Have" i celler
    if (!haveTarget) {
      const cells = rowElement.querySelectorAll('td, div');
      for (const cell of cells) {
        if (/\bHave\b/i.test(cell.textContent) && !cell.querySelector('a')) {
          haveTarget = cell;
          break;
        }
      }
    }

    if (!haveTarget) {
      console.warn('⚠️ Kunde inte hitta Have-fältet i raden');
      return;
    }

    // Observera Have-elementet för att fånga när React renderar input
    const observer = new MutationObserver((mutations, obs) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const input = node.tagName === 'INPUT'
            ? node
            : node.querySelector('input');
          if (input) {
            obs.disconnect();
            // Liten fördröjning så React hinner montera fältet fullt
            setTimeout(() => fillReactInput(input, value), 50);
            return;
          }
        }
      }
    });

    observer.observe(haveTarget, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 3000);

    // Klicka för att aktivera React-fältet
    haveTarget.click();
  }

  // Markera ett item som "har i inventory" och lägg till Fill-knapp
  function markItemAsOwned(element, link, quantityOwned, quantityWanted, colorId, colorName) {
    const valueToSet = quantityOwned >= quantityWanted ? quantityWanted : quantityOwned;

    // --- Badge ---
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
    `;

    if (quantityOwned >= quantityWanted) {
      badge.style.setProperty('background', '#10b981', 'important');
      badge.style.setProperty('color', 'white', 'important');
      badge.textContent = `✓ Har ${quantityOwned}`;
    } else {
      badge.style.setProperty('background', '#f59e0b', 'important');
      badge.style.setProperty('color', 'white', 'important');
      badge.textContent = `⚠ Har ${quantityOwned}/${quantityWanted}`;
    }

    if (colorId && colorName) badge.title = `Färg: ${colorName}`;

    // --- Fill-knapp ---
    const fillBtn = document.createElement('button');
    fillBtn.className = 'bricklink-fill-have-btn';
    fillBtn.textContent = `Fill ${valueToSet}`;
    fillBtn.title = `Klicka för att fylla i ${valueToSet} i Have-fältet`;
    fillBtn.style.cssText = `
      display: inline-block !important;
      margin-left: 6px !important;
      padding: 3px 8px !important;
      border-radius: 4px !important;
      font-size: 11px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      border: 1px solid #2563eb !important;
      background: #3b82f6 !important;
      color: white !important;
      vertical-align: middle !important;
    `;

    fillBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activateAndFillHaveField(element, valueToSet);
    });

    // Lägg till badge och knapp bredvid länken
    if (link.parentElement) {
      link.parentElement.insertBefore(badge, link.nextSibling);
      link.parentElement.insertBefore(fillBtn, badge.nextSibling);
    }

    // Subtil bakgrundsfärg på raden
    if (element) {
      element.style.setProperty('background-color', 'rgba(16, 185, 129, 0.08)', 'important');
      element.style.setProperty('border-left', '3px solid #10b981', 'important');
    }
  }

  // Skapa status-indikator
  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bricklink-wanted-indicator';
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: white;
      border: 2px solid #ddd;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: Arial, sans-serif;
      min-width: 250px;
      max-width: 350px;
    `;
    indicator.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #333; font-size: 14px;">
        ⭐ Wanted List Check
      </div>
      <div id="bricklink-wanted-status" style="color: #666; font-size: 13px; line-height: 1.5;">
        Laddar...
      </div>
    `;
    document.body.appendChild(indicator);
    return indicator;
  }

  function updateStatus(message, color = '#666') {
    const el = document.getElementById('bricklink-wanted-status');
    if (el) { el.innerHTML = message; el.style.color = color; }
  }

  // Huvudfunktion
  async function processPage() {
    if (processing) return;
    processing = true;

    console.log('⭐ Bricklink Wanted List Checker: Processing wanted list...');

    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      console.log('⚠️ API-nycklar saknas');
      processing = false;
      return;
    }

    const indicator = createStatusIndicator();
    updateStatus('⏳ Hämtar inventory...');

    try {
      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          updateStatus('⚠️ Timeout - API svarar inte', '#f59e0b');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
        }
      }, 30000);

      chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
        responseReceived = true;
        clearTimeout(timeout);

        if (!response || response.error) {
          updateStatus('⚠️ Kunde ej hämta inventory', '#f59e0b');
          console.error('❌', response ? response.error : 'No response');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }

        inventory = response.inventory;

        if (!inventory || !Array.isArray(inventory)) {
          updateStatus('⚠️ Inventory är tomt', '#f59e0b');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }

        console.log(`✅ Inventory hämtat: ${inventory.length} items`);
        updateStatus('🔍 Analyserar wanted list...');

        const items = findAllWantedItems();
        console.log(`🔍 Hittade ${items.length} items i wanted list`);

        let ownedFullyCount = 0;
        let ownedPartiallyCount = 0;

        items.forEach(item => {
          const inventoryData = getItemInventory(item.itemType, item.itemNo, item.colorId);

          if (inventoryData.found) {
            if (inventoryData.quantity >= item.quantityWanted) ownedFullyCount++;
            else ownedPartiallyCount++;

            markItemAsOwned(
              item.element, item.link,
              inventoryData.quantity, item.quantityWanted,
              item.colorId, item.colorName
            );
          }
        });

        const total = ownedFullyCount + ownedPartiallyCount;
        let statusMsg = total > 0
          ? `✓ Tillräckligt: ${ownedFullyCount}<br>⚠ Delvis: ${ownedPartiallyCount}<br>❌ Saknas: ${items.length - total}<br><small>${total} av ${items.length} har Fill-knapp</small>`
          : `Inga items från wanted list i inventory<br><small>${items.length} items totalt</small>`;

        updateStatus(statusMsg, total > 0 ? '#10b981' : '#666');

        setTimeout(() => indicator.remove(), 8000);
        processing = false;
      });
    } catch (error) {
      console.error('❌', error);
      updateStatus('⚠️ Fel vid kommunikation', '#f59e0b');
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
