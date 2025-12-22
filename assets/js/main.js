import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, push, update, set, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCy8RnpwpL0RdjfaU690j7mKAzr1fiWFXk",
    authDomain: "timos-barista-bar.firebaseapp.com",
    databaseURL: "https://timos-barista-bar-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "timos-barista-bar",
    storageBucket: "timos-barista-bar.firebasestorage.app",
    messagingSenderId: "94308664114",
    appId: "1:94308664114:web:13ace1464e7b3db9054d2b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const TOPIC_NAME = 'mamas-kaffee-123-geheim'; 

// KEY AUS DB
let GEMINI_API_KEY = null;
onValue(ref(db, 'geminiKey'), (snapshot) => { GEMINI_API_KEY = snapshot.val(); });

// AUTH
let currentUser = null;
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const footerName = document.getElementById('footer-user-name');
        if(footerName) footerName.innerText = user.displayName;

        if(typeof monitorMyOrder === "function") monitorMyOrder();
        listenToFavorites();
        monitorStampCard();
    } else {
        if (!window.location.href.includes("login.html") && !window.location.href.includes("index.html")) {
             window.location.href = "index.html"; 
        }
    }
});

window.logout = function() {
    signOut(auth).then(() => window.location.href = "login.html");
}

// ELEMENTE
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const statusDot = document.querySelector('.status-dot');
const container = document.getElementById('menu-container');
const orderModal = document.getElementById('order-modal');
const confirmModal = document.getElementById('confirmation-modal');
const closedMessageBox = document.getElementById('closed-message-box');

let currentCoffee = null;
let isShopOpen = true; 

// STATUS CHECK
const statusRef = ref(db, 'status');
onValue(statusRef, (snapshot) => {
    const data = snapshot.val(); 
    const statusStr = data ? String(data).toLowerCase() : "an";
    if (statusStr.includes('aus') || statusStr.includes('zu') || statusStr.includes('closed')) {
        setShopClosed();
    } else {
        setShopOpen();
    }
});

function setShopOpen() {
    isShopOpen = true;
    if(statusBadge) {
        statusBadge.className = 'status-badge status-open';
        statusText.innerText = 'Barista ist bereit';
        statusDot.className = 'status-dot dot-green';
    }
    if(container) container.classList.remove('shop-closed-mode');
    if(closedMessageBox) closedMessageBox.style.display = 'none';
}

function setShopClosed() {
    isShopOpen = false;
    if(statusBadge) {
        statusBadge.className = 'status-badge status-closed';
        statusText.innerText = 'Kaffeebar geschlossen';
        statusDot.className = 'status-dot dot-red';
    }
    if(container) container.classList.add('shop-closed-mode');
    if(closedMessageBox) closedMessageBox.style.display = 'block';
}

// --- MASCHINEN DATEN ---
const maschinenDaten = {
    "Kaffee": { stufen: true, ml_kaffee: [90, 120, 150, 180, 210, 220], cycles: true },
    "Café Crema": { stufen: true, ml_kaffee: [90, 120, 150, 180, 210, 220], cycles: true },
    "Latte Macchiato": { stufen: true, ml_kaffee: [20, 30, 40, 60, 80], ml_milch: [80, 140, 200, 270, 340], cycles: false },
    "Cappuccino": { stufen: true, ml_kaffee: [20, 30, 40, 60, 80], ml_milch: [90, 120, 150, 180, 210], cycles: false },
    "Americano": { stufen: true, ml_kaffee: [80, 100, 120, 160, 200], cycles: true },
    "Espresso Lungo": { stufen: true, ml_kaffee: [80, 100, 120, 160, 200], cycles: true },
    "Espresso": { stufen: true, ml_kaffee: [30, 40, 50], cycles: true },
    "Milchkaffee": { stufen: true, ml_kaffee: [50, 70, 90, 120, 150], ml_milch: [50, 70, 90, 120, 150], cycles: false },
    "Matcha": { stufen: false, ml_gesamt: [200, 250, 300, 350, 400, 450, 500], cycles: false },
    // HOLY EISTEE CONFIG: Keine Stufen, ML in 50er Schritten
    "Holy": { stufen: false, ml_gesamt: [300, 350, 400, 450, 500, 550, 600, 650, 700], cycles: false },
    "default": { stufen: false, cycles: false }
};

const kaffeeSorten = [
    { name: "Kaffee", configKey: "Kaffee", strength: 3, desc: "Der zeitlose Klassiker." },
    { name: "Café Crema", configKey: "Café Crema", strength: 3, desc: "Langer Genuss mit Crema-Krone." },
    { name: "Espresso Lungo", configKey: "Espresso Lungo", strength: 4, desc: "Verlängertes Aromawunder." },
    { name: "Espresso", configKey: "Espresso", strength: 5, desc: "Der kleine Starke." },
    { name: "Latte Macchiato", configKey: "Latte Macchiato", strength: 2, desc: "Viel heiße Milch & Espresso mit Milchschaum." },
    { name: "Milchkaffee", configKey: "Milchkaffee", strength: 2, desc: "Halb Kaffee, halb Milch." },
    { name: "Cappuccino", configKey: "Cappuccino", strength: 3, desc: "Klassiker mit Milchschaumhaube." },
    { name: "Americano", configKey: "Americano", strength: 3, desc: "Espresso mit Wasser verlängert." },
    { name: "Iced Matcha Latte", configKey: "Matcha", strength: 0, desc: "Grüner Tee auf Eis & Milch." },
    { name: "Iced Protein Matcha", configKey: "Matcha", strength: 0, desc: "Matcha Latte mit Protein-Kick." },
    { name: "Holy Eistee", configKey: "Holy", strength: 0, desc: "Fruchtig & zuckerfrei. Der Energy-Kick." }, // NEU
    { name: "Flat White", configKey: "default", strength: 4, desc: "Doppelter Ristretto mit Mikroschaum." },
    { name: "Iced Coffee", configKey: "default", strength: 3, desc: "Frisch gebrüht auf Eis." },
    { name: "Iced Latte", configKey: "default", strength: 2, desc: "Espresso auf kalter Milch & Eis." },
    { name: "Milchschaum", configKey: "default", strength: 0, desc: "Purer warmer Milchschaum." },
    { name: "Heißes Wasser", configKey: "default", strength: 0, desc: "Für Tee." },
    { name: "To-Go-Becher", configKey: "default", strength: 0, desc: "Für unterwegs." }
];

