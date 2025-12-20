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
        // Wenn man nicht eingeloggt ist, ab zur Landing Page (index.html) oder Login
        // Nur weiterleiten, wenn wir nicht schon dort sind, um Endlosschleifen zu vermeiden
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
    "default": { stufen: false, cycles: false }
};

const kaffeeSorten = [
    { name: "Kaffee", configKey: "Kaffee", strength: 3, desc: "Der zeitlose Klassiker." },
    { name: "Café Crema", configKey: "Café Crema", strength: 3, desc: "Langer Genuss mit Crema-Krone." },
    { name: "Espresso Lungo", configKey: "Espresso Lungo", strength: 4, desc: "Verlängertes Aromawunder." },
    { name: "Espresso", configKey: "Espresso", strength: 5, desc: "Der kleine Starke." },
    { name: "Latte Macchiato", configKey: "Latte Macchiato", strength: 2, desc: "Viel heiße Milch & Espresso." },
    { name: "Milchkaffee", configKey: "Milchkaffee", strength: 2, desc: "Halb Kaffee, halb Milch." },
    { name: "Cappuccino", configKey: "Cappuccino", strength: 3, desc: "Klassiker mit Milchschaumhaube." },
    { name: "Americano", configKey: "Americano", strength: 3, desc: "Espresso mit Wasser verlängert." },
    { name: "Iced Matcha Latte", configKey: "Matcha", strength: 0, desc: "Grüner Tee auf Eis & Milch." },
    { name: "Iced Protein Matcha", configKey: "Matcha", strength: 0, desc: "Matcha Latte mit Protein-Kick." },
    { name: "Flat White", configKey: "default", strength: 4, desc: "Doppelter Ristretto mit Mikroschaum." },
    { name: "Iced Coffee", configKey: "default", strength: 3, desc: "Frisch gebrüht auf Eis." },
    { name: "Iced Latte", configKey: "default", strength: 2, desc: "Espresso auf kalter Milch & Eis." },
    { name: "Milchschaum", configKey: "default", strength: 0, desc: "Purer Schaum." },
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

    if (config.stufen) {
        customContainer.innerHTML += `
            <div class="form-group">
                <label class="form-label">Intensität: <span id="strength-val" class="range-value">3</span></label>
                <input type="range" id="input-strength" min="1" max="6" value="3" oninput="document.getElementById('strength-val').innerText=this.value">
            </div>`;
    }
    
    if (config.ml_kaffee) customContainer.innerHTML += createSelect('input-coffee-vol', 'Kaffeemenge', config.ml_kaffee, ' ml');
    if (config.ml_milch) customContainer.innerHTML += createSelect('input-milk-vol', 'Milchmenge', config.ml_milch, ' ml');
    if (config.ml_gesamt) customContainer.innerHTML += createSelect('input-total-vol', 'Größe', config.ml_gesamt, ' ml');
    
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

    // --- MATCHA vs KAFFEE OPTIONEN ---
    let extraOptionHtml = "";
    
    if (sorte.name.includes("Matcha") || sorte.name.includes("Iced")) {
        extraOptionHtml = `<label class="checkbox-item"><input type="checkbox" id="extra-ice" onchange="updateVisualsFromInputs()"> mit Eiswürfeln 🧊</label>`;
    } else {
        extraOptionHtml = `<label class="checkbox-item"><input type="checkbox" id="extra-shot" onchange="updateVisualsFromInputs()"> Extra Shot</label>`;
    }

    // --- CHECKBOXEN FÜR SIRUP & SÜSSSTOFF (Mit onchange!) ---
    customContainer.innerHTML += `
        <div class="form-group">
            <label class="form-label">Sonderwunsch / Ort</label>
            <input type="text" id="order-comment" class="modal-input" placeholder="z.B. Im Garten, ohne Keks..." autocomplete="off">
        </div>
        <div class="form-group" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(212, 180, 131, 0.3);">
            <label class="form-label">Extras</label>
            <div class="checkbox-group">
                <label class="checkbox-item"><input type="checkbox" id="extra-vanilla" onchange="updateVisualsFromInputs()"> mit Vanille Sirup</label>
                <label class="checkbox-item"><input type="checkbox" id="extra-sweetener" onchange="updateVisualsFromInputs()"> mit Süßstoff</label>
                ${extraOptionHtml}
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
    
    const shotCheckbox = document.getElementById('extra-shot');
    const iceCheckbox = document.getElementById('extra-ice');
    const vanillaCheckbox = document.getElementById('extra-vanilla');
    const sweetCheckbox = document.getElementById('extra-sweetener');

    let coffeeMl = coffeeSelect ? parseInt(coffeeSelect.value) : 0;
    let milkMl = milkSelect ? parseInt(milkSelect.value) : 0;
    
    if (totalSelect && totalSelect.value) {
        const val = parseInt(totalSelect.value);
        if (currentName.includes("Matcha")) {
            coffeeMl = val * 0.20; 
            milkMl = val * 0.80;   
        } else {
            coffeeMl = val; 
        }
    }

    let extras = [];
    if(shotCheckbox && shotCheckbox.checked) extras.push("Extra Shot");
    if(vanillaCheckbox && vanillaCheckbox.checked) extras.push("Vanille");
    if(sweetCheckbox && sweetCheckbox.checked) extras.push("Süßstoff");
    
    let hasIce = false;
    if(iceCheckbox && iceCheckbox.checked) {
        extras.push("Mit Eis");
        hasIce = true;
    }

    // Wir übergeben alles an die Visual Function
    updateCoffeeVisuals(currentName, extras, coffeeMl, milkMl, hasIce);
}

window.closeOrderModal = function() { 
    const modal = document.getElementById('order-modal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}
window.closeConfirmModal = function() { 
    confirmModal.style.display = 'none'; 
}

// --- VISUAL COFFEE LAB LOGIK 🧪 (V6 - FULL EXTRAS) ---
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

function updateCoffeeVisuals(productName, extras = [], overrideCoffeeMl = 0, overrideMilkMl = 0, hasIce = false) {
    const glass = document.querySelector('.glass-cup');
    const espLayer = document.getElementById('layer-espresso'); 
    if(!glass || !espLayer) return;

    let recipe = coffeeRecipes[productName] || coffeeRecipes["default"];
    let currentRecipe = { ...recipe };

    // --- ABSOLUTE BERECHNUNG ---
    const MAX_GLASS_CAPACITY = 350; 

    if (overrideCoffeeMl > 0 || overrideMilkMl > 0) {
        currentRecipe.esp = (overrideCoffeeMl / MAX_GLASS_CAPACITY) * 100;
        currentRecipe.milk = (overrideMilkMl / MAX_GLASS_CAPACITY) * 100;
        currentRecipe.wat = 0; 
    }

    if (extras.includes("Extra Shot")) {
        currentRecipe.esp += 8; 
    }

    // --- FARB-LOGIK FÜR MATCHA ---
    if (productName.includes("Matcha")) {
        espLayer.style.background = "linear-gradient(to right, #a4c639, #6b8c21)";
    } else {
        espLayer.style.background = ""; 
    }

    // --- EXTRAS RENDERN (Eis, Sirup, Süßstoff) ---
    renderAddons(hasIce, extras);

    document.getElementById('layer-foam').style.height = currentRecipe.foam + '%';
    document.getElementById('layer-espresso').style.height = currentRecipe.esp + '%';
    document.getElementById('layer-water').style.height = currentRecipe.wat + '%';
    document.getElementById('layer-milk').style.height = currentRecipe.milk + '%';

    if (productName.includes("Iced")) {
        glass.classList.remove('hot');
    } else {
        glass.classList.add('hot');
    }
}

// 🧪 RENDER FUNKTION FÜR ALLE EXTRAS
function renderAddons(hasIce, extras) {
    const glass = document.querySelector('.glass-cup');
    if(!glass) return;

    // 1. Alte Elemente löschen (damit Animation bei Toggle neu startet)
    const toRemove = glass.querySelectorAll('.ice-cube, .syrup-drop, .sweetener-pill');
    toRemove.forEach(el => el.remove());

    // 2. Eiswürfel
    if(hasIce) {
        for(let i=1; i<=3; i++) {
            const ice = document.createElement('div');
            ice.className = `ice-cube ice-${i}`;
            ice.style.setProperty('--rot', (Math.random() * 20 - 10) + 'deg');
            glass.appendChild(ice);
        }
    }

    // 3. Vanille Sirup (Goldener Tropfen)
    if(extras.includes("Vanille")) {
        const drop = document.createElement('div');
        drop.className = 'syrup-drop';
        glass.appendChild(drop);
    }

    // 4. Süßstoff (Tablette)
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

    let detailString = details.length > 0 ? ` (${details.join(', ')})` : "";
    let messageBody = `${userName} möchte: ${currentCoffee.name}${detailString}`;
    if(comment) messageBody += `\n💬 "${comment}"`;

    if(sendBtn) sendBtn.innerText = "Sende...";

    push(ref(db, 'orders'), {
        user: userName,
        coffee: currentCoffee.name,
        details: details,
        comment: comment,
        timestamp: Date.now(),
        dateString: new Date().toLocaleString()
    });

    if (currentUser) {
        const starbucksPreise = { "Kaffee": 3.50, "Café Crema": 3.90, "Latte Macchiato": 4.50, "Milchkaffee": 4.20, "Cappuccino": 4.20, "Espresso": 2.90, "Espresso Lungo": 3.20, "Americano": 3.50, "Flat White": 4.50, "Iced Matcha Latte": 5.50, "Iced Protein Matcha": 5.90, "Iced Coffee": 3.90, "Iced Latte": 4.50 };
        const preis = starbucksPreise[currentCoffee.name] !== undefined ? starbucksPreise[currentCoffee.name] : 4.00;
        push(ref(db, `users/${currentUser.uid}/history`), {
            product: currentCoffee.name,
            timestamp: Date.now(),
            saved: preis
        });
    }

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

    fetch(`https://ntfy.sh/${TOPIC_NAME}`, {
        method: 'POST',
        body: messageBody, 
        headers: { 'Title': 'Neue Bestellung', 'Priority': 'high', 'Tags': 'coffee' }
    })
    .then(response => {
        if (response.ok) {
            const modal = document.getElementById('order-modal');
            modal.style.display = 'none'; // Sicher schließen
            modal.classList.remove('show');
            document.getElementById('confirm-details').innerText = messageBody;
            confirmModal.style.display = 'flex';
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

    card.className = ""; 

    if (status === 'new') {
        card.classList.add('ls-new');
        icon.innerText = "⏳";
        title.innerText = "Warten...";
        desc.innerText = `Deine Bestellung (${coffeeName}) ist eingegangen.`;
    } 
    else if (status === 'preparing') {
        card.classList.add('ls-preparing', 'pulse-anim');
        icon.innerText = "☕💨"; 
        title.innerText = "Wird gebrüht...";
        desc.innerText = "Der Barista ist an der Arbeit!";
    } 
    else if (status === 'ready') {
        card.classList.add('ls-ready');
        icon.innerText = "✅";
        title.innerText = "Wird serviert!";
        if (lastStatus !== 'ready') {
            try {
                const audio = new Audio('assets/audio/ding.mp3');
                audio.play();
                if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } catch(e) {}
        }
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
    html += `<select id="${id}" class="modal-select" onchange="updateVisualsFromInputs()">`; // <-- WICHTIG!
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

// ============================================
//   LEBENDIGES GETRÄNK (GYROSCOPE) 🌊
// ============================================

let gyroPermissionAsked = false;

// Funktion, um die Sensoren zu starten
function initGyroscope() {
    // Check für iOS 13+ (braucht Erlaubnis)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                if (response === 'granted') {
                    window.addEventListener('deviceorientation', handleTilt);
                }
            })
            .catch(console.error);
    } else {
        // Android & ältere Geräte (funktioniert meist sofort)
        window.addEventListener('deviceorientation', handleTilt);
    }
}

