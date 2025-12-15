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

// AUTH & TÜRSTEHER (Zusammengeführt!)
let currentUser = null;
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("Eingeloggt:", user.displayName);
        
        // Name im Footer
        const footerName = document.getElementById('footer-user-name');
        if(footerName) footerName.innerText = user.displayName;

        // Features starten
        if(typeof monitorMyOrder === "function") monitorMyOrder();
        listenToFavorites();
        monitorStampCard();
    } else {
        window.location.href = "login.html";
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
const customOptionsDiv = document.getElementById('custom-options');
const confirmModal = document.getElementById('confirmation-modal');
const closedMessageBox = document.getElementById('closed-message-box');

let currentCoffee = null;
let isShopOpen = true; 

// FIREBASE STATUS CHECK
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
    statusBadge.className = 'status-badge status-open';
    statusText.innerText = 'Barista ist bereit';
    statusDot.className = 'status-dot dot-green';
    container.classList.remove('shop-closed-mode');
    if(closedMessageBox) closedMessageBox.style.display = 'none';
}

function setShopClosed() {
    isShopOpen = false;
    statusBadge.className = 'status-badge status-closed';
    statusText.innerText = 'Kaffeebar geschlossen';
    statusDot.className = 'status-dot dot-red';
    container.classList.add('shop-closed-mode');
    if(closedMessageBox) closedMessageBox.style.display = 'block';
}

// MASCHINEN DATEN
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
    { name: "Ristretto", configKey: "default", strength: 5, desc: "Ultrakurzer Extrakt." },
    { name: "Flat White", configKey: "default", strength: 4, desc: "Doppelter Ristretto mit Mikroschaum." },
    { name: "Iced Coffee", configKey: "default", strength: 3, desc: "Frisch gebrüht auf Eis." },
    { name: "Iced Latte", configKey: "default", strength: 2, desc: "Espresso auf kalter Milch & Eis." },
    { name: "Milchschaum", configKey: "default", strength: 0, desc: "Purer Schaum." },
    { name: "Heißes Wasser", configKey: "default", strength: 0, desc: "Für Tee." },
    { name: "To-Go-Becher", configKey: "default", strength: 0, desc: "Für unterwegs." }
];

