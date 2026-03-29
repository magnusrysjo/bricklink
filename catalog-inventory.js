// catalog-inventory.js - Markerar delar på parts list sidor (KOMPLETT VERSION)

(function() {
  'use strict';

  let inventory = null;
  let processing = false;

  // Extrahera part-nummer från URL
  function extractPartNumber(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);
      return params.get('P') || params.get('S') || params.get('M') || null;
    } catch (e) {
      return null;
    }
  }

  // Extrahera color ID från URL
  function extractColorId(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(urlObj.search);
      return params.get('ColorID') || params.get('idColor') || null;
    } catch (e) {
      return null;
    }
  }

  // Hitta alla parts från tabellen
  function findAllParts() {
    const parts = [];
    
    console.log('🔍 Letar efter delar i tabellen...');
    
    // Hitta alla rader i inventory tabellen
    const tables = document.querySelectorAll('table');
    
    tables.forEach((table, tableIndex) => {
      const rows = table.querySelectorAll('tr');
      
      rows.forEach((row, rowIndex) => {
        // Leta efter part-länkar i raden
        const partLink = row.querySelector('a[href*="catalogitem.page?P="]');
        if (!partLink) return;
        
        const partNo = extractPartNumber(partLink.href);
        if (!partNo) return;
        
        // Leta efter color-länk i samma rad
        let colorId = null;
        const colorLinks = row.querySelectorAll('a[href*="ColorID"], a[href*="idColor"]');
        
        for (const link of colorLinks) {
          const extractedColorId = extractColorId(link.href);
          if (extractedColorId) {
            colorId = extractedColorId;
            break;
          }
        }
        
        // Om ingen color-länk hittades, försök hitta color ID i part-länken själv
        if (!colorId) {
          colorId = extractColorId(partLink.href);
        }
        
        // Försök hitta color name i texten
        let colorName = null;
        const cells = row.querySelectorAll('td');
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          // Färgnamn brukar finnas i en egen cell
          if (text && text.length < 30 && text.length > 2 && !text.match(/^\d+$/)) {
            const colorLink = cell.querySelector('a[href*="ColorID"], a[href*="idColor"]');
            if (colorLink) {
              colorName = text;
            }
          }
        });
        
        // Försök hitta quantity needed
        let quantityNeeded = 1;
        cells.forEach(cell => {
          const text = cell.textContent.trim();
          // Quantity är ofta ett ensamt nummer i en cell
          if (text.match(/^\d+$/) && parseInt(text) < 1000) {
            quantityNeeded = parseInt(text);
          }
        });
        
        console.log(`  📦 Hittade del: ${partNo}, Färg ID: ${colorId || 'N/A'}, Färg namn: ${colorName || 'N/A'}, Behöver: ${quantityNeeded}`);
        
        parts.push({
          partNo: partNo,
          colorId: colorId,
          colorName: colorName,
          quantityNeeded: quantityNeeded,
          row: row
        });
      });
    });
    
    // Ta bort duplicates baserat på part + color
    const unique = [];
    const seen = new Set();
    
    parts.forEach(part => {
      const key = `${part.partNo}-${part.colorId || 'no-color'}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(part);
      }
    });
    
    console.log(`✅ Total: ${unique.length} unika delar hittade`);
    
    return unique;
  }

  // Kolla om en part finns i inventory
  function getPartInventory(partNo, colorId) {
    if (!inventory || !Array.isArray(inventory)) {
      return { found: false, quantity: 0 };
    }
    
    console.log(`  🔎 Kollar inventory för del ${partNo} med färg ID ${colorId || 'alla färger'}...`);
    
    // Hitta alla matchande items i inventory
    const allPartsMatches = inventory.filter(item => {
      return item.item && item.item.type === 'PART' && item.item.no === partNo;
    });
    
    console.log(`    → Hittade ${allPartsMatches.length} st av del ${partNo} i inventory (alla färger)`);
    
    if (allPartsMatches.length > 0) {
      // Logga alla färger vi har
      const colorInfo = allPartsMatches.map(item => 
        `Färg ID ${item.color_id || 'N/A'} (${item.color_name || 'okänd'}): ${item.quantity} st`
      ).join(', ');
      console.log(`    → Färger i inventory: ${colorInfo}`);
    }
    
    const matchingItems = inventory.filter(item => {
      if (!item.item || item.item.type !== 'PART' || item.item.no !== partNo) {
        return false;
      }
      
      // Om vi har color ID, matcha den också
      if (colorId) {
        const match = item.color_id && item.color_id.toString() === colorId.toString();
        return match;
      }
      
      // Om ingen color specifierad, matcha alla färger
      return true;
    });
    
    if (matchingItems.length === 0) {
      if (colorId && allPartsMatches.length > 0) {
        console.log(`    ❌ Ingen matchning för färg ID ${colorId} - har andra färger men inte denna`);
      } else {
        console.log(`    ❌ Ingen matchning - har inte denna del alls`);
      }
      return { found: false, quantity: 0 };
    }
    
    const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    console.log(`    ✅ Matchning! Total mängd: ${totalQuantity} st`);
    
    return {
      found: true,
      quantity: totalQuantity
    };
  }

  // Markera en rad som "har i inventory"
  function markRowAsOwned(row, quantityOwned, quantityNeeded) {
    console.log(`    🎨 Försöker markera rad med ${quantityOwned} st (behöver ${quantityNeeded})`);
    
    if (!row) {
      console.error('    ❌ Ingen rad att markera!');
      return;
    }
    
    console.log('    📋 Rad-info:', row);
    
    // Hitta BARA synliga td-celler (inte script-taggar eller dolda element)
    const allCells = row.querySelectorAll('td');
    const cells = Array.from(allCells).filter(cell => {
      // Filtrera bort celler som innehåller script-taggar
      if (cell.querySelector('script')) return false;
      // Filtrera bort celler som inte är synliga
      const style = window.getComputedStyle(cell);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return true;
    });
    
    console.log(`    📊 Hittade ${cells.length} SYNLIGA celler i raden (${allCells.length} totalt)`);
    
    let partCell = null;
    let partCellIndex = -1;
    
    // Leta efter cellen med part-länken
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const partLink = cell.querySelector('a[href*="catalogitem.page?P="]');
      if (partLink) {
        partCell = cell;
        partCellIndex = i;
        console.log(`    ✅ Hittade part-länk i SYNLIG cell ${i}:`, partLink.href);
        console.log(`    📝 Cell-innehåll (första 100 tecken):`, cell.textContent.trim().substring(0, 100));
        break;
      }
    }
    
    if (!partCell) {
      console.error('    ❌ Kunde inte hitta part-cellen!');
      console.log('    🔍 Försöker med alternativ metod - letar direkt efter part-länk...');
      
      // Alternativ: hitta part-länken och gå upp till närmaste td
      const partLink = row.querySelector('a[href*="catalogitem.page?P="]');
      if (partLink) {
        partCell = partLink.closest('td');
        console.log('    ✅ Hittade part-cell via closest()');
      }
      
      if (!partCell) {
        console.error('    ❌ Ingen cell att använda - ger upp!');
        return;
      }
    }
    
    console.log(`    🎯 Använder cell-index: ${partCellIndex >= 0 ? partCellIndex : 'via closest()'}`);
    
    // Skapa en synlig indikator-box
    const indicator = document.createElement('div');
    indicator.className = 'bricklink-inventory-indicator-box';
    indicator.style.cssText = `
      display: inline-block !important;
      margin-right: 8px !important;
      padding: 6px 10px !important;
      border-radius: 6px !important;
      font-weight: bold !important;
      font-size: 12px !important;
      vertical-align: middle !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
      z-index: 9999 !important;
    `;
    
    if (quantityOwned >= quantityNeeded) {
      // Grön för kompletta
      indicator.style.setProperty('background', 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 'important');
      indicator.style.setProperty('color', 'white', 'important');
      indicator.innerHTML = `✓ ${quantityOwned}`;
      indicator.title = `Du har ${quantityOwned} st, behöver ${quantityNeeded} st - KOMPLETT!`;
    } else {
      // Orange för ofullständiga
      indicator.style.setProperty('background', 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 'important');
      indicator.style.setProperty('color', 'white', 'important');
      indicator.innerHTML = `⚠ ${quantityOwned}/${quantityNeeded}`;
      indicator.title = `Du har bara ${quantityOwned} st av ${quantityNeeded} som behövs`;
    }
    
    console.log(`    🏷️ Skapad indikator:`, indicator.innerHTML);
    console.log(`    📦 Före insert - partCell.children.length:`, partCell.children.length);
    console.log(`    📝 partCell HTML (första 200 tecken):`, partCell.innerHTML.substring(0, 200));
    
    // Lägg till indikatorn FÖRST i part-cellen, EFTER eventuella script-taggar
    try {
      // Hitta första synliga element i cellen
      let insertPoint = partCell.firstChild;
      while (insertPoint && insertPoint.nodeType !== 1) {
        insertPoint = insertPoint.nextSibling;
      }
      
      // Om första elementet är ett script, gå till nästa
      if (insertPoint && insertPoint.tagName === 'SCRIPT') {
        insertPoint = insertPoint.nextSibling;
      }
      
      partCell.insertBefore(indicator, insertPoint);
      console.log(`    ✅ insertBefore lyckades!`);
      console.log(`    📦 Efter insert - partCell.children.length:`, partCell.children.length);
      
      // Verifiera att indikatorn faktiskt finns i DOM:en
      const found = partCell.querySelector('.bricklink-inventory-indicator-box');
      if (found) {
        console.log(`    ✅ Indikator VERIFIERAD i DOM - finns på plats!`);
        console.log(`    👁️ Indikator är synlig:`, found.offsetHeight > 0 && found.offsetWidth > 0);
        console.log(`    📐 Indikator storlek: ${found.offsetWidth}x${found.offsetHeight}`);
        console.log(`    🎨 Indikator display:`, window.getComputedStyle(found).display);
        console.log(`    📍 Indikator position i parent:`, Array.from(partCell.children).indexOf(found));
      } else {
        console.error(`    ❌ Indikator INTE hittad i DOM efter insert!`);
      }
    } catch (e) {
      console.error(`    ❌ Fel vid insertBefore:`, e);
    }
    
    console.log('    ✅ Indikator tillagd:', indicator.innerHTML);
    
    // Lägg till en subtil grön border på vänster sida av raden (bara visuell hint)
    row.style.setProperty('border-left', '4px solid #10b981', 'important');
    row.style.setProperty('padding-left', '4px', 'important');
    
    console.log('    ✅ Markering klar!');
  }

  // Skapa status-indikator
  function createStatusIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'bricklink-inv-indicator';
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
        🧱 Parts Inventory Check
      </div>
      <div id="bricklink-inv-status" style="color: #666; font-size: 13px; line-height: 1.5;">
        Laddar...
      </div>
    `;
    
    document.body.appendChild(indicator);
    return indicator;
  }

  // Uppdatera status
  function updateStatus(message, color = '#666') {
    const statusDiv = document.getElementById('bricklink-inv-status');
    if (statusDiv) {
      statusDiv.innerHTML = message;
      statusDiv.style.color = color;
    }
  }

  // Huvudfunktion
  async function processPage() {
    if (processing) return;
    processing = true;
    
    console.log('🧱 Bricklink Parts Inventory Checker: Processing parts list...');
    
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
        updateStatus('🔍 Analyserar delar...');
        
        // Hitta alla parts på sidan
        const parts = findAllParts();
        console.log(`🔍 Hittade ${parts.length} unika delar på sidan`);
        
        let ownedCount = 0;
        let partialCount = 0;
        let totalQuantityNeeded = 0;
        let totalQuantityOwned = 0;
        
        // Kolla varje part
        parts.forEach(part => {
          console.log(`\n🔍 Kollar del: ${part.partNo}`);
          const inventoryData = getPartInventory(part.partNo, part.colorId);
          totalQuantityNeeded += part.quantityNeeded;
          
          if (inventoryData.found) {
            totalQuantityOwned += Math.min(inventoryData.quantity, part.quantityNeeded);
            
            if (inventoryData.quantity >= part.quantityNeeded) {
              ownedCount++;
              console.log(`✅ KOMPLETT: ${part.partNo} (färg: ${part.colorId || 'alla'}) - Har ${inventoryData.quantity} st, behöver ${part.quantityNeeded} st`);
            } else {
              partialCount++;
              console.log(`⚠️ DELVIS: ${part.partNo} (färg: ${part.colorId || 'alla'}) - Har bara ${inventoryData.quantity} st, behöver ${part.quantityNeeded} st`);
            }
            
            markRowAsOwned(part.row, inventoryData.quantity, part.quantityNeeded);
          } else {
            console.log(`❌ SAKNAS: ${part.partNo} (färg: ${part.colorId || 'alla'})`);
          }
        });
        
        // Uppdatera status med detaljerad info
        let statusMsg = '';
        
        if (ownedCount > 0 || partialCount > 0) {
          statusMsg += `<div style="margin-bottom: 8px;">`;
          statusMsg += `<strong>Delar:</strong><br>`;
          statusMsg += `✓ Kompletta: ${ownedCount} st<br>`;
          if (partialCount > 0) {
            statusMsg += `⚠ Ofullständiga: ${partialCount} st<br>`;
          }
          statusMsg += `❌ Saknas: ${parts.length - ownedCount - partialCount} st`;
          statusMsg += `</div>`;
          
          statusMsg += `<div style="font-size: 12px; color: #666;">`;
          statusMsg += `Total: ${ownedCount + partialCount} av ${parts.length} delar`;
          statusMsg += `</div>`;
          
          updateStatus(statusMsg, '#10b981');
          console.log(`✅ Markerade ${ownedCount + partialCount} delar`);
        } else {
          updateStatus(
            `Inga delar från denna lista i inventory<br><small>${parts.length} unika delar hittades</small>`, 
            '#666'
          );
          console.log('ℹ️ Inga matchningar hittades');
        }
        
        // Ta bort indikator efter 10 sekunder (längre tid för parts lists)
        setTimeout(() => {
          indicator.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => indicator.remove(), 300);
        }, 10000);
        
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