// --- MODAL ÖFFNEN ---
window.openOrderModal = function(sorteName) {
    const sorte = kaffeeSorten.find(k => k.name === sorteName);
    if(!sorte || !isShopOpen) return;

    currentCoffee = sorte;
    const modal = document.getElementById('order-modal');
    const title = document.getElementById('modal-coffee-title');
    const customContainer = document.getElementById('custom-options');

    title.innerText = sorte.name;
    customContainer.innerHTML = "";

    const config = maschinenDaten[sorte.configKey] || maschinenDaten['default'];

    // 1. STÄRKE SLIDER (Nur wenn konfiguriert)
    if (config.stufen) {
        customContainer.innerHTML += `
            <div class="form-group">
                <label class="form-label">Intensität: <span id="strength-val" class="range-value">3</span></label>
                <input type="range" id="input-strength" min="1" max="6" value="3" oninput="document.getElementById('strength-val').innerText=this.value">
            </div>`;
    }
    
    // 2. SPEZIAL: HOLY EISTEE SORTEN WAHL
    if (sorte.name === "Holy Eistee") {
        customContainer.innerHTML += `
            <div class="form-group">
                <label class="form-label">Sorte</label>
                <select id="input-holy-flavor" class="modal-select" onchange="updateVisualsFromInputs()">
                    <option value="lemon">Lemon x Honey x Black Tea 🍋</option>
                    <option value="lime">Lime x Matcha x Mint 🍏</option>
                    <option value="mango">Mango x Passion Fruit 🥭</option>
                </select>
            </div>
        `;
    }

    // 3. MENGEN REGLER
    if (config.ml_kaffee) customContainer.innerHTML += createSelect('input-coffee-vol', 'Kaffeemenge', config.ml_kaffee, ' ml');
    if (config.ml_milch) customContainer.innerHTML += createSelect('input-milk-vol', 'Milchmenge', config.ml_milch, ' ml');
    if (config.ml_gesamt) customContainer.innerHTML += createSelect('input-total-vol', 'Größe', config.ml_gesamt, ' ml');
    
    // 4. CYCLES (Mahlvorgang)
    if (config.cycles) {
        customContainer.innerHTML += `
            <div class="form-group">
                <label class="form-label">Mahlvorgang</label>
                <div class="radio-group">
                    <input type="radio" id="cycle1" name="cycles" value="1x" checked>
                    <label for="cycle1" class="radio-label">1x</label>
                    <input type="radio" id="cycle2" name="cycles" value="2x">
                    <label for="cycle2" class="radio-label">2x</label>
                </div>
            </div>`;
    }

    // --- EXTRAS LOGIK ---
    let extrasHtml = "";
    
    // HOLY EISTEE: NUR EIS
    if (sorte.name === "Holy Eistee") {
        extrasHtml = `<label class="checkbox-item"><input type="checkbox" id="extra-ice" onchange="updateVisualsFromInputs()"> mit Eiswürfeln 🧊</label>`;
    } 
    // MATCHA / ICED: EIS STATT SHOT
    else if (sorte.name.includes("Matcha") || sorte.name.includes("Iced")) {
        extrasHtml = `
            <label class="checkbox-item"><input type="checkbox" id="extra-vanilla" onchange="updateVisualsFromInputs()"> mit Vanille Sirup</label>
            <label class="checkbox-item"><input type="checkbox" id="extra-sweetener" onchange="updateVisualsFromInputs()"> mit Süßstoff</label>
            <label class="checkbox-item"><input type="checkbox" id="extra-ice" onchange="updateVisualsFromInputs()"> mit Eiswürfeln 🧊</label>
        `;
    } 
    // STANDARD KAFFEE: ALLES
    else {
        extrasHtml = `
            <label class="checkbox-item"><input type="checkbox" id="extra-vanilla" onchange="updateVisualsFromInputs()"> mit Vanille Sirup</label>
            <label class="checkbox-item"><input type="checkbox" id="extra-sweetener" onchange="updateVisualsFromInputs()"> mit Süßstoff</label>
            <label class="checkbox-item"><input type="checkbox" id="extra-shot" onchange="updateVisualsFromInputs()"> Extra Shot</label>
        `;
    }

    // KOMMENTARFELD & EXTRAS RENDERN
    customContainer.innerHTML += `
        <div class="form-group">
            <label class="form-label">Sonderwunsch / Ort</label>
            <input type="text" id="order-comment" class="modal-input" placeholder="z.B. Im Garten, ohne Keks..." autocomplete="off">
        </div>
        <div class="form-group" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(212, 180, 131, 0.3);">
            <label class="form-label">Extras</label>
            <div class="checkbox-group">
                ${extrasHtml}
            </div>
        </div>`;
    
    modal.style.display = 'flex';
    modal.classList.add('show');

    if (typeof updateVisualsFromInputs === 'function') {
        updateVisualsFromInputs();
    }
}