// GLOBAL: MODAL LOGIK
window.openOrderModal = function(sorteName) {
    const sorte = kaffeeSorten.find(k => k.name === sorteName);
    if(!sorte || !isShopOpen) return;

    currentCoffee = sorte;
    document.getElementById('modal-coffee-title').innerText = sorte.name;
    customOptionsDiv.innerHTML = "";

    const config = maschinenDaten[sorte.configKey] || maschinenDaten['default'];

    if (config.stufen) {
        customOptionsDiv.innerHTML += `
            <div class="form-group">
                <label class="form-label">Intensität: <span id="strength-val" class="range-value">3</span></label>
                <input type="range" id="input-strength" min="1" max="6" value="3" oninput="document.getElementById('strength-val').innerText=this.value">
            </div>`;
    }
    if (config.ml_kaffee) customOptionsDiv.innerHTML += createSelect('input-coffee-vol', 'Kaffeemenge', config.ml_kaffee, ' ml');
    if (config.ml_milch) customOptionsDiv.innerHTML += createSelect('input-milk-vol', 'Milchmenge', config.ml_milch, ' ml');
    if (config.ml_gesamt) customOptionsDiv.innerHTML += createSelect('input-total-vol', 'Größe', config.ml_gesamt, ' ml');
    
    if (config.cycles) {
        customOptionsDiv.innerHTML += `
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
    customOptionsDiv.innerHTML += `
        <div class="form-group">
            <label class="form-label">Sonderwunsch / Ort</label>
            <input type="text" id="order-comment" class="modal-input" placeholder="z.B. Im Garten, ohne Keks..." autocomplete="off">
        </div>
        <div class="form-group" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(212, 180, 131, 0.3);">
            <label class="form-label">Extras</label>
            <div class="checkbox-group">
                <label class="checkbox-item"><input type="checkbox" id="extra-vanilla"> mit Vanille Sirup</label>
                <label class="checkbox-item"><input type="checkbox" id="extra-sweetener"> mit Süßstoff</label>
            </div>
        </div>`;
    
    orderModal.style.display = 'flex';
}

window.closeOrderModal = function() { orderModal.style.display = 'none'; }
window.closeConfirmModal = function() { confirmModal.style.display = 'none'; }

// --- DAMPF FUNKTION ---
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

// --- SCHNEE FUNKTION ---
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

// --- AGENT WERKZEUG: Letzte Bestellung finden ---
async function repeatLastOrder() {
    if (!currentUser) return "Du musst eingeloggt sein!";
    const ordersRef = ref(db, 'orders');
    return new Promise((resolve) => {
        const unsubscribe = onValue(ordersRef, (snapshot) => {
            const data = snapshot.val();
            unsubscribe();
            if (!data) { resolve("Keine alten Bestellungen."); return; }
            const orderList = Object.values(data);
            const myOrders = orderList.filter(o => o.user === currentUser.displayName);
            if (myOrders.length === 0) { resolve("Noch nie bestellt!"); return; }
            const lastOrder = myOrders.sort((a, b) => b.timestamp - a.timestamp)[0];
            const coffeeObj = kaffeeSorten.find(k => k.name === lastOrder.coffee);
            if (coffeeObj) {
                currentCoffee = coffeeObj;
                const commentInput = document.getElementById('order-comment');
                if(commentInput) commentInput.value = lastOrder.comment || "";
                sendOrder(); 
                resolve(`Deine letzte Bestellung (${lastOrder.coffee}) wird zubereitet!`);
            } else { resolve("Den Kaffee gibt es nicht mehr."); }
        });
    });
}

// --- GLOBAL: SEND LOGIK ---
window.sendOrder = function() {
    // DAMPF
    createSteamEffect();

    // SOUND (Mahlwerk)
    try {
        const sound = new Audio('assets/audio/grinding.mp3');
        sound.volume = 0.6;
        sound.play();
    } catch (e) { console.log("Sound-Fehler:", e); }

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
    const vanillaEl = document.getElementById('extra-vanilla');
    if(vanillaEl && vanillaEl.checked) details.push("Vanille Sirup");
    const sweetEl = document.getElementById('extra-sweetener');
    if(sweetEl && sweetEl.checked) details.push("Süßstoff");

    let detailString = details.length > 0 ? ` (${details.join(', ')})` : "";
    let messageBody = `${userName} möchte: ${currentCoffee.name}${detailString}`;
    if(comment) messageBody += `\n💬 "${comment}"`;

    sendBtn.innerText = "Sende...";

    // 1. FIREBASE SAVE
    push(ref(db, 'orders'), {
        user: userName,
        coffee: currentCoffee.name,
        details: details,
        comment: comment,
        timestamp: Date.now(),
        dateString: new Date().toLocaleString()
    });

    // 2. STEMPEL HOCHZÄHLEN (Transaction für Sicherheit)
    const countRef = ref(db, `users/${currentUser.uid}/coffeeCount`);
    runTransaction(countRef, (currentCount) => {
        return (currentCount || 0) + 1;
    }).then((result) => {
        // Prüfen, ob die 10 voll sind (Modulo)
        const newCount = result.snapshot.val();
        if (newCount > 0 && newCount % 10 === 0) {
            // PARTY! 🎉
            triggerConfetti();
            // Modal zeigen (kurz verzögert)
            setTimeout(() => {
                const rewardModal = document.getElementById('reward-modal');
                if(rewardModal) rewardModal.style.display = 'flex';
                // Sound abspielen (optional)
                try { new Audio('assets/audio/ding.mp3').play(); } catch(e){}
            }, 500);
        }
    });

    // 2. NTFY PUSH
    fetch(`https://ntfy.sh/${TOPIC_NAME}`, {
        method: 'POST',
        body: messageBody, 
        headers: { 'Title': 'Neue Bestellung', 'Priority': 'high', 'Tags': 'coffee' }
    })
    .then(response => {
        if (response.ok) {
            orderModal.style.display = 'none';
            document.getElementById('confirm-details').innerText = messageBody;
            confirmModal.style.display = 'flex';
            sendBtn.innerText = "Bestellen";
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        } else { throw new Error('Send Error'); }
    })
    .catch(error => {
        sendBtn.innerText = "Bestellen";
        statusDiv.style.display = 'block';
        statusDiv.innerText = `❌ Fehler: ${error.message}`;
        setTimeout(() => statusDiv.style.display = 'none', 6000);
    });
}

// --- GLOBAL: CHATBOT ---
const chatWindow = document.getElementById('chat-window');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');

window.toggleChat = function() {
    if (chatWindow.style.display === 'flex') {
        chatWindow.style.display = 'none';
    } else {
        chatWindow.style.display = 'flex';
        setTimeout(() => chatInput.focus(), 100);
    }
}

window.handleEnter = function(e) {
    if (e.key === 'Enter') window.sendMessage();
}

