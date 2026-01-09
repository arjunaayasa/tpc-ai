
// import fetch from 'node-fetch'; // Built-in in Node 18+

async function testHistory() {
    const baseUrl = 'http://localhost:3000/api/rag/stream';

    console.log('--- Turn 1: Introduction ---');
    const res1 = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: "Halo, nama saya Budi. Saya ingin bertanya tentang pajak.",
            history: [],
            mode: 'strict',
            enableThinking: false
        })
    });

    if (!res1.ok) throw new Error(`Turn 1 failed: ${res1.statusText}`);
    const text1 = await res1.text();
    // Simple parse of SSE data (just looking for the final answer or accumulating content)
    // For quick test, let's just assume the AI acknowledges it.
    console.log('Response 1 received (preview):', text1.slice(0, 200));

    // Construct history for Turn 2
    // We'll fake the assistant response to save parsing time, or just rely on the user message history.
    // The API doesn't validate if "assistant" matched real output.
    const history = [
        { role: 'user', content: "Halo, nama saya Budi. Saya ingin bertanya tentang pajak." },
        { role: 'assistant', content: "Halo Budi! Saya TPC AI siap membantu." }
    ];

    console.log('\n--- Turn 2: Recall ---');
    const res2 = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            question: "Siapa nama saya?",
            history: history, // sending history
            mode: 'strict',
            enableThinking: false
        })
    });

    if (!res2.ok) throw new Error(`Turn 2 failed: ${res2.statusText}`);
    const stream2 = res2.body;
    if (!stream2) throw new Error('No body');

    // Print stream
    const decoder = new TextDecoder();
    for await (const chunk of stream2) {
        const text = chunk.toString();
        // Look for "answer" event
        if (text.includes('"content":')) {
            process.stdout.write(text);
        }
    }
}

testHistory().catch(console.error);