// 🧪 INPUT UPDATE FUNKTION
window.updateVisualsFromInputs = function() {
    const currentName = document.getElementById('modal-coffee-title').innerText;
    
    const coffeeSelect = document.getElementById('input-coffee-vol');
    const milkSelect = document.getElementById('input-milk-vol');
    const totalSelect = document.getElementById('input-total-vol'); 
    
    const holySelect = document.getElementById('input-holy-flavor'); // NEU

    const shotCheckbox = document.getElementById('extra-shot');
    const iceCheckbox = document.getElementById('extra-ice');
    const vanillaCheckbox = document.getElementById('extra-vanilla');
    const sweetCheckbox = document.getElementById('extra-sweetener');

    let coffeeMl = coffeeSelect ? parseInt(coffeeSelect.value) : 0;
    let milkMl = milkSelect ? parseInt(milkSelect.value) : 0;
    
    // Logik für Gesamt-Volumen
    if (totalSelect && totalSelect.value) {
        const val = parseInt(totalSelect.value);
        if (currentName.includes("Matcha")) {
            coffeeMl = val * 0.20; 
            milkMl = val * 0.80;   
        } else if (currentName === "Holy Eistee") {
            // Bei Holy ist alles "Kaffee" (die Flüssigkeit), keine Milch
            coffeeMl = val;
            milkMl = 0;
        } else {
            coffeeMl = val; 
        }
    }

    let extras = [];
    if(shotCheckbox && shotCheckbox.checked) extras.push("Extra Shot");
    if(vanillaCheckbox && vanillaCheckbox.checked) extras.push("Vanille");
    if(sweetCheckbox && sweetCheckbox.checked) extras.push("Süßstoff");
    
    // Holy Flavor auslesen
    let holyFlavor = null;
    if (holySelect) {
        holyFlavor = holySelect.value;
        // Optional: Den Flavor auch zu den Extras packen für die Bestellung
        const flavorName = holySelect.options[holySelect.selectedIndex].text;
        extras.push(flavorName); // Damit es auf dem Bon steht
    }

    let hasIce = false;
    if(iceCheckbox && iceCheckbox.checked) {
        extras.push("Mit Eis");
        hasIce = true;
    }

    updateCoffeeVisuals(currentName, extras, coffeeMl, milkMl, hasIce, holyFlavor);
}