// Die eigentliche Logik beim Wackeln
function handleTilt(event) {
    const glass = document.querySelector('.glass-cup');
    // Wir wackeln nur, wenn das Glas auch sichtbar ist!
    if(!glass || glass.offsetParent === null) return; 

    // Gamma ist die Neigung links/rechts (-90 bis 90)
    let tilt = event.gamma; 

    // Begrenzung, damit das Getränk nicht "looping" macht (Max 25 Grad)
    if (tilt > 25) tilt = 25;
    if (tilt < -25) tilt = -25;

    // Wir runden den Wert für bessere Performance
    tilt = Math.round(tilt);

    // Auf alle Flüssigkeiten anwenden
    const liquids = document.querySelectorAll('.liquid');
    
    // SkewY sieht bei Flüssigkeiten oft realistischer aus als Rotate
    // Scale 1.1 verhindert weiße Blitzer an den Rändern
    liquids.forEach(layer => {
        layer.style.transform = `rotate(${tilt}deg) scale(1.1)`;
    });
    
    // Optional: Auch die Eiswürfel und Drops leicht mitbewegen (Parallax)
    const floatingItems = document.querySelectorAll('.ice-cube, .syrup-drop, .sweetener-pill');
    floatingItems.forEach(item => {
        // Die Items bewegen sich leicht in die entgegengesetzte Richtung (Trägheit)
        const moveX = tilt * 0.5; 
        item.style.marginLeft = `${moveX}px`;
    });
}
