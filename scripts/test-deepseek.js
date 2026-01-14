// Test DeepSeek Reasoner API response format
require('dotenv').config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

async function testDeepSeekReasoner() {
    console.log('Testing DeepSeek Reasoner API...\n');

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-reasoner',
            messages: [
                { role: 'user', content: 'Halo, apa kabar?' }
            ],
            stream: true,
            max_tokens: 500,
        }),
    });

    if (!response.ok) {
        console.error('Error:', response.status, await response.text());
        return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let allReasoningContent = '';
    let allContent = '';

    console.log('=== STREAMING RESPONSE ===\n');

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0];

                if (choice?.delta?.reasoning_content) {
                    process.stdout.write(`[REASONING] ${choice.delta.reasoning_content}`);
                    allReasoningContent += choice.delta.reasoning_content;
                }

                if (choice?.delta?.content) {
                    process.stdout.write(`[CONTENT] ${choice.delta.content}`);
                    allContent += choice.delta.content;
                }
            } catch (e) {
                // console.error('Parse error:', e.message);
            }
        }
    }

    console.log('\n\n=== SUMMARY ===');
    console.log('reasoning_content length:', allReasoningContent.length);
    console.log('content length:', allContent.length);
    console.log('\n--- REASONING CONTENT ---');
    console.log(allReasoningContent || '(empty)');
    console.log('\n--- CONTENT ---');
    console.log(allContent || '(empty)');
}

testDeepSeekReasoner().catch(console.error);
