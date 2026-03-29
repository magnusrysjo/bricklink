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

  // Konvertera färgnamn till färg-ID
  function getColorIdFromName(colorName) {
    if (!colorName) return null;
    const normalized = colorName.toLowerCase().trim();
    return COLOR_NAME_TO_ID[normalized] || null;
  }

  // Extrahera item info från URL
  function parseItemUrl(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);
      
      let itemType = null;
      let itemNo = null;
      let colorId = null;
      
      if (params.has('P')) {
        itemType = 'PART';
        itemNo = params.get('P');
      } else if (params.has('S')) {
        itemType = 'SET';
        itemNo = params.get('S');
      } else if (params.has('M')) {
        itemType = 'MINIFIG';
        itemNo = params.get('M');
      } else if (params.has('G')) {
        itemType = 'GEAR';
        itemNo = params.get('G');
      } else if (params.has('B')) {
        itemType = 'BOOK';
        itemNo = params.get('B');
      }
      
      // Extrahera color ID om det finns
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
    
    // Wanted lists använder oftast tabeller eller divs med länkar
    const links = document.querySelectorAll('a[href*="catalogitem.page"]');
    
    links.forEach(link => {
      const { itemType, itemNo, colorId: urlColorId } = parseItemUrl(link.href);
      
      if (!itemType || !itemNo) return;
      
      // Hitta närmaste rad eller container
      const row = link.closest('tr') || link.closest('div[class*="row"]') || link.closest('div[class*="item"]') || link.parentElement;
      
      if (!row) return;
      
      let colorId = urlColorId; // Börja med färg från URL om den finns
      let colorName = null;
      
      // Försök hitta färgnamn i texten
      // Wanted list visar ofta färgen som text (t.ex. "Black", "Red")
      const rowText = row.textContent;
      
      // Lista över vanliga färgord att leta efter
      const colorWords = Object.keys(COLOR_NAME_TO_ID);
      
      // Leta efter färgnamn i texten
      for (const color of colorWords) {
        // Skapa ett regex som matchar färgen som ett helt ord
        // Använd word boundaries för att undvika false positives
        const regex = new RegExp(`\\b${color}\\b`, 'i');
        if (regex.test(rowText)) {
          colorName = color;
          colorId = COLOR_NAME_TO_ID[color];
          console.log(`    → Hittade färgnamn "${color}" i texten → färg ID ${colorId}`);
          break;
        }
      }
      
      // Om vi inte hittade färg i texten, försök hitta färglänk
      if (!colorId) {
        const colorLink = row.querySelector('a[href*="idColor"], a[href*="ColorID"]');
        if (colorLink) {
          const colorMatch = parseItemUrl(colorLink.href);
          if (colorMatch.colorId) {
            colorId = colorMatch.colorId;
            colorName = colorLink.textContent.trim();
            console.log(`    → Hittade färglänk: ${colorName} (ID ${colorId})`);
          }
        }
      }
      
      // Försök hitta quantity wanted från texten i raden
      let quantityWanted = 1;
      
      // Leta efter quantity i olika format
      const qtyMatches = [
        rowText.match(/Qty:\s*(\d+)/i),
        rowText.match(/Wanted:\s*(\d+)/i),
        rowText.match(/Want:\s*(\d+)/i),
        rowText.match(/Quantity:\s*(\d+)/i),
        rowText.match(/(\d+)\s*x/i) // "5 x" format
      ];
      
      for (const match of qtyMatches) {
        if (match) {
          quantityWanted = parseInt(match[1]);
          break;
        }
      }
      
      console.log(`  📦 Hittade: ${itemType} ${itemNo}, Färg ID: ${colorId || 'N/A'}, Färg namn: ${colorName || 'N/A'}, Vill ha: ${quantityWanted}`);
      
      items.push({
        itemType: itemType,
        itemNo: itemNo,
        colorId: colorId,
        colorName: colorName,
        quantityWanted: quantityWanted,
        element: row,
        link: link
      });
    });
    
    // Ta bort duplicates baserat på item + color
    const unique = [];
    const seen = new Set();
    
    items.forEach(item => {
      const key = `${item.itemType}-${item.itemNo}-${item.colorId || 'no-color'}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });
    
    console.log(`✅ Total: ${unique.length} unika items i wanted list`);
    
    return unique;
  }

  // Kolla om ett item finns i inventory
  function getItemInventory(itemType, itemNo, colorId) {
    if (!inventory || !Array.isArray(inventory)) {
      return { found: false, quantity: 0 };
    }
    
    console.log(`  🔎 Kollar inventory för ${itemType} ${itemNo} (färg ID: ${colorId || 'ALLA FÄRGER'})...`);
    
    // Hitta alla matchande items i inventory (bara baserat på type och no)
    const allMatches = inventory.filter(item => {
      return item.item && item.item.type === itemType && item.item.no === itemNo;
    });
    
    console.log(`    → Hittade ${allMatches.length} st av ${itemType} ${itemNo} i inventory (alla färger)`);
    
    if (allMatches.length > 0) {
      // Logga alla färger vi har
      const colorInfo = allMatches.map(item => 
        `Färg ID ${item.color_id || 'N/A'} (${item.color_name || 'okänd'}): ${item.quantity} st`
      ).join(', ');
      console.log(`    → Färger i inventory: ${colorInfo}`);
    }
    
    // Filtrera baserat på färg
    const matchingItems = inventory.filter(item => {
      if (!item.item || item.item.type !== itemType || item.item.no !== itemNo) {
        return false;
      }
      
      // Om vi har color ID från wanted list, matcha ENDAST den färgen
      if (colorId) {
        const match = item.color_id && item.color_id.toString() === colorId.toString();
        if (!match) {
          console.log(`    → Skippar färg ID ${item.color_id} (söker efter ${colorId})`);
        }
        return match;
      }
      
      // Om wanted list inte specificerade färg, räkna alla färger
      // (ovanligt men kan hända)
      console.log(`    ℹ️ Ingen färg specificerad i wanted list, räknar alla färger`);
      return true;
    });
    
    if (matchingItems.length === 0) {
      if (colorId && allMatches.length > 0) {
        console.log(`    ❌ Ingen matchning för färg ID ${colorId} - har andra färger men inte denna`);
      } else {
        console.log(`    ❌ Ingen matchning - har inte denna item alls`);
      }
      return { found: false, quantity: 0 };
    }
    
    const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    console.log(`    ✅ Matchning! Total mängd (rätt färg): ${totalQuantity} st`);
    
    return {
      found: true,
      quantity: totalQuantity
    };
  }

  // Markera ett item som "har i inventory"
  function markItemAsOwned(element, link, quantityOwned, quantityWanted, colorId, colorName) {
    console.log(`    🎨 Markerar item med ${quantityOwned} st (vill ha ${quantityWanted}, färg: ${colorId || 'N/A'})`);
    
    // Beräkna vad som ska fyllas i
    const valueToSet = quantityOwned >= quantityWanted ? quantityWanted : quantityOwned;
    console.log(`    🎯 Ska fylla i "Have"-fält med värde: ${valueToSet}`);
    
    // Försök hitta och fylla i "Have"-fältet (React-struktur)
    if (element) {
      // Leta efter div med klass wl-col-quantity eller wl-edit-cell
      const quantityDiv = element.querySelector('.wl-col-quantity, .wl-edit-cell');
      
      if (quantityDiv) {
        console.log(`    ✅ Hittade quantity-div`);
        
        // Hitta den wl-hover-editable som innehåller "Have:"
        const hoverEditables = quantityDiv.querySelectorAll('.wl-hover-editable');
        let haveDiv = null;
        
        hoverEditables.forEach(div => {
          if (div.textContent.includes('Have:')) {
            haveDiv = div;
            console.log(`    ✅ Hittade "Have"-div:`, div.textContent.trim());
          }
        });
        
        if (haveDiv) {
          console.log(`    🖱️ Klickar på "Have"-div för att aktivera edit-mode...`);
          
          // Klicka på div:en för att aktivera edit-mode
          haveDiv.click();
          
          // Vänta medan React skapar input-fältet
          setTimeout(() => {
            // Leta efter input-fältet som skapades
            const input = haveDiv.querySelector('input') || 
                         quantityDiv.querySelector('input') ||
                         element.querySelector('input:not([readonly])') ||
                         document.activeElement;
            
            if (input && input.tagName === 'INPUT') {
              console.log(`    ✅ Hittade input-fält!`);
              
              // Rensa och sätt nytt värde
              input.value = '';
              input.value = valueToSet.toString();
              
              // Trigga React events
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              ).set;
              nativeInputValueSetter.call(input, valueToSet.toString());
              
              // Trigga events som React lyssnar på
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              
              console.log(`    ✅ Fyllde i "Have"-fält med värde: ${valueToSet}`);
              
              // Tryck Enter för att spara
              setTimeout(() => {
                input.dispatchEvent(new KeyboardEvent('keydown', { 
                  key: 'Enter', 
                  code: 'Enter',
                  keyCode: 13,
                  bubbles: true 
                }));
                input.dispatchEvent(new KeyboardEvent('keyup', { 
                  key: 'Enter', 
                  code: 'Enter',
                  keyCode: 13,
                  bubbles: true 
                }));
              }, 50);
              
            } else {
              console.log(`    ❌ Kunde inte hitta input-fält efter klick`);
              console.log(`    🔍 activeElement:`, document.activeElement);
            }
          }, 300); // Vänta 300ms medan React uppdaterar DOM
        } else {
          console.log(`    ❌ Kunde inte hitta "Have"-div`);
        }
      } else {
        console.log(`    ❌ Kunde inte hitta quantity-div`);
      }
    }
    
    // Skapa badge
    const badge = document.createElement('div');
    badge.className = 'bricklink-wanted-badge';
    badge.style.cssText = `
      display: inline-block !important;
      margin-left: 8px !important;
      padding: 5px 10px !important;
      border-radius: 6px !important;
      font-weight: bold !important;
      font-size: 11px !important;
      vertical-align: middle !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.15) !important;
      z-index: 9999 !important;
    `;
    
    let tooltipText = '';
    
    if (quantityOwned >= quantityWanted) {
      // Grön - har tillräckligt (eller mer)
      badge.style.setProperty('background', 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 'important');
      badge.style.setProperty('color', 'white', 'important');
      badge.innerHTML = `✓ Har ${quantityOwned}`;
      tooltipText = `Du har ${quantityOwned} st i inventory - tillräckligt! (Försöker auto-fylla ${quantityWanted})`;
    } else if (quantityOwned > 0) {
      // Orange - har några men inte tillräckligt
      badge.style.setProperty('background', 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 'important');
      badge.style.setProperty('color', 'white', 'important');
      badge.innerHTML = `⚠ Har ${quantityOwned}/${quantityWanted}`;
      tooltipText = `Du har ${quantityOwned} st, behöver ${quantityWanted - quantityOwned} till (Försöker auto-fylla ${quantityOwned})`;
    }
    
    // Lägg till färginformation i tooltip
    if (colorId && colorName) {
      tooltipText += ` (Färg: ${colorName})`;
    } else if (colorId) {
      tooltipText += ` (Färg ID: ${colorId})`;
    }
    
    badge.title = tooltipText;
    
    // Lägg till badge bredvid länken
    if (link.parentElement) {
      link.parentElement.insertBefore(badge, link.nextSibling);
      console.log(`    ✅ Badge tillagd:`, badge.innerHTML);
    }
    
    // Lägg till subtil grön bakgrund på hela raden/elementet
    if (element) {
      element.style.setProperty('background-color', 'rgba(16, 185, 129, 0.08)', 'important');
      element.style.setProperty('border-left', '3px solid #10b981', 'important');
      element.style.setProperty('padding-left', '8px', 'important');
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
      animation: slideIn 0.3s ease-out;
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

  // Uppdatera status
  function updateStatus(message, color = '#666') {
    const statusDiv = document.getElementById('bricklink-wanted-status');
    if (statusDiv) {
      statusDiv.innerHTML = message;
      statusDiv.style.color = color;
    }
  }

  // Huvudfunktion
  async function processPage() {
    if (processing) return;
    processing = true;
    
    console.log('⭐ Bricklink Wanted List Checker: Processing wanted list...');
    
    // Kolla API-nycklar
    const result = await chrome.storage.sync.get(['apiKey', 'apiSecret', 'tokenValue', 'tokenSecret']);
    
    if (!result.apiKey || !result.apiSecret || !result.tokenValue || !result.tokenSecret) {
      console.log('⚠️ API-nycklar saknas');
      processing = false;
      return;
    }
    
    console.log('✅ API-nycklar hittade');
    
    // Skapa status-indikator
    const indicator = createStatusIndicator();
    updateStatus('⏳ Hämtar inventory...');
    
    // Hämta inventory med timeout
    try {
      let responseReceived = false;
      
      const timeout = setTimeout(() => {
        if (!responseReceived) {
          updateStatus('⚠️ Timeout - API svarar inte', '#f59e0b');
          console.error('❌ Timeout waiting for inventory');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
        }
      }, 30000);
      
      chrome.runtime.sendMessage({ action: 'getFullInventory' }, response => {
        responseReceived = true;
        clearTimeout(timeout);
        
        if (!response) {
          updateStatus('⚠️ Inget svar från background script', '#f59e0b');
          console.error('❌ No response from background script');
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        if (response.error) {
          updateStatus('⚠️ Kunde ej hämta inventory', '#f59e0b');
          console.error('❌ Error fetching inventory:', response.error);
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        inventory = response.inventory;
        
        if (!inventory || !Array.isArray(inventory)) {
          updateStatus('⚠️ Inventory är tomt', '#f59e0b');
          console.error('❌ Invalid inventory data:', inventory);
          setTimeout(() => indicator.remove(), 5000);
          processing = false;
          return;
        }
        
        console.log(`✅ Inventory hämtat: ${inventory.length} items`);
        updateStatus('🔍 Analyserar wanted list...');
        
        // Hitta alla items på wanted list
        const items = findAllWantedItems();
        console.log(`🔍 Hittade ${items.length} items i wanted list`);
        
        let ownedFullyCount = 0;
        let ownedPartiallyCount = 0;
        
        // Kolla varje item
        items.forEach(item => {
          console.log(`\n🔍 Kollar: ${item.itemType} ${item.itemNo} (färg ID: ${item.colorId || 'ej specificerad'})`);
          const inventoryData = getItemInventory(item.itemType, item.itemNo, item.colorId);
          
          if (inventoryData.found) {
            if (inventoryData.quantity >= item.quantityWanted) {
              ownedFullyCount++;
              console.log(`✅ HAR TILLRÄCKLIGT: ${item.itemType} ${item.itemNo} (färg ${item.colorId || 'N/A'}) - Har ${inventoryData.quantity}, vill ha ${item.quantityWanted}`);
            } else {
              ownedPartiallyCount++;
              console.log(`⚠️ HAR DELVIS: ${item.itemType} ${item.itemNo} (färg ${item.colorId || 'N/A'}) - Har ${inventoryData.quantity}, vill ha ${item.quantityWanted}`);
            }
            
            markItemAsOwned(item.element, item.link, inventoryData.quantity, item.quantityWanted, item.colorId, item.colorName);
          } else {
            console.log(`❌ SAKNAS: ${item.itemType} ${item.itemNo} (färg ${item.colorId || 'N/A'})`);
          }
        });
        
        // Uppdatera status
        let statusMsg = '';
        
        if (ownedFullyCount > 0 || ownedPartiallyCount > 0) {
          statusMsg += `<div style="margin-bottom: 8px;">`;
          statusMsg += `<strong>I inventory:</strong><br>`;
          if (ownedFullyCount > 0) {
            statusMsg += `✓ Tillräckligt: ${ownedFullyCount} st<br>`;
          }
          if (ownedPartiallyCount > 0) {
            statusMsg += `⚠ Delvis: ${ownedPartiallyCount} st<br>`;
          }
          statusMsg += `❌ Saknas helt: ${items.length - ownedFullyCount - ownedPartiallyCount} st`;
          statusMsg += `</div>`;
          
          statusMsg += `<div style="font-size: 12px; color: #666;">`;
          statusMsg += `${ownedFullyCount + ownedPartiallyCount} av ${items.length} items i inventory`;
          statusMsg += `</div>`;
          
          updateStatus(statusMsg, '#10b981');
          console.log(`✅ Markerade ${ownedFullyCount + ownedPartiallyCount} items`);
        } else {
          updateStatus(
            `Inga items från wanted list i inventory<br><small>${items.length} items totalt</small>`, 
            '#666'
          );
          console.log('ℹ️ Inga matchningar hittades');
        }
        
        // Ta bort indikator efter 8 sekunder
        setTimeout(() => {
          indicator.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => indicator.remove(), 300);
        }, 8000);
        
        processing = false;
      });
    } catch (error) {
      console.error('❌ Exception när meddelande skickades:', error);
      updateStatus('⚠️ Fel vid kommunikation', '#f59e0b');
      setTimeout(() => indicator.remove(), 5000);
      processing = false;
    }
  }

  // Kör när sidan är laddad
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', processPage);
  } else {
    // Vänta lite eftersom Bricklink kan ladda innehåll dynamiskt
    setTimeout(processPage, 1000);
  }

})();