window.sendMessage = async function() {
    const text = chatInput.value.trim();
    if (!text) return;
    addMessage(text, 'user-msg');
    chatInput.value = "";
    const loadingDiv = addMessage("Barista denkt nach...", 'bot-msg');
    
    try {
        const answer = await fetchGeminiResponse(text);
        loadingDiv.innerText = answer;
    } catch (error) {
        loadingDiv.innerText = "Sorry, Fehler.";
    }
}

function addMessage(text, className) {
    const div = document.createElement('div');
    div.className = `message ${className}`;
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
}

async function fetchGeminiResponse(userQuestion) {
    if (!GEMINI_API_KEY) return "Moment, ich lade noch meinen Schlüssel... Frag gleich nochmal!";

    const menuContext = kaffeeSorten.map(k => `- ${k.name}: ${k.desc} (Stärke: ${k.strength}/5)`).join("\n");
    
    const prompt = `
        Du bist Timo, ein freundlicher Barista-KI-Agent.
        
        DEINE AUFGABE:
        1. Wenn der User fragt "Was gibt es?" oder Infos will -> Antworte basierend auf der Karte.
        2. WICHTIG: Wenn der User sagt "Das Gleiche wie gestern", "Nochmal das Selbe", "Repeat order" oder ähnlich -> 
            Antworte NUR mit dem Wort: ACTION_REORDER
            (Schreibe keinen anderen Text dazu, nur dieses Wort).

        Hier ist unsere Karte:
        ${menuContext}
        
        User Name: ${currentUser ? currentUser.displayName : "Gast"}
        Frage: "${userQuestion}"
        
        Antworte auf Deutsch, kurz und charmant.
    `;
    
    // WIR NEHMEN GEMINI 2.0 (Da es für dich funktionierte)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        
        if (data.error) {
            return `Technik-Fehler: ${data.error.message}`;
        }

        if (data.candidates && data.candidates[0].content) {
            let answer = data.candidates[0].content.parts[0].text.trim();
            
            if (answer.includes("ACTION_REORDER")) {
                addMessage("Moment, ich schaue ins Auftragsbuch... 📖", 'bot-msg');
                const resultText = await repeatLastOrder();
                return resultText;
            }

            return answer;
        }
        
        return "Keine Antwort erhalten.";

    } catch (e) { return `Verbindungs-Fehler: ${e.message}`; }
}

// ============================================
//   LIVE STATUS MONITORING 📡
// ============================================
let lastStatus = ""; // Damit wir Änderungen erkennen

function monitorMyOrder() {
    // Wir hören auf ALLE Bestellungen (einfacher Filter client-seitig)
    const ordersRef = ref(db, 'orders');

    onValue(ordersRef, (snapshot) => {
        const data = snapshot.val();
        const card = document.getElementById('live-status-card');
        
        if (!data || !currentUser) {
            card.style.display = 'none';
            return;
        }

        // 1. Meine Bestellungen finden
        const myOrders = Object.values(data).filter(o => o.user === currentUser.displayName);
        
        // 2. Aktive Bestellung finden (nicht archiviert)
        // Wir nehmen die NEUESTE, die noch nicht 'archived' ist
        const activeOrder = myOrders
            .filter(o => o.status !== 'archived')
            .sort((a, b) => b.timestamp - a.timestamp)[0];

        if (!activeOrder) {
            card.style.display = 'none'; // Nix offen -> Ausblenden
            lastStatus = "";
            return;
        }

        // 3. UI Anzeigen & Aktualisieren
        card.style.display = 'block';
        const status = activeOrder.status || 'new';
        
        updateStatusCard(status, activeOrder.coffee);
    });
}

function updateStatusCard(status, coffeeName) {
    const card = document.getElementById('live-status-card');
    const icon = document.getElementById('ls-icon');
    const title = document.getElementById('ls-title');
    const desc = document.getElementById('ls-desc');

    // Reset Klassen
    card.className = ""; 

    if (status === 'new') {
        card.classList.add('ls-new');
        icon.innerText = "⏳";
        title.innerText = "Warten...";
        desc.innerText = `Deine Bestellung (${coffeeName}) ist eingegangen.`;
    } 
    else if (status === 'preparing') {
        card.classList.add('ls-preparing', 'pulse-anim');
        icon.innerText = "☕💨"; // Dampf Emoji
        title.innerText = "Wird gebrüht...";
        desc.innerText = "Der Barista ist an der Arbeit!";
        
        // Sound abspielen (nur wenn Status neu ist)
        if (lastStatus !== 'preparing') {
            // Optional: Leises Brutzeln oder so
        }
    } 
    else if (status === 'ready') {
        card.classList.add('ls-ready');
        icon.innerText = "✅";
        title.innerText = "Wird serviert!";
    

        // DING SOUND! 🔔
        if (lastStatus !== 'ready') {
            try {
                const audio = new Audio('assets/audio/ding.mp3');
                audio.play();
                // Konfetti oder Vibration wäre hier auch cool
                if(navigator.vibrate) navigator.vibrate([200, 100, 200]);
            } catch(e) {}
        }
    }

    lastStatus = status;
}

