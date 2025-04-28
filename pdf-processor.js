/**
 * Process PDF using PDF.js
 * This would be included in the web client
 */
function processPDF(fileBlob) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    
    fileReader.onload = function() {
      const typedArray = new Uint8Array(this.result);
      
      // Load the PDF using PDF.js
      pdfjsLib.getDocument(typedArray).promise.then(pdf => {
        console.log('PDF loaded');
        
        // Store text content from all pages
        let textContent = '';
        let pendingPages = pdf.numPages;
        
        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
          pdf.getPage(i).then(page => {
            page.getTextContent().then(content => {
              // Concatenate text items with proper spacing
              const pageText = content.items.map(item => item.str).join(' ');
              textContent += pageText + '\n\n';
              
              pendingPages--;
              if (pendingPages === 0) {
                // All pages processed
                resolve(parseScriptText(textContent));
              }
            });
          });
        }
      }).catch(error => {
        console.error('Error loading PDF:', error);
        reject(error);
      });
    };
    
    fileReader.onerror = function() {
      reject(new Error('Failed to read file'));
    };
    
    // Read the blob as an array buffer
    fileReader.readAsArrayBuffer(fileBlob);
  });
}

/**
 * Parse script text to identify characters, scenes, and props
 */
function parseScriptText(scriptText) {
  // Split script into lines
  const lines = scriptText.split('\n').map(line => line.trim()).filter(line => line);
  
  const characters = new Set();
  const scenes = new Set();
  const props = [];
  
  let currentScene = null;
  
  // Regular expressions for script elements
  const sceneHeaderRegex = /^(INT|EXT|INT\/EXT|EXT\/INT)\.[\s\w\-\']*([-\s])(DAY|NIGHT|DUSK|DAWN|CONTINUOUS|LATER|SAME TIME)/i;
  const characterNameRegex = /^([A-Z][A-Z\s\-\'\.]+)(?:\s*\(.*\))?$/;
  const propRegex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Check for scene headers
    if (sceneHeaderRegex.test(line)) {
      currentScene = line;
      scenes.add(currentScene);
    }
// Check for character names (all caps followed by dialogue)
    else if (characterNameRegex.test(line)) {
      const characterName = line.trim();
      characters.add(characterName);
      
      // Look ahead for props in the character's action or dialogue
      let j = i + 1;
      let inDialogue = true;
      
      while (j < lines.length && inDialogue) {
        // Stop if we hit another character name or scene heading
        if (characterNameRegex.test(lines[j]) || sceneHeaderRegex.test(lines[j])) {
          inDialogue = false;
          continue;
        }
        
        // Look for props in dialogue or action
        const propMatches = lines[j].match(propRegex);
        if (propMatches) {
          propMatches.forEach(propName => {
            // Filter out common words that might be matched but aren't props
            const commonWords = ['The', 'And', 'But', 'Then', 'When', 'That', 'This', 'Just', 'With'];
            if (!commonWords.includes(propName)) {
              props.push({
                name: propName,
                owner: characterName,
                scene: currentScene,
                mention: lines[j]
              });
            }
          });
        }
        
        j++;
      }
    }
    
    i++;
  }
  
  return {
    characters: Array.from(characters).map(name => ({ 
      name, 
      color: generateCharacterColor(name)
    })),
    scenes: Array.from(scenes),
    props: props
  };
}

/**
 * Generate a deterministic color for a character based on their name
 */
function generateCharacterColor(name) {
  // Hash the character name to generate a consistent color
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert to hex color
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
}

/**
 * Highlight the script text with character colors
 */
function highlightScript(scriptText, characters) {
  let highlightedText = scriptText;
  
  // Create a map for character colors
  const characterColors = {};
  characters.forEach(char => {
    characterColors[char.name] = char.color;
  });
  
  // Replace character names with highlighted versions
  characters.forEach(char => {
    const regex = new RegExp(`\\b${escapeRegExp(char.name)}\\b`, 'g');
    highlightedText = highlightedText.replace(regex, 
      `<span class="character-highlight" style="background-color: ${char.color};">${char.name}</span>`
    );
  });
  
  return highlightedText;
}

/**
 * Escape special characters for regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Upload processed script data to Google Drive and Sheets
 */
function uploadToGoogle(scriptData, fileName) {
  return new Promise((resolve, reject) => {
    // Check if user is authenticated
    if (!gapi.auth2.getAuthInstance().isSignedIn.get()) {
      reject(new Error('User not authenticated with Google'));
      return;
    }
    
    // First create a Google Sheet to store the data
    gapi.client.sheets.spreadsheets.create({
      properties: {
        title: `Script Analysis: ${fileName}`
      },
      sheets: [
        {
          properties: { title: "Characters" },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Character Name" } },
                    { userEnteredValue: { stringValue: "Color" } },
                    { userEnteredValue: { stringValue: "Scenes" } }
                  ]
                },
                ...scriptData.characters.map(char => ({
                  values: [
                    { userEnteredValue: { stringValue: char.name } },
                    { userEnteredValue: { stringValue: char.color } }
                  ]
                }))
              ]
            }
          ]
        },
        {
          properties: { title: "Props" },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: "Prop Name" } },
                    { userEnteredValue: { stringValue: "Owner" } },
                    { userEnteredValue: { stringValue: "Scene" } },
                    { userEnteredValue: { stringValue: "Mention" } }
                  ]
                },
                ...scriptData.props.map(prop => ({
                  values: [
                    { userEnteredValue: { stringValue: prop.name } },
                    { userEnteredValue: { stringValue: prop.owner } },
                    { userEnteredValue: { stringValue: prop.scene || "Unknown" } },
                    { userEnteredValue: { stringValue: prop.mention } }
                  ]
                }))
              ]
            }
          ]
        }
      ]
    }).then(response => {
      const spreadsheetId = response.result.spreadsheetId;
      
      // Now upload the PDF to Google Drive
      const fileMetadata = {
        name: fileName,
        mimeType: 'application/pdf'
      };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
      form.append('file', scriptData.originalFile);
      
      fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: new Headers({
          'Authorization': 'Bearer ' + gapi.auth.getToken().access_token
        }),
        body: form
      })
      .then(resp => resp.json())
      .then(driveFile => {
        // Link the PDF and the spreadsheet
        resolve({
          spreadsheetId: spreadsheetId,
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          fileId: driveFile.id,
          fileUrl: `https://drive.google.com/file/d/${driveFile.id}/view`
        });
      })
      .catch(error => {
        reject(error);
      });
    }).catch(error => {
      reject(error);
    });
  });
}