window.closeOrderModal = function() { 
    const modal = document.getElementById('order-modal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}
window.closeConfirmModal = function() { 
    confirmModal.style.display = 'none'; 
}

// --- VISUAL COFFEE LAB LOGIK 🧪 (V7 - HOLY EISTEE FARBEN 🍹) ---
const coffeeRecipes = {
    "Espresso":         { foam: 10,  esp: 30,  wat: 0,  milk: 0 },
    "Doppelter Espresso": { foam: 10, esp: 60,  wat: 0,  milk: 0 },
    "Espresso Lungo":   { foam: 5,   esp: 40,  wat: 10, milk: 0 },
    "Cappuccino":       { foam: 35,  esp: 25,  wat: 0,  milk: 30 }, 
    "Latte Macchiato":  { foam: 25,  esp: 15,  wat: 0,  milk: 55 }, 
    "Milchkaffee":      { foam: 10,  esp: 20,  wat: 0,  milk: 60 }, 
    "Flat White":       { foam: 5,   esp: 35,  wat: 0,  milk: 55 }, 
    "Americano":        { foam: 0,   esp: 25,  wat: 65, milk: 0 },
    "Kaffee":           { foam: 5,   esp: 85,  wat: 0,  milk: 0 },
    "Iced Latte":       { foam: 10,  esp: 20,  wat: 0,  milk: 60 },
    "default":          { foam: 0,   esp: 50,  wat: 0,  milk: 0 }
};

function updateCoffeeVisuals(productName, extras = [], overrideCoffeeMl = 0, overrideMilkMl = 0, hasIce = false, holyFlavor = null) {
    const glass = document.querySelector('.glass-cup');
    const espLayer = document.getElementById('layer-espresso'); 
    if(!glass || !espLayer) return;

    let recipe = coffeeRecipes[productName] || coffeeRecipes["default"];
    let currentRecipe = { ...recipe };

    // --- ABSOLUTE BERECHNUNG ---
    const MAX_GLASS_CAPACITY = 350; 

    if (overrideCoffeeMl > 0 || overrideMilkMl > 0) {
        // Bei Holy Eistee kann das Volumen sehr groß sein (700ml),
        // wir cappen es visuell bei 100%, sonst sprengt es das Glas.
        let espHeight = (overrideCoffeeMl / MAX_GLASS_CAPACITY) * 100;
        if(espHeight > 95) espHeight = 95; // Rand lassen

        currentRecipe.esp = espHeight;
        currentRecipe.milk = (overrideMilkMl / MAX_GLASS_CAPACITY) * 100;
        currentRecipe.wat = 0; 
    }

    if (extras.includes("Extra Shot")) {
        currentRecipe.esp += 8; 
    }

    // --- FARB-LOGIK (Matcha & Holy) ---
    if (productName.includes("Matcha")) {
        espLayer.style.background = "linear-gradient(to right, #a4c639, #6b8c21)";
    } 
    else if (productName === "Holy Eistee") {
        // Farben je nach Sorte
        if (holyFlavor === 'lemon') {
            espLayer.style.background = "linear-gradient(to right, #8B4513, #CD853F)"; // Schwarztee Braun
        } else if (holyFlavor === 'lime') {
            espLayer.style.background = "linear-gradient(to right, #98FF98, #32CD32)"; // Giftgrün/Hellgrün
        } else if (holyFlavor === 'mango') {
            espLayer.style.background = "linear-gradient(to right, #FFD700, #FF8C00)"; // Orange/Gold
        } else {
            // Default Fallback
            espLayer.style.background = "linear-gradient(to right, #FFD700, #FF8C00)";
        }
    }
    else {
        espLayer.style.background = ""; // Standard Braun zurücksetzen
    }

    // Rendering
    renderAddons(hasIce, extras);

    document.getElementById('layer-foam').style.height = currentRecipe.foam + '%';
    document.getElementById('layer-espresso').style.height = currentRecipe.esp + '%';
    document.getElementById('layer-water').style.height = currentRecipe.wat + '%';
    document.getElementById('layer-milk').style.height = currentRecipe.milk + '%';

    if (productName.includes("Iced") || productName === "Holy Eistee") {
        glass.classList.remove('hot');
    } else {
        glass.classList.add('hot');
    }
}

// 🧪 RENDER FUNKTION FÜR ALLE EXTRAS
function renderAddons(hasIce, extras) {
    const glass = document.querySelector('.glass-cup');
    if(!glass) return;

    const toRemove = glass.querySelectorAll('.ice-cube, .syrup-drop, .sweetener-pill');
    toRemove.forEach(el => el.remove());

    if(hasIce) {
        for(let i=1; i<=3; i++) {
            const ice = document.createElement('div');
            ice.className = `ice-cube ice-${i}`;
            ice.style.setProperty('--rot', (Math.random() * 20 - 10) + 'deg');
            glass.appendChild(ice);
        }
    }

    if(extras.includes("Vanille")) {
        const drop = document.createElement('div');
        drop.className = 'syrup-drop';
        glass.appendChild(drop);
    }

    if(extras.includes("Süßstoff")) {
        const pill = document.createElement('div');
        pill.className = 'sweetener-pill';
        glass.appendChild(pill);
    }
}

// --- DAMPF ---
function createSteamEffect() {
    const btn = document.querySelector('#order-modal .modal-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const topY = rect.top;
    for (let i = 0; i < 20; i++) {
        const steam = document.createElement('div');
        steam.classList.add('steam-particle');
        const randomX = (Math.random() - 0.5) * 60;
        const size = Math.random() * 20 + 10;
        const delay = Math.random() * 0.5;
        steam.style.left = `${centerX + randomX}px`;
        steam.style.top = `${topY}px`;
        steam.style.width = `${size}px`;
        steam.style.height = `${size}px`;
        steam.style.animationDelay = `${delay}s`;
        document.body.appendChild(steam);
        setTimeout(() => steam.remove(), 2000);
    }
}

// --- SCHNEE ---
function letItSnow() {
    const container = document.getElementById('snow-container');
    if(!container) return;
    const numberOfFlakes = 50;
    for (let i = 0; i < numberOfFlakes; i++) {
        const flake = document.createElement('div');
        flake.classList.add('snowflake');
        const xPos = Math.random() * 100;
        const size = Math.random() * 5 + 2;
        const duration = Math.random() * 5 + 3;
        const delay = Math.random() * 5;
        const opacity = Math.random() * 0.5 + 0.3;
        flake.style.left = `${xPos}vw`;
        flake.style.width = `${size}px`;
        flake.style.height = `${size}px`;
        flake.style.animationDuration = `${duration}s`;
        flake.style.animationDelay = `-${delay}s`;
        flake.style.opacity = opacity;
        container.appendChild(flake);
    }
}
letItSnow();

// --- SEND ORDER ---
window.sendOrder = function() {
    createSteamEffect();
    try {
        const sound = new Audio('assets/audio/grinding.mp3');
        sound.volume = 0.6;
        sound.play();
    } catch (e) {}

    // 1. PREISE VORBEREITEN
    const starbucksPreise = { 
        "Kaffee": 3.50, 
        "Café Crema": 3.90, 
        "Latte Macchiato": 4.50, 
        "Milchkaffee": 4.20, 
        "Cappuccino": 4.20, 
        "Espresso": 2.90, 
        "Espresso Lungo": 3.20, 
        "Americano": 3.50, 
        "Flat White": 4.50, 
        "Iced Matcha Latte": 5.50, 
        "Iced Protein Matcha": 5.90, 
        "Holy Eistee": 4.90, // NEU
        "Iced Coffee": 3.90, 
        "Iced Latte": 4.50 
    };

    const rawPrice = starbucksPreise[currentCoffee.name] !== undefined ? starbucksPreise[currentCoffee.name] : 4.00;
    const formattedPrice = rawPrice.toFixed(2) + "€";

    const userName = currentUser ? currentUser.displayName : "Gast";
    const commentInput = document.getElementById('order-comment');
    const comment = commentInput ? commentInput.value.trim() : "";
    const statusDiv = document.getElementById('status');
    const sendBtn = document.querySelector('#order-modal .modal-btn');

    let details = [];
    const strengthEl = document.getElementById('input-strength');
    if(strengthEl) details.push(`Stärke ${strengthEl.value}`);
    const coffeeVolEl = document.getElementById('input-coffee-vol');
    if(coffeeVolEl) details.push(`${coffeeVolEl.value}ml Kaffee`);
    const milkVolEl = document.getElementById('input-milk-vol');
    if(milkVolEl) details.push(`${milkVolEl.value}ml Milch`);
    const totalVolEl = document.getElementById('input-total-vol');
    if(totalVolEl) details.push(`${totalVolEl.value}ml`);
    const cyclesEl = document.querySelector('input[name="cycles"]:checked');
    if(cyclesEl) details.push(cyclesEl.value);
    
    // Extras
    const vanillaEl = document.getElementById('extra-vanilla');
    if(vanillaEl && vanillaEl.checked) details.push("Vanille Sirup");
    const sweetEl = document.getElementById('extra-sweetener');
    if(sweetEl && sweetEl.checked) details.push("Süßstoff");
    const shotEl = document.getElementById('extra-shot');
    if(shotEl && shotEl.checked) details.push("Extra Shot");
    const iceEl = document.getElementById('extra-ice');
    if(iceEl && iceEl.checked) details.push("Mit Eiswürfeln");

    // Holy Flavor auslesen für den Bon/Details
    const holySelect = document.getElementById('input-holy-flavor');
    if (holySelect) {
        details.push(holySelect.options[holySelect.selectedIndex].text);
    }

    let detailString = details.length > 0 ? ` (${details.join(', ')})` : "";
    let messageBody = `${userName} möchte: ${currentCoffee.name}${detailString}`;
    if(comment) messageBody += `\n💬 "${comment}"`;

    if(sendBtn) sendBtn.innerText = "Sende...";

    // 2. FIREBASE SAVE
    push(ref(db, 'orders'), {
        user: userName,
        coffee: currentCoffee.name,
        details: details,
        comment: comment,
        timestamp: Date.now(),
        dateString: new Date().toLocaleString()
    });

    // 3. HISTORY SAVE
    if (currentUser) {
        push(ref(db, `users/${currentUser.uid}/history`), {
            product: currentCoffee.name,
            timestamp: Date.now(),
            saved: rawPrice 
        });
    }

    // 4. STEMPEL UPDATE
    const countRef = ref(db, `users/${currentUser.uid}/coffeeCount`);
    runTransaction(countRef, (currentCount) => {
        return (currentCount || 0) + 1;
    }).then((result) => {
        const newCount = result.snapshot.val();
        if (newCount > 0 && newCount % 10 === 0) {
            triggerConfetti();
            setTimeout(() => {
                const rewardModal = document.getElementById('reward-modal');
                if(rewardModal) rewardModal.style.display = 'flex';
                try { new Audio('assets/audio/ding.mp3').play(); } catch(e){}
            }, 500);
        }
    });

    // 5. RECEIPT ANZEIGE
    fetch(`https://ntfy.sh/${TOPIC_NAME}`, {
        method: 'POST',
        body: messageBody, 
        headers: { 'Title': 'Neue Bestellung', 'Priority': 'high', 'Tags': 'coffee' }
    })
    .then(response => {
        if (response.ok) {
            const modal = document.getElementById('order-modal');
            modal.style.display = 'none'; 
            modal.classList.remove('show');

            // --- RECEIPT DATEN FÜLLEN ---
            document.getElementById('receipt-item-name').innerText = currentCoffee.name;
            document.getElementById('receipt-date').innerText = new Date().toLocaleString();
            document.getElementById('receipt-id').innerText = Math.floor(Math.random() * 8999 + 1000);
            document.getElementById('receipt-price').innerText = formattedPrice;
            document.getElementById('receipt-stamp').classList.remove('visible');

            // Extras auflisten
            const extrasContainer = document.getElementById('receipt-extras-container');
            if(extrasContainer) {
                extrasContainer.innerHTML = "";
                details.forEach(extra => {
                    const row = document.createElement('div');
                    row.className = 'receipt-row';
                    row.style.fontSize = '0.85rem';
                    row.style.color = '#666';
                    row.innerHTML = `<span>+ ${extra}</span><span>0.00€</span>`;
                    extrasContainer.appendChild(row);
                });
            }

            const savedEl = document.getElementById('receipt-saved');
            if (savedEl) savedEl.innerText = "-" + formattedPrice;

            const receiptModal = document.getElementById('receipt-modal');
            if(receiptModal) receiptModal.style.display = 'flex';

            if(sendBtn) sendBtn.innerText = "Bestellen";
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

        } else { throw new Error('Send Error'); }
    })
    .catch(error => {
        if(sendBtn) sendBtn.innerText = "Bestellen";
        if(statusDiv) {
            statusDiv.style.display = 'block';
            statusDiv.innerText = `❌ Fehler: ${error.message}`;
            setTimeout(() => statusDiv.style.display = 'none', 6000);
        }
    });
}

// --- LIVE STATUS MONITORING ---
let lastStatus = "";

function monitorMyOrder() {
    const ordersRef = ref(db, 'orders');
    onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        const card = document.getElementById('live-status-card');
        
        if (!data || !currentUser) {
            if(card) card.style.display = 'none';
            return;
        }

        const myOrders = Object.values(data).filter(o => o.user === currentUser.displayName);
        const activeOrder = myOrders.filter(o => o.status !== 'archived').sort((a, b) => b.timestamp - a.timestamp)[0];

        if (!activeOrder) {
            if(card) card.style.display = 'none';
            lastStatus = "";
            return;
        }

        if(card) card.style.display = 'block';
        updateStatusCard(activeOrder.status || 'new', activeOrder.coffee);
    });
}

function updateStatusCard(status, coffeeName) {
    const card = document.getElementById('live-status-card');
    const icon = document.getElementById('ls-icon');
    const title = document.getElementById('ls-title');
    const desc = document.getElementById('ls-desc');
    const progressBar = document.getElementById('timeline-bar');

    if(!card) return;

    ['new', 'preparing', 'brewing', 'ready'].forEach(s => {
        const el = document.getElementById(`step-${s}`);
        if(el) el.className = 'timeline-step'; 
    });

    const setStep = (id, state) => { 
        const el = document.getElementById(`step-${id}`);
        if(el) el.classList.add(state);
    };

    if (status === 'new') {
        card.style.display = 'block';
        if(title) title.innerText = "Bestellung eingegangen";
        if(desc) desc.innerText = `${coffeeName} wartet in der Schlange.`;
        if(icon) icon.innerText = "📝";
        if(progressBar) progressBar.style.width = "15%";
        setStep('new', 'active');
        setStep('new', 'pulse');
    } 
    else if (status === 'preparing') {
        card.style.display = 'block';
        if(title) title.innerText = "Wird zubereitet";
        if(desc) desc.innerText = "Bohnen werden gemahlen & Wasser heizt auf.";
        if(icon) icon.innerText = "⚙️";
        if(progressBar) progressBar.style.width = "50%";
        setStep('new', 'done');
        setStep('preparing', 'active');
        setStep('preparing', 'pulse');
    }
    else if (status === 'ready') {
        card.style.display = 'block';
        if(title) title.innerText = "Abholbereit!";
        if(desc) desc.innerText = `Dein ${coffeeName} steht am Tresen.`;
        if(icon) icon.innerText = "✅";
        if(progressBar) progressBar.style.width = "100%";
        setStep('new', 'done');
        setStep('preparing', 'done');
        setStep('brewing', 'done');
        setStep('ready', 'active');
        setStep('ready', 'pulse');

        if (lastStatus !== 'ready') {
            try {
                const audio = new Audio('assets/audio/ding.mp3');
                audio.play();
                if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } catch(e) {}
        }
    } 
    else {
        card.style.display = 'none';
    }
    lastStatus = status;
}

// --- FAVORITEN ---
let myFavorites = {};
function listenToFavorites() {
    if (!currentUser) return;
    const favRef = ref(db, `users/${currentUser.uid}/favorites`);
    onValue(favRef, (snapshot) => {
        myFavorites = snapshot.val() || {};
        renderAllCards();
    });
}

window.toggleFavorite = function(coffeeName, event) {
    event.stopPropagation(); 
    if (!currentUser) { alert("Bitte einloggen!"); return; }
    const favRef = ref(db, `users/${currentUser.uid}/favorites/${coffeeName}`);
    if (myFavorites[coffeeName]) remove(favRef);
    else set(favRef, true);
}

// --- RENDER CARDS ---
function renderAllCards() {
    const menuContainer = document.getElementById('menu-container');
    const favContainer = document.getElementById('fav-container');
    const favSection = document.getElementById('fav-section');

    if(!menuContainer || !favContainer || !favSection) return;

    menuContainer.innerHTML = "";
    favContainer.innerHTML = "";
    let hasFavorites = false;

    kaffeeSorten.forEach(sorte => {
        const isFav = myFavorites[sorte.name] ? true : false;
        const cardHtml = buildCardHTML(sorte, isFav);
        
        const normalCard = document.createElement('div');
        normalCard.className = 'coffee-card scroll-reveal'; 
        normalCard.onclick = () => window.openOrderModal(sorte.name);
        normalCard.innerHTML = cardHtml;
        menuContainer.appendChild(normalCard);

        if (isFav) {
            hasFavorites = true;
            const favCard = document.createElement('div');
            favCard.className = 'coffee-card scroll-reveal'; 
            favCard.onclick = () => window.openOrderModal(sorte.name);
            favCard.innerHTML = cardHtml;
            favContainer.appendChild(favCard);
        }
    });

    favSection.style.display = hasFavorites ? 'block' : 'none';
    setTimeout(initTiltEffect, 100);
    setTimeout(initScrollReveal, 50);
}

function buildCardHTML(sorte, isFav) {
    let dots = "";
    if(sorte.strength > 0) {
        dots = '<span class="dots">';
        for(let i=1; i<=5; i++) dots += i<=sorte.strength ? '<span class="dot-filled">•</span>' : '<span class="dot-empty">•</span>';
        dots += '</span>';
        dots = `<div class="strength-container">STÄRKE ${dots}</div>`;
    }
    const heartClass = isFav ? "fav-btn fav-active" : "fav-btn";
    const heartIcon = isFav ? "❤️" : "🤍"; 
    return `
        <div class="${heartClass}" onclick="window.toggleFavorite('${sorte.name}', event)">${heartIcon}</div>
        <div class="name">${sorte.name}</div>
        <div class="desc">${sorte.desc}</div>
        ${dots}
    `;
}

function createSelect(id, label, options, suffix) {
    let html = `<div class="form-group"><label class="form-label">${label}</label>`;
    html += `<select id="${id}" class="modal-select" onchange="updateVisualsFromInputs()">`; 
    options.forEach(opt => html += `<option value="${opt}">${opt}${suffix}</option>`);
    html += `</select></div>`;
    return html;
}

// --- ADMIN ---
window.checkAdminAccess = function() {
    const password = prompt("🔒 Admin-Bereich\nBitte Passwort eingeben:");
    if (password === "09052023") { 
        window.location.href = "admin.html";
    } else if (password !== null) {
        alert("Zugang verweigert! Zugriff nur für Admin. ⛔");
    }
}

// --- INFO MODAL ---
window.openMatchaInfo = function() {
    const modal = document.getElementById('info-modal');
    if(modal) modal.style.display = 'flex';
}
window.closeInfoModal = function() {
    const modal = document.getElementById('info-modal');
    if(modal) modal.style.display = 'none';
}

// --- TILT ---
function initTiltEffect() {
    const cards = document.querySelectorAll('.coffee-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', handleHover);
        card.addEventListener('mouseleave', resetCard);
    });
}
function handleHover(e) {
    const card = this;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const rect = card.getBoundingClientRect();
    const mouseX = (e.clientX || e.touches[0].clientX) - rect.left;
    const mouseY = (e.clientY || e.touches[0].clientY) - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    const rotateX = yPct * -20; 
    const rotateY = xPct * 20;  
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
}
function resetCard() {
    this.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
}