// ============================================
//   FAVORITEN LOGIK ❤️
// ============================================

let myFavorites = {}; // Lokaler Speicher für die Herzchen

// 1. Favoriten laden (sobald User eingeloggt)
function listenToFavorites() {
    if (!currentUser) return;
    
    const favRef = ref(db, `users/${currentUser.uid}/favorites`);
    onValue(favRef, (snapshot) => {
        myFavorites = snapshot.val() || {};
        renderAllCards(); // Alles neu zeichnen mit aktuellen Herzen
    });
}

// 2. Herz anklicken (Speichern/Löschen)
window.toggleFavorite = function(coffeeName, event) {
    // WICHTIG: Verhindert, dass sich das Bestell-Modal öffnet
    event.stopPropagation(); 

    if (!currentUser) { alert("Bitte einloggen!"); return; }

    const favRef = ref(db, `users/${currentUser.uid}/favorites/${coffeeName}`);

    if (myFavorites[coffeeName]) {
        // Ist schon Favorit -> Löschen
        remove(favRef);
    } else {
        // Ist kein Favorit -> Hinzufügen
        set(favRef, true);
    }
}

// ============================================
//   KARTEN RENDERN (Menü & Favoriten)
// ============================================

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
        
        // 1. Zur normalen Liste hinzufügen
        const normalCard = document.createElement('div');
        
        // --- HIER IST DIE ÄNDERUNG (Klasse hinzufügen) ---
        normalCard.className = 'coffee-card scroll-reveal'; 
        // ------------------------------------------------
        
        normalCard.onclick = () => window.openOrderModal(sorte.name);
        normalCard.innerHTML = cardHtml;
        menuContainer.appendChild(normalCard);

        if (isFav) {
            hasFavorites = true;
            const favCard = document.createElement('div');
            // Auch Favoriten animieren
            favCard.className = 'coffee-card scroll-reveal'; 
            favCard.onclick = () => window.openOrderModal(sorte.name);
            favCard.innerHTML = cardHtml;
            favContainer.appendChild(favCard);
        }
    });

    favSection.style.display = hasFavorites ? 'block' : 'none';

    // Tilt Effekt starten (falls du den noch hast)
    setTimeout(initTiltEffect, 100);

    // --- HIER NEU: Scroll Reveal starten ---
    // Wir warten kurz (50ms), damit der Browser die Elemente sicher platziert hat
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
    html += `<select id="${id}" class="modal-select">`;
    options.forEach(opt => html += `<option value="${opt}">${opt}${suffix}</option>`);
    html += `</select></div>`;
    return html;
}

// --- ADMIN SCHUTZ ---
window.checkAdminAccess = function() {
    // 1. Passwort abfragen
    const password = prompt("🔒 Admin-Bereich\nBitte Passwort eingeben:");
    
    // 2. Prüfen (Hier dein Passwort festlegen!)
    if (password === "09052023") { 
        // Richtig -> Weiterleiten
        window.location.href = "admin.html";
    } else if (password !== null) {
        // Falsch (aber nicht Abbrechen geklickt) -> Fehlermeldung
        alert("Zugang verweigert! Zugriff nur für Admin. ⛔");
    }
          }

// ============================================
//   INFO MODAL (Matcha)
// ============================================
window.openMatchaInfo = function() {
    const modal = document.getElementById('info-modal');
    if(modal) modal.style.display = 'flex';
}

window.closeInfoModal = function() {
    const modal = document.getElementById('info-modal');
    if(modal) modal.style.display = 'none';
}

// ============================================
//   3D TILT EFFECT 🧊
// ============================================

function initTiltEffect() {
    const cards = document.querySelectorAll('.coffee-card');

    cards.forEach(card => {
        card.addEventListener('mousemove', handleHover);
        card.addEventListener('mouseleave', resetCard);
        
        // Für Touchscreens (optional, kann aber hakelig sein beim Scrollen)
        // card.addEventListener('touchmove', handleHover);
        // card.addEventListener('touchend', resetCard);
    });
}

