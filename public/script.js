const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");

// Menyimpan riwayat percakapan agar AI ingat konteks sebelumnya
let conversationHistory = [];

// Otomatis menyesuaikan tinggi textarea saat mengetik
userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
});

// Kirim pesan dengan tombol Enter (Shift+Enter untuk baris baru)
userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        chatForm.requestSubmit();
    }
});

// Fungsi menambah gelembung chat ke layar
function appendMessage(role, text = "") {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role === "user" ? "user-message" : "bot-message");

    const bubbleDiv = document.createElement("div");
    bubbleDiv.classList.add("bubble");
    bubbleDiv.textContent = text;

    messageDiv.appendChild(bubbleDiv);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    return bubbleDiv;
}

// Tombol bersihkan chat
clearBtn.addEventListener("click", () => {
    conversationHistory = [];
    chatBox.innerHTML = `
        <div class="message bot-message">
            <div class="bubble">
                Percakapan dibersihkan. Silakan mulai topik baru!
            </div>
        </div>
    `;
});

// Proses kirim pesan dan terima streaming SSE dari backend
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = userInput.value.trim();
    if (!text) return;

    // Tampilkan pesan user & reset input
    appendMessage("user", text);
    conversationHistory.push({ role: "user", content: text });

    userInput.value = "";
    userInput.style.height = "auto";
    userInput.disabled = true;
    sendBtn.disabled = true;

    // Buat bubble kosong untuk menampung jawaban bot secara live
    const botBubble = appendMessage("bot", "Mengetik...");
    let fullBotResponse = "";
    let isFirstChunk = true;
    let streamDone = false;

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: conversationHistory })
        });

        if (!response.ok) {
            let message = "Gagal terhubung ke server.";
            try {
                const errData = await response.json();
                if (typeof errData.error === "string") {
                    message = errData.error;
                } else if (errData.error?.message) {
                    message = errData.error.message;
                }
            } catch (_) {
                // Respons error bukan JSON, pakai pesan default
            }
            throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;

                const data = trimmed.replace(/^data:\s*/, "");
                if (data === "[DONE]") {
                    streamDone = true;
                    break;
                }

                try {
                    const parsedText = JSON.parse(data);
                    if (isFirstChunk) {
                        botBubble.textContent = "";
                        isFirstChunk = false;
                    }
                    fullBotResponse += parsedText;
                    botBubble.textContent = fullBotResponse;
                    chatBox.scrollTop = chatBox.scrollHeight;
                } catch (err) {
                    console.error("Error parsing chunk:", err);
                }
            }
        }

        // Kalau tidak ada teks sama sekali dari server
        if (isFirstChunk) {
            botBubble.textContent = "Maaf, tidak ada balasan dari server.";
        }

        // Simpan jawaban lengkap AI ke riwayat percakapan
        if (fullBotResponse) {
            conversationHistory.push({ role: "assistant", content: fullBotResponse });
        }
    } catch (error) {
        console.error(error);
        botBubble.textContent = "Error: " + error.message;
        botBubble.classList.add("error");
        // Batalkan pesan user terakhir agar riwayat tidak rusak
        conversationHistory.pop();
    } finally {
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
        chatBox.scrollTop = chatBox.scrollHeight;
    }
});