// --- SCROLL REVEAL ---
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// --- STEMPELKARTE ---
function monitorStampCard() {
    if (!currentUser) return;
    const countRef = ref(db, `users/${currentUser.uid}/coffeeCount`);
    onValue(countRef, (snapshot) => {
        const totalCount = snapshot.val() || 0;
        renderStampCard(totalCount);
    });
}
function renderStampCard(totalCount) {
    const grid = document.getElementById('stamp-grid');
    const counterText = document.getElementById('stamp-counter');
    const msgText = document.getElementById('stamp-message');
    if(!grid) return; 

    const currentStamps = totalCount % 10;
    const remaining = 10 - currentStamps;
    if(counterText) counterText.innerText = `${currentStamps} / 10`;
    
    if (currentStamps === 0 && totalCount > 0) {
        if(msgText) msgText.innerText = "Neue Karte, neues Glück! 🍀";
    } else if (remaining === 0) {
        if(msgText) msgText.innerHTML = "<b>VOLL!</b> Dein nächster Kaffee bringt einen Keks! 🍪";
    } else {
        if(msgText) msgText.innerText = `Noch ${remaining} Kaffees bis zum Gratis-Keks! 🍪`;
    }

    grid.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const circle = document.createElement('div');
        circle.className = 'stamp-circle';
        if (i <= currentStamps) {
            circle.classList.add('active');
            circle.innerText = "☕"; 
        } else {
            circle.innerText = i;
        }
        grid.appendChild(circle);
    }
}

