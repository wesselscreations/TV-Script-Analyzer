/**
 * Main controller for the Script Analyzer application
 */
class ScriptAnalyzerController {
  constructor() {
    this.scriptFile = null;
    this.scriptData = null;
    this.googleAuth = null;
    this.googleDriveId = null;
    this.googleSheetId = null;
    
    // Initialize components
    this.initializeUI();
    this.initializeGoogleAuth();
  }
  
  /**
   * Initialize UI elements and event listeners
   */
  initializeUI() {
    // File upload handling
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
    uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
    uploadArea.addEventListener('drop', this.handleFileDrop.bind(this));
    fileInput.addEventListener('change', this.handleFileSelect.bind(this));
    
    // Process button
    document.getElementById('processBtn').addEventListener('click', this.processScript.bind(this));
    
    // Character list listeners
    document.addEventListener('click', (e) => {
      if (e.target.matches('.character input[type="checkbox"]')) {
        this.toggleCharacterVisibility(e.target);
      } else if (e.target.matches('.character .color-picker')) {
        this.updateCharacterColor(e.target);
      }
    });
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', this.switchTab.bind(this));
    });
  }
  
  /**
   * Initialize Google API auth
   */
  initializeGoogleAuth() {
    gapi.load('client:auth2', () => {
      gapi.client.init({
        apiKey: 'YOUR_API_KEY',
        clientId: 'YOUR_CLIENT_ID',
        discoveryDocs: [
          "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
          "https://sheets.googleapis.com/$discovery/rest?version=v4"
        ],
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets'
      }).then(() => {
        this.googleAuth = gapi.auth2.getAuthInstance();
        
        // Listen for sign-in state changes
        this.googleAuth.isSignedIn.listen(this.updateSigninStatus.bind(this));
        
        // Handle the initial sign-in state
        this.updateSigninStatus(this.googleAuth.isSignedIn.get());
      });
    });
  }
  
  /**
   * Update UI based on sign-in status
   */
  updateSigninStatus(isSignedIn) {
    const processBtn = document.getElementById('processBtn');
    
    if (isSignedIn) {
      processBtn.disabled = false;
      processBtn.title = '';
    } else {
      processBtn.disabled = true;
      processBtn.title = 'Please sign in with Google first';
    }
  }
  
  /**
   * Handle file drag over
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').style.borderColor = '#3498db';
  }
  
  /**
   * Handle file drag leave
   */
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').style.borderColor = '#ccc';
  }
  
  /**
   * Handle file drop
   */
  handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').style.borderColor = '#ccc';
    
    const files = e.dataTransfer.files;
    if (files.length) {
      this.handleFile(files[0]);
    }
  }
  
  /**
   * Handle file selection from input
   */
  handleFileSelect(e) {
    if (e.target.files.length) {
      this.handleFile(e.target.files[0]);
    }
  }
  
  /**
   * Process selected file
   */
  handleFile(file) {
    const fileInfo = document.getElementById('fileInfo');
    
    if (file.type !== 'application/pdf') {
      fileInfo.innerHTML = '<p style="color: red;">Please upload a PDF file</p>';
      return;
    }
    
    fileInfo.innerHTML = `
      <p><strong>File:</strong> ${file.name}</p>
      <p><strong>Size:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
    `;
    
    // Store the file for later processing
    this.scriptFile = file;
  }
  
  /**
   * Process script file
   */
  async processScript() {
    if (!this.scriptFile) {
      alert('Please upload a script file first');
      return;
    }
    
    if (!this.googleAuth.isSignedIn.get()) {
      alert('Please sign in with Google first');
      this.googleAuth.signIn();
      return;
    }
    
    const loading = document.getElementById('loading');
    loading.style.display = 'block';
    
    try {
      // Process the PDF
      this.scriptData = await processPDF(this.scriptFile);
      this.scriptData.originalFile = this.scriptFile;
      
      // Update UI with results
      this.updateScriptContent();
      this.updateCharacterList();
      this.updatePropsList();
      
      // Upload to Google
      const googleInfo = await uploadToGoogle(this.scriptData, this.scriptFile.name);
      this.googleDriveId = googleInfo.fileId;
      this.googleSheetId = googleInfo.spreadsheetId;
      
      // Show success message
      const fileInfo = document.getElementById('fileInfo');
      fileInfo.innerHTML += `
        <p style="color: green;">Script processed successfully!</p>
        <p><a href="${googleInfo.spreadsheetUrl}" target="_blank">View in Google Sheets</a></p>
      `;
    } catch (error) {
      console.error('Error processing script:', error);
      alert('Error processing script: ' + error.message);
    } finally {
      loading.style.display = 'none';
    }
  }
  
  /**
   * Update script content with highlighting
   */
  updateScriptContent() {
    const scriptContent = document.getElementById('scriptContent');
    
    if (!this.scriptData) {
      scriptContent.innerHTML = '<p>No script data available</p>';
      return;
    }
    
    const highlightedText = highlightScript(this.scriptData.scriptText, this.scriptData.characters);
    scriptContent.innerHTML = '<div class="script-text">' + highlightedText + '</div>';
  }
  
  /**
   * Update character list
   */
  updateCharacterList() {
    const characterList = document.getElementById('characterList');
    
    if (!this.scriptData || !this.scriptData.characters.length) {
      characterList.innerHTML = '<p>No characters identified</p>';
      return;
    }
    
    let characterHTML = '';
    this.scriptData.characters.forEach(char => {
      characterHTML += `
        <div class="character">
          <label>
            <input type="checkbox" checked>
            ${char.name}
            <input type="color" class="color-picker" value="${char.color}" data-character="${char.name}">
          </label>
        </div>
      `;
    });
    
    characterList.innerHTML = characterHTML;
  }
  
  /**
   * Update props list
   */
  updatePropsList() {
    const propsContent = document.getElementById('propsContent');
    
    if (!this.scriptData || !this.scriptData.props.length) {
      propsContent.innerHTML = '<p>No props identified</p>';
      return;
    }
    
    // Group props by character
    const propsByCharacter = {};
    this.scriptData.props.forEach(prop => {
      if (!propsByCharacter[prop.owner]) {
        propsByCharacter[prop.owner] = [];
      }
      propsByCharacter[prop.owner].push(prop);
    });
    
    // Generate HTML for props
    let propsHTML = '';
    for (const character in propsByCharacter) {
      const charColor = this.getCharacterColor(character);
      
      propsHTML += `
        <div class="character-props" style="border-left: 4px solid ${charColor}; margin-bottom: 15px; padding-left: 10px;">
          <h3>${character}</h3>
          <ul>
      `;
      
      propsByCharacter[character].forEach(prop => {
        propsHTML += `
          <li class="prop-item">
            <strong>${prop.name}</strong> 
            <span class="prop-scene">(Scene: ${prop.scene || 'Unknown'})</span>
          </li>
        `;
      });
      
      propsHTML += `
          </ul>
        </div>
      `;
    }
    
    propsContent.innerHTML = propsHTML;
  }
  
  /**
   * Get color for a character
   */
  getCharacterColor(characterName) {
    if (!this.scriptData || !this.scriptData.characters) {
      return '#ccc';
    }
    
    const character = this.scriptData.characters.find(c => c.name === characterName);
    return character ? character.color : '#ccc';
  }
  
  /**
   * Toggle character visibility
   */
  toggleCharacterVisibility(checkbox) {
    const characterName = checkbox.parentElement.textContent.trim();
    const highlights = document.querySelectorAll(`.character-highlight[data-character="${characterName}"]`);
    
    highlights.forEach(el => {
      el.style.display = checkbox.checked ? 'inline' : 'none';
    });
  }
  
  /**
   * Update character color
   */
  updateCharacterColor(colorPicker) {
    const characterName = colorPicker.dataset.character;
    const newColor = colorPicker.value;
    
    // Update highlights in script
    const highlights = document.querySelectorAll(`.character-highlight[data-character="${characterName}"]`);
    highlights.forEach(el => {
      el.style.backgroundColor = newColor;
    });
    
    // Update character in data
    if (this.scriptData && this.scriptData.characters) {
      const charIndex = this.scriptData.characters.findIndex(c => c.name ===
// Update character in data
      if (this.scriptData && this.scriptData.characters) {
        const charIndex = this.scriptData.characters.findIndex(c => c.name === characterName);
        if (charIndex !== -1) {
          this.scriptData.characters[charIndex].color = newColor;
        }
      }
      
      // Update props section too
      const propSections = document.querySelectorAll(`.character-props[data-character="${characterName}"]`);
      propSections.forEach(section => {
        section.style.borderLeftColor = newColor;
      });
      
      // If connected to Google Sheets, update the sheet too
      if (this.googleSheetId) {
        this.updateCharacterColorInSheet(characterName, newColor);
      }
    }
    
    /**
     * Update character color in Google Sheet
     */
    async updateCharacterColorInSheet(characterName, newColor) {
      try {
        // Find the row for this character
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: this.googleSheetId,
          range: 'Characters!A:B'
        });
        
        const rows = response.result.values || [];
        let rowIndex = -1;
        
        for (let i = 0; i < rows.length; i++) {
          if (rows[i][0] === characterName) {
            rowIndex = i + 1; // 1-based index for Sheets API
            break;
          }
        }
        
        if (rowIndex !== -1) {
          // Update the color in the sheet
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: this.googleSheetId,
            range: `Characters!B${rowIndex}`,
            valueInputOption: 'RAW',
            resource: {
              values: [[newColor]]
            }
          });
        }
      } catch (error) {
        console.error('Error updating color in Google Sheet:', error);
      }
    }
    
    /**
     * Switch between tabs
     */
    switchTab(e) {
      const tabButton = e.target;
      const tabId = tabButton.dataset.tab;
      
      // Remove active class from all buttons and tabs
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
      });
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Add active class to current button and tab
      tabButton.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.scriptAnalyzer = new ScriptAnalyzerController();
});