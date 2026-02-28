/* Chatbot Logic for Sportify Spots */
(function() {
    // Conversation state keeps the guided booking steps on track
    const convoState = {
        mode: 'idle',
        sport: null,
        date: null,
        time: null
    };

    // Build Chatbot UI
    const chatbotHTML = `
        <div class="chatbot-container">
            <div class="chatbot-button" id="chatbotBtn">
                <svg viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c-1.1 0-2-.9-2-2z"/>
                </svg>
            </div>
            <div class="chatbot-window" id="chatbotWindow">
                <div class="chatbot-header">
                    <h3>Sportify Helper</h3>
                    <span class="close-chat" id="closeChat">&times;</span>
                </div>
                <div class="chatbot-messages" id="chatbotMessages">
                    <div class="message bot-message">
                        Hi! Welcome to Sportify Spots, Angondhalli. How can I help? (Book a ground / Check availability / Pricing / Location / FAQs)
                    </div>
                </div>
                <div class="typing-indicator" id="typingIndicator" style="padding: 0 20px;">Sportify is typing...</div>
                <div class="chatbot-input">
                    <input type="text" id="chatInput" placeholder="Type a message...">
                    <button class="send-btn" id="sendChat">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const chatbotBtn = document.getElementById('chatbotBtn');
    const chatbotWindow = document.getElementById('chatbotWindow');
    const closeChat = document.getElementById('closeChat');
    const chatInput = document.getElementById('chatInput');
    const sendChat = document.getElementById('sendChat');
    const messagesContainer = document.getElementById('chatbotMessages');
    const typingIndicator = document.getElementById('typingIndicator');

    chatbotBtn.addEventListener('click', () => {
        chatbotWindow.classList.toggle('active');
    });

    closeChat.addEventListener('click', () => {
        chatbotWindow.classList.remove('active');
    });

    function sendMessage() {
        const text = chatInput.value.trim();
        if (text === '') return;

        appendMessage(text, 'user');
        chatInput.value = '';

        showTyping(true);
        setTimeout(() => {
            const response = getBotResponse(text);
            showTyping(false);
            appendMessage(response, 'bot');
        }, 500);
    }

    function appendMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message');
        msgDiv.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
        msgDiv.innerText = text;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showTyping(show) {
        typingIndicator.style.display = show ? 'block' : 'none';
    }

    function detectSport(query) {
        const sports = ['cricket', 'football', 'badminton', 'basketball', 'tennis', 'multi-sport', 'multi sport'];
        const found = sports.find(s => query.includes(s));
        return found ? (found === 'multi sport' ? 'Multi-Sport' : capitalize(found)) : null;
    }

    function detectDate(query) {
        const dateMatch = query.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
        return dateMatch ? dateMatch[1] : null;
    }

    function detectTime(query) {
        const timeMatch = query.match(
            /\b((1[0-2]|0?[1-9]):[0-5][0-9]\s?(am|pm))\b|\b((1[0-2]|0?[1-9])\s?(am|pm))\b|\b((2[0-3]|[0-1]?[0-9]):[0-5][0-9])\b|\b((2[0-3]|[0-1]?[0-9])\s?(hrs|hours))\b/i
        );
        if (!timeMatch) return null;
        const groups = timeMatch.slice(1).filter(Boolean);
        return groups.length ? groups[0] : null;
    }

    function resetBooking() {
        convoState.mode = 'idle';
        convoState.sport = null;
        convoState.date = null;
        convoState.time = null;
    }

    function capitalize(text) {
        return text.replace(/(^\w|\s\w)/g, m => m.toUpperCase());
    }

    function bookingFlowResponse(query) {
        const detectedSport = detectSport(query);
        const detectedDate = detectDate(query);
        const cleanedForTime = detectedDate ? query.replace(detectedDate, ' ') : query;
        const detectedTime = detectTime(cleanedForTime);

        if (detectedSport) convoState.sport = convoState.sport || detectedSport;
        if (detectedDate) convoState.date = convoState.date || detectedDate;
        if (detectedTime) convoState.time = convoState.time || detectedTime;

        if (!convoState.sport) {
            return 'Great, let us book your slot. Which sport? Options: Cricket, Football, Badminton, Basketball, Tennis, Multi-Sport.';
        }
        if (!convoState.date) {
            return `Sport: ${convoState.sport}. What date suits you? (e.g., YYYY-MM-DD)`;
        }
        if (!convoState.time) {
            return `Sport: ${convoState.sport} on ${convoState.date}. Preferred time slot? (e.g., 6:00 PM)`;
        }

        return `Please confirm: Sport - ${convoState.sport}; Date - ${convoState.date}; Time - ${convoState.time}. Reply "confirm" to proceed. Slots are limited.`;
    }

    function confirmedResponse() {
        const summary = `Sport - ${convoState.sport}; Date - ${convoState.date}; Time - ${convoState.time}`;
        resetBooking();
        return `${summary} noted. Go to Grounds > choose your venue > tap "Book Now" to pay and finalize. Need help picking a ground in Angondhalli, Bangalore? I can suggest top options.`;
    }

    function shortHelp() {
        return 'I handle ground booking, availability, pricing, and location for Sportify Spots. Tell me the sport, date, and time to book.';
    }

    function getBotResponse(input) {
        const query = input.toLowerCase();
        const sportDetected = detectSport(query);
        const wantsBooking = ['book', 'booking', 'reserve', 'slot', 'availability', 'ground', 'play'].some(k => query.includes(k));

        if (sportDetected) {
            convoState.sport = convoState.sport || sportDetected;
            convoState.mode = 'booking';
        } else if (wantsBooking) {
            convoState.mode = 'booking';
        }

        if (convoState.mode === 'booking') {
            if (query.includes('confirm') && convoState.sport && convoState.date && convoState.time) {
                return confirmedResponse();
            }
            return bookingFlowResponse(query);
        }

        if (query.includes('price') || query.includes('pricing')) {
            return 'Typical rates: Rs 800 to Rs 2000 per hour depending on sport, turf, and time. Membership cuts 10-20%. Want me to check a slot for you?';
        }
        if (query.includes('membership') || query.includes('plan')) {
            return 'We offer PRO (10% off) and PRO PLUS (20% off). You get priority slots and savings on every booking. Ready to book with a plan?';
        }
        if (query.includes('location') || query.includes('where')) {
            return 'We operate in Angondhalli, Bangalore and nearby turfs. Need directions to a specific ground?';
        }
        if (query.includes('faq') || query.includes('help')) {
            return shortHelp();
        }
        if (query.includes('hi') || query.includes('hello') || query.includes('hey')) {
            return 'Hi! I can book Cricket, Football, Badminton, Basketball, Tennis, or Multi-Sport. Shall I start a booking?';
        }

        return 'I focus on Sportify Spots bookings. Tell me the sport, date, and preferred time, and I will guide you to payment.';
    }

    sendChat.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

})();