// --- KONFETTI ---
function triggerConfetti() {
    const colors = ['#d4b483', '#f2d74e', '#ffffff', '#e74c3c'];
    for (let i = 0; i < 100; i++) {
        const conf = document.createElement('div');
        conf.classList.add('confetti');
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.animationDuration = (Math.random() * 3 + 2) + 's'; 
        document.body.appendChild(conf);
        setTimeout(() => conf.remove(), 5000);
    }
}
window.closeRewardModal = function() {
    const modal = document.getElementById('reward-modal');
    if(modal) modal.style.display = 'none';
}

// --- VIBRATION ---
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('a') || e.target.closest('.coffee-card')) {
        if (navigator.vibrate) navigator.vibrate(10);
    }
});

// --- TRINKGELD ---
let coinsInGlass = 0; 
window.giveTip = function() {
    const audio = document.getElementById('kaching-sound');
    if(audio) {
        audio.currentTime = 0; 
        audio.play().catch(e => console.log("Audio play error", e));
    }
    createCoin();
    if(navigator.vibrate) navigator.vibrate([50]);
    const tipRef = ref(db, 'stats/totalTips');
    runTransaction(tipRef, (currentTips) => {
        return (currentTips || 0) + 1; 
    });
}
function createCoin() {
    const glass = document.getElementById('tip-glass');
    if(!glass) return;
    const coin = document.createElement('div');
    coin.classList.add('dropped-coin');
    const randomLeft = Math.floor(Math.random() * 35) + 5;
    let targetBottom = (coinsInGlass * 4); 
    if(targetBottom > 70) targetBottom = Math.random() * 60; 
    const targetTop = 66 - targetBottom;
    const randomRot = Math.floor(Math.random() * 360) + "deg";
    coin.style.left = randomLeft + 'px';
    coin.style.setProperty('--target-top', targetTop + 'px');
    coin.style.setProperty('--rot', randomRot);
    glass.appendChild(coin);
    coinsInGlass++;
}