function handleHover(e) {
    const card = this;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    
    // Mausposition relativ zur Karte
    const rect = card.getBoundingClientRect();
    const mouseX = (e.clientX || e.touches[0].clientX) - rect.left;
    const mouseY = (e.clientY || e.touches[0].clientY) - rect.top;

    // Berechnung der Rotation (Maximal 15 Grad Neigung)
    // Mitte der Karte ist 0, links ist negativ, rechts positiv
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;

    const rotateX = yPct * -20; // Neigung oben/unten (invertiert)
    const rotateY = xPct * 20;  // Neigung links/rechts

    // Den Style anwenden
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
}

function resetCard() {
    // Zurück zur Ausgangsposition
    this.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale(1)`;
}

// ============================================
//   SCROLL REVEAL LOGIK ✨
// ============================================

function initScrollReveal() {
    // Der Beobachter: Prüft, ob Elemente sichtbar sind
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Wenn das Element im Bild ist (isIntersecting)
            if (entry.isIntersecting) {
                // Klasse 'visible' hinzufügen -> CSS Animation startet
                entry.target.classList.add('visible');
                // Aufhören zu beobachten (damit es nur 1x passiert)
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1 // Animation startet, sobald 10% des Elements sichtbar sind
    });

    // Alle Elemente mit der Klasse .scroll-reveal suchen und beobachten
    document.querySelectorAll('.scroll-reveal').forEach(el => {
        observer.observe(el);
    });
}

// ============================================
//   DIGITALE STEMPELKARTE 🎫
// ============================================

// 1. Stempel-Logik überwachen (Live-Update)
function monitorStampCard() {
    if (!currentUser) return;
    
    const countRef = ref(db, `users/${currentUser.uid}/coffeeCount`);
    onValue(countRef, (snapshot) => {
        const totalCount = snapshot.val() || 0;
        renderStampCard(totalCount);
    });
}

// 2. Karte zeichnen (HTML generieren)
function renderStampCard(totalCount) {
    const grid = document.getElementById('stamp-grid');
    const counterText = document.getElementById('stamp-counter');
    const msgText = document.getElementById('stamp-message');
    
    if(!grid) return; // Falls wir nicht auf der index.html sind

    // Wir schauen immer nur auf den aktuellen 10er Block
    // Beispiel: Bei 13 Kaffees haben wir 3 Stempel auf der aktuellen Karte
    const currentStamps = totalCount % 10;
    const remaining = 10 - currentStamps;

    // Text Updates
    counterText.innerText = `${currentStamps} / 10`;
    
    if (currentStamps === 0 && totalCount > 0) {
        msgText.innerText = "Neue Karte, neues Glück! 🍀";
    } else if (remaining === 0) {
        msgText.innerHTML = "<b>VOLL!</b> Dein nächster Kaffee bringt einen Keks! 🍪";
    } else {
        msgText.innerText = `Noch ${remaining} Kaffees bis zum Gratis-Keks! 🍪`;
    }

    // Kreise generieren
    grid.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const circle = document.createElement('div');
        circle.className = 'stamp-circle';
        
        if (i <= currentStamps) {
            circle.classList.add('active');
            circle.innerText = "☕"; // Stempel-Icon
        } else {
            circle.innerText = i;
        }
        grid.appendChild(circle);
    }
}

// 3. Konfetti Funktion 🎉
function triggerConfetti() {
    const colors = ['#d4b483', '#f2d74e', '#ffffff', '#e74c3c'];
    
    for (let i = 0; i < 100; i++) {
        const conf = document.createElement('div');
        conf.classList.add('confetti');
        
        // Zufällige Position & Farbe
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        conf.style.animationDuration = (Math.random() * 3 + 2) + 's'; // 2-5 Sekunden Fallzeit
        
        document.body.appendChild(conf);
        
        // Aufräumen
        setTimeout(() => conf.remove(), 5000);
    }
}

// Belohnungs-Modal schließen
window.closeRewardModal = function() {
    document.getElementById('reward-modal').style.display = 'none';
}

// ============================================
//   HAPTIC FEEDBACK (Vibration) 📳
// ============================================

// 1. Generelles Klick-Feedback für alle Buttons & Links
document.addEventListener('click', (e) => {
    // Prüfen, ob ein Button oder Link geklickt wurde
    if (e.target.tagName === 'BUTTON' || e.target.closest('a') || e.target.closest('.coffee-card')) {
        // Ganz kurz vibrieren (10ms) - fühlt sich an wie ein "Tick"
        if (navigator.vibrate) navigator.vibrate(10);
    }
});

// 2. Erfolgsvibration für Bestellungen
// Suche deine 'sendOrder' Funktion und füge das im Erfolgs-Fall hinzu:
/* In der .then(response => { ... }) Klammer, direkt unter confirmModal.style.display = 'flex':
   
   if (navigator.vibrate) navigator.vibrate([50, 30, 50]); // Zweimal kurz brummen
*/