// --- GLÜCKSRAD ---
document.addEventListener('DOMContentLoaded', checkDailySpin);
function checkDailySpin() {
    const lastSpin = localStorage.getItem('lastSpinDate');
    const today = new Date().toDateString(); 
    if (lastSpin !== today) {
        const btn = document.getElementById('daily-spin-card');
        if(btn) btn.style.display = "block"; 
    }
}
window.openWheel = function() {
    const wheel = document.getElementById('wheel-modal');
    if(wheel) wheel.classList.add('open');
}
window.closeWheel = function() {
    const wheel = document.getElementById('wheel-modal');
    if(wheel) wheel.classList.remove('open');
}
window.spinTheWheel = function() {
    const wheel = document.getElementById('lucky-wheel');
    const btn = document.getElementById('spin-btn');
    const resultDiv = document.getElementById('win-display');
    btn.disabled = true;
    btn.innerText = "Dreht...";
    resultDiv.innerText = "";
    const randomDeg = Math.floor(Math.random() * 360);
    const totalSpin = 1800 + randomDeg; 
    wheel.style.transform = `rotate(${totalSpin}deg)`;
    setTimeout(() => {
        calculatePrize(randomDeg);
        btn.innerText = "Morgen wieder!";
        const audio = document.getElementById('kaching-sound');
        if(audio) audio.play();
        localStorage.setItem('lastSpinDate', new Date().toDateString());
        const mainBtn = document.getElementById('daily-spin-card');
        if(mainBtn) mainBtn.style.display = 'none';
    }, 4000); 
}
function calculatePrize(deg) {
    const actualDeg = deg % 360;
    let prize = "";
    if (actualDeg >= 0 && actualDeg < 90) prize = "☕ GEWONNEN: Doppelte Punkte für Treuekarte!";
    else if (actualDeg >= 90 && actualDeg < 180) prize = "🃏 JOKER: Gratis Kaffee deiner Wahl!";
    else if (actualDeg >= 180 && actualDeg < 270) prize = "🫂 NIETE: Umarmung für Timo";
    else prize = "🍪 GEWONNEN: Gratis Keks!";
    const resultDiv = document.getElementById('win-display');
    resultDiv.innerHTML = prize;
}

// --- HISTORY & OLD RECEIPT ---
window.openOrderHistory = function() {
    if (!currentUser) { alert("Bitte einloggen!"); return; }

    const histModal = document.getElementById('history-modal');
    const listContainer = document.getElementById('history-list');
    
    // Menü schließen
    const menu = document.getElementById('main-dropdown');
    if(menu) menu.classList.remove('show');
    
    histModal.style.display = 'flex';
    listContainer.innerHTML = '<div style="text-align:center; padding:20px;">Lade Daten... ⏳</div>';

    const ordersRef = ref(db, 'orders');
    onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        listContainer.innerHTML = ""; 

        if (!data) {
            listContainer.innerHTML = '<div style="text-align:center; color:#888;">Keine Bestellungen gefunden.</div>';
            return;
        }

        const myOrders = Object.values(data)
            .filter(o => o.user === currentUser.displayName)
            .sort((a, b) => b.timestamp - a.timestamp);

        if (myOrders.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:#888;">Du hast noch nichts bestellt.</div>';
            return;
        }

        myOrders.forEach(order => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.onclick = () => (order);
            item.innerHTML = `
                <div>
                    <div class="hist-main">${order.coffee}</div>
                    <div class="hist-date">${order.dateString || "Datum unbekannt"}</div>
                </div>
                <div class="hist-arrow">🧾</div>
            `;
            listContainer.appendChild(item);
        });
    }, { onlyOnce: true }); 
}

window.closeHistoryModal = function() {
    document.getElementById('history-modal').style.display = 'none';
}

function showOldReceipt(order) {
    const starbucksPreise = { 
        "Kaffee": 3.50, "Café Crema": 3.90, "Latte Macchiato": 4.50, 
        "Milchkaffee": 4.20, "Cappuccino": 4.20, "Espresso": 2.90, 
        "Espresso Lungo": 3.20, "Americano": 3.50, "Flat White": 4.50, 
        "Iced Matcha Latte": 5.50, "Iced Protein Matcha": 5.90, 
        "Holy Eistee": 4.90, "Iced Coffee": 3.90, "Iced Latte": 4.50 
    };
    const rawPrice = starbucksPreise[order.coffee] !== undefined ? starbucksPreise[order.coffee] : 4.00;
    const formattedPrice = rawPrice.toFixed(2) + "€";

    document.getElementById('receipt-item-name').innerText = order.coffee;
    document.getElementById('receipt-date').innerText = order.dateString;
    document.getElementById('receipt-price').innerText = formattedPrice;
    document.getElementById('receipt-id').innerText = new Date(order.timestamp).getTime().toString().slice(-4);

    const extrasContainer = document.getElementById('receipt-extras-container');
    extrasContainer.innerHTML = "";
    
    if (order.details && Array.isArray(order.details)) {
        order.details.forEach(extra => {
            const row = document.createElement('div');
            row.className = 'receipt-row';
            row.style.fontSize = '0.85rem';
            row.style.color = '#666';
            row.innerHTML = `<span>+ ${extra}</span><span>0.00€</span>`;
            extrasContainer.appendChild(row);
        });
    }

    const savedEl = document.getElementById('receipt-saved');
    if (savedEl) savedEl.innerText = "-" + formattedPrice;

    const receiptModal = document.getElementById('receipt-modal');
    receiptModal.style.display = 'flex';

    / --- NEU: STEMPEL LOGIK ---
    const stamp = document.getElementById('receipt-stamp');
    
    // Wir prüfen den Status. 
    // Wenn du im Admin-Panel auf "Fertig" drückst, setzt du den Status hoffentlich auf 'archived' oder 'done'
    if (order.status === 'archived' || order.status === 'done' || order.status === 'completed') {
        stamp.classList.add('visible');
        stamp.innerText = "ERLEDIGT"; // Oder "GEBRÜHT"
    } else {
        stamp.classList.remove('visible');
    }

    // Modal öffnen
    const receiptModal = document.getElementById('receipt-modal');
    receiptModal.style.display = 'flex';
}
}

window.closeReceipt = function() {
    document.getElementById('receipt-modal').style.display = 'none';
}

// --- HOLY EISTEE MODAL ---
window.openHolyInfo = function() {
    const modal = document.getElementById('info-modal-holy');
    if(modal) modal.style.display = 'flex';
}

window.closeHolyInfo = function() {
    const modal = document.getElementById('info-modal-holy');
    if(modal) modal.style.display = 'none